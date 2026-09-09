// GHARPAYY OCR ENGINE 2.0 — temporary image, permanent observation.
//
// Screenshot  = disposable evidence (hash + metadata kept, raw dropped fast)
// Observation = permanent structured row extracted from a screenshot
// Customer    = permanent identity, deduplicated by normalized phone
// Claim       = temporary, globally unique work ownership
//
// One number appears in twenty screenshots -> ONE customer, twenty observations
// (collapsed by fingerprint when nothing actually changed).
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { VisionRawRow } from "@/lib/draft-vision.functions";
import { resolveTimestamp, type TimestampPrecision } from "@/finalmoment/vision";

export type IdentityState = "verified" | "probable" | "provisional" | "ambiguous" | "invalid";
export type Movement = "new" | "progressed" | "same" | "stuck" | "revived" | "closed";
export type Intent = "hot" | "medium" | "low";
export type Health = "moving" | "stuck" | "dormant" | "revived";
export type DraftSuggestion = "D1" | "D2" | "D3" | "D4";

export interface OcrCustomer {
  id: string;
  normalizedPhone: string | null;
  last4: string | null;
  name: string | null;
  waAccounts: string[];
  identityState: IdentityState;
  firstSeen: string;
  lastSeen: string;
  appearances: number;
  lastMessage: string | null;
  lastMessageAt: string | null;
  intent: Intent;
  health: Health;
  stage: string;
  stuckReason: string | null;
  movement: Movement;
  draft: DraftSuggestion;
  unread: number;
  /** operator marked this row as not a real lead */
  rejected?: boolean;
  rejectedReason?: string;
}

export interface OcrObservation {
  id: string;
  screenshotId: string;
  batchId: string;
  customerId: string;
  visibleName: string | null;
  visiblePhone: string | null;
  normalizedPhone: string | null;
  lastMessage: string | null;
  messageType: string | null;
  messageDirection: string | null;
  timestampRaw: string | null;
  timestampResolved: string | null;
  timestampPrecision: TimestampPrecision;
  capturedAt: string;
  unreadCount: number;
  isPinned: boolean;
  rowPosition: number;
  waAccount: string;
  ocrConfidence: number;
  identityConfidence: number;
  identityState: IdentityState;
  draftSuggestion: DraftSuggestion;
  fingerprint: string;
  seenCount: number;
  firstSeen: string;
  lastSeen: string;
  movement: Movement;
}

export type ScreenshotStatus =
  | "uploaded" | "duplicate" | "extracted" | "saved" | "raw-deleted" | "failed";

export interface OcrScreenshot {
  id: string;
  batchId: string;
  sha256: string;
  uploadedBy: string;
  uploadedAt: string;
  capturedAt: string;
  bytes: number;
  rows: number;
  status: ScreenshotStatus;
  expiresAt: string;
  rawDeletedAt: string | null;
  error?: string;
}

export interface OcrBatch {
  id: string;
  at: string;
  by: string;
  scope: "user" | "admin" | "tower";
  screenshots: number;
  duplicateScreenshots: number;
  rows: number;
  unique: number;
  firstSeen: number;
  existing: number;
  repeats: number;
  phoneVisible: number;
  nameOnly: number;
  unreadChats: number;
  needsReview: number;
  claimed: number;
  ms: number;
}

export interface OcrClaim {
  customerId: string;
  ownerId: string;
  ownerName: string;
  claimedAt: string;
  expiresAt: string;
  status: "active" | "released";
  draft?: DraftSuggestion;
}

export const digits = (s?: string | null) => (s ?? "").replace(/\D/g, "");

/** +91 98765 43210 / 09876543210 / 919876543210 -> 9876543210 */
export function normalizePhone(raw?: string | null): string | null {
  let d = digits(raw);
  if (!d) return null;
  d = d.replace(/^0+/, "");
  if (d.length > 10 && d.startsWith("91")) d = d.slice(2);
  if (d.length > 10) d = d.slice(-10);
  return d.length === 10 ? d : null;
}

const norm = (s?: string | null) =>
  (s ?? "").toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();

export async function sha256(text: string): Promise<string> {
  const buf = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

const HOT = /(book|booking|advance|pay|paid|token|shift|today|tomorrow|visit|come|confirm|available)/i;
const WARM = /(price|rent|budget|photo|details|location|sharing|single|double|deposit|food)/i;
const COLD = /(later|next month|not now|planning|just checking|no thanks|cancel)/i;

const STUCK_RULES: Array<[RegExp, string]> = [
  [/(price|rent|kitna|how much|cost)/i, "Customer asked price — no answer detected"],
  [/(location|address|where|map)/i, "Customer asked location — nothing shared"],
  [/(photo|pics|images|video)/i, "Customer asked photos — nothing shared"],
  [/(visit|tour|come|dekh)/i, "Visit intent — no tour scheduled"],
  [/(deposit|advance)/i, "Deposit objection open"],
  [/(costly|expensive|high|zyada)/i, "Price objection open"],
  [/(available|room|single|sharing)/i, "Property options not shared"],
];

function classifyIntent(text: string | null, unread: number): Intent {
  const t = text ?? "";
  if (HOT.test(t) || unread >= 3) return "hot";
  if (WARM.test(t) || unread > 0) return "medium";
  return "low";
}

function judgeDraft(text: string | null, unread: number, ageMins: number | null): DraftSuggestion {
  let s = 0;
  if (unread > 0) s += 2;
  if (HOT.test(text ?? "")) s += 3;
  else if (WARM.test(text ?? "")) s += 1.5;
  if (COLD.test(text ?? "")) s -= 2;
  if (ageMins != null) {
    if (ageMins < 240) s += 2;
    else if (ageMins < 1440) s += 1;
    else if (ageMins > 7 * 1440) s -= 2;
  }
  return s >= 5 ? "D1" : s >= 3 ? "D2" : s >= 1 ? "D3" : "D4";
}

function stuckReasonFor(text: string | null): string | null {
  if (!text) return null;
  for (const [re, reason] of STUCK_RULES) if (re.test(text)) return reason;
  return null;
}

export interface IngestRow {
  raw: VisionRawRow;
  screenshotId: string;
  batchId: string;
  capturedAt: string;
  waAccount: string;
}

interface EngineState {
  customers: Record<string, OcrCustomer>;
  observations: OcrObservation[];
  screenshots: OcrScreenshot[];
  batches: OcrBatch[];
  claims: Record<string, OcrClaim>;

  /** rows an operator explicitly rejected — feeds the accuracy dashboard */
  rejections: number;

  registerScreenshot: (s: OcrScreenshot) => void;
  findByHash: (sha: string) => OcrScreenshot | undefined;
  ingestRows: (rows: IngestRow[]) => { created: number; updated: number; ids: string[] };
  addBatch: (b: OcrBatch) => void;
  markRawDeleted: (screenshotIds: string[]) => void;

  claim: (
    customerId: string,
    owner: { id: string; name: string },
    draft?: DraftSuggestion,
  ) => { ok: boolean; heldBy?: string };
  release: (customerId: string) => void;
  reject: (customerId: string, reason: string) => void;

  observationsFor: (customerId: string) => OcrObservation[];
  search: (q: string) => OcrCustomer[];
  purgeExpiredRaw: () => number;
}

const RAW_TTL_HOURS = 48;
const CLAIM_TTL_MINS = 90;

export const useOcrEngine = create<EngineState>()(
  persist(
    (set, get) => ({
      customers: {},
      observations: [],
      screenshots: [],
      batches: [],
      claims: {},
      rejections: 0,

      registerScreenshot: (s) => set((st) => ({ screenshots: [s, ...st.screenshots].slice(0, 800) })),
      findByHash: (sha) => get().screenshots.find((s) => s.sha256 === sha),

      addBatch: (b) => set((st) => ({ batches: [b, ...st.batches].slice(0, 200) })),

      markRawDeleted: (ids) =>
        set((st) => ({
          screenshots: st.screenshots.map((s) =>
            ids.includes(s.id) ? { ...s, status: "raw-deleted", rawDeletedAt: new Date().toISOString() } : s,
          ),
        })),

      ingestRows: (rows) => {
        const st = get();
        const customers = { ...st.customers };
        const observations = [...st.observations];
        let created = 0;
        let updated = 0;
        const ids: string[] = [];

        for (const item of rows) {
          const r = item.raw;
          const rawPhone = r.phoneVisible ?? (/\d{6,}/.test(r.displayName ?? "") ? r.displayName : null);
          const phone = normalizePhone(rawPhone);
          const name = r.displayName && !/^\+?[\d\s()\-]+$/.test(r.displayName) ? r.displayName.trim() : null;
          if (!phone && !name) continue;

          // ---- identity: one number = one permanent customer ----
          const key = phone ? `GHP-${phone}` : `TEMP-WA-${norm(name)}-${norm(item.waAccount)}`;
          const identityState: IdentityState = phone
            ? "verified"
            : r.chatType === "group"
              ? "invalid"
              : "provisional";

          const ts = resolveTimestamp(r.visibleTimestampText, item.capturedAt);
          const ageMins = ts.iso ? Math.round((+new Date(item.capturedAt) - +new Date(ts.iso)) / 60000) : null;
          const unread = r.unreadCount ?? (r.unread ? 1 : 0);
          const text = r.lastMessageText ?? null;
          const draft = judgeDraft(text, unread, ageMins);

          const prev = customers[key];
          // ---- movement: what changed since the last observation? ----
          let movement: Movement = "new";
          if (prev) {
            const same = norm(prev.lastMessage) === norm(text);
            const gapDays = prev.lastMessageAt && ts.iso
              ? Math.abs(+new Date(ts.iso) - +new Date(prev.lastMessageAt)) / 86400000
              : 0;
            if (same && gapDays >= 1) movement = "stuck";
            else if (same) movement = "same";
            else if (gapDays > 3) movement = "revived";
            else movement = "progressed";
          }

          const fingerprint = [key, norm(text), r.visibleTimestampText ?? "", unread, item.waAccount].join("|");
          const existingObs = observations.find((o) => o.fingerprint === fingerprint);

          if (existingObs) {
            existingObs.seenCount += 1;
            existingObs.lastSeen = item.capturedAt;
            updated += 1;
          } else {
            observations.unshift({
              id: `${item.screenshotId}-${r.position ?? observations.length}`,
              screenshotId: item.screenshotId,
              batchId: item.batchId,
              customerId: key,
              visibleName: name,
              visiblePhone: rawPhone ?? null,
              normalizedPhone: phone,
              lastMessage: text,
              messageType: r.lastMessageType ?? null,
              messageDirection: r.lastMessageDirection ?? null,
              timestampRaw: r.visibleTimestampText ?? null,
              timestampResolved: ts.iso,
              timestampPrecision: ts.precision,
              capturedAt: item.capturedAt,
              unreadCount: unread,
              isPinned: !!r.pinned,
              rowPosition: r.position ?? 0,
              waAccount: item.waAccount,
              ocrConfidence: r.ocrConfidence ?? 0.7,
              identityConfidence: phone ? 0.99 : name ? 0.6 : 0.3,
              identityState,
              draftSuggestion: draft,
              fingerprint,
              seenCount: 1,
              firstSeen: item.capturedAt,
              lastSeen: item.capturedAt,
              movement,
            });
          }

          const health: Health =
            movement === "stuck" ? "stuck" : movement === "revived" ? "revived" : movement === "same" ? "dormant" : "moving";

          if (prev) {
            customers[key] = {
              ...prev,
              name: prev.name ?? name,
              waAccounts: prev.waAccounts.includes(item.waAccount)
                ? prev.waAccounts
                : [...prev.waAccounts, item.waAccount],
              lastSeen: item.capturedAt,
              appearances: prev.appearances + 1,
              lastMessage: text ?? prev.lastMessage,
              lastMessageAt: ts.iso ?? prev.lastMessageAt,
              intent: classifyIntent(text, unread),
              health,
              movement,
              stuckReason: movement === "stuck" ? stuckReasonFor(text) : null,
              draft,
              unread,
              identityState: phone ? "verified" : prev.identityState,
              normalizedPhone: prev.normalizedPhone ?? phone,
              last4: prev.last4 ?? (phone ? phone.slice(-4) : null),
            };
            updated += 1;
          } else {
            customers[key] = {
              id: key,
              normalizedPhone: phone,
              last4: phone ? phone.slice(-4) : null,
              name,
              waAccounts: [item.waAccount],
              identityState,
              firstSeen: item.capturedAt,
              lastSeen: item.capturedAt,
              appearances: 1,
              lastMessage: text,
              lastMessageAt: ts.iso,
              intent: classifyIntent(text, unread),
              health,
              stage: "new",
              stuckReason: null,
              movement: "new",
              draft,
              unread,
            };
            created += 1;
          }
          ids.push(key);
        }

        set({ customers, observations: observations.slice(0, 6000) });
        return { created, updated, ids };
      },

      claim: (customerId, owner, draft) => {
        const existing = get().claims[customerId];
        const now = Date.now();
        if (existing && existing.status === "active" && +new Date(existing.expiresAt) > now) {
          if (existing.ownerId !== owner.id) return { ok: false, heldBy: existing.ownerName };
          return { ok: true };
        }
        set((st) => ({
          claims: {
            ...st.claims,
            [customerId]: {
              customerId,
              ownerId: owner.id,
              ownerName: owner.name,
              claimedAt: new Date().toISOString(),
              expiresAt: new Date(now + CLAIM_TTL_MINS * 60000).toISOString(),
              status: "active",
              draft,
            },
          },
        }));
        return { ok: true };
      },

      release: (customerId) =>
        set((st) => {
          const c = st.claims[customerId];
          if (!c) return {};
          return { claims: { ...st.claims, [customerId]: { ...c, status: "released" } } };
        }),

      reject: (customerId, reason) =>
        set((st) => ({
          rejections: st.rejections + 1,
          customers: st.customers[customerId]
            ? { ...st.customers, [customerId]: { ...st.customers[customerId], rejected: true, rejectedReason: reason } }
            : st.customers,
        })),

      observationsFor: (customerId) =>
        get()
          .observations.filter((o) => o.customerId === customerId)
          .sort((a, b) => +new Date(b.capturedAt) - +new Date(a.capturedAt)),

      search: (q) => {
        const term = q.trim().toLowerCase();
        if (!term) return [];
        const d = digits(term);
        return Object.values(get().customers).filter((c) =>
          d.length >= 3
            ? (c.normalizedPhone ?? "").includes(d)
            : (c.name ?? "").toLowerCase().includes(term),
        );
      },

      purgeExpiredRaw: () => {
        const now = Date.now();
        const stale = get().screenshots.filter(
          (s) => !s.rawDeletedAt && +new Date(s.expiresAt) <= now,
        );
        if (stale.length) get().markRawDeleted(stale.map((s) => s.id));
        return stale.length;
      },
    }),
    { name: "gharpayy.ocr.engine.v2" },
  ),
);

export const RAW_RETENTION_HOURS = RAW_TTL_HOURS;
export const CLAIM_TTL_MINUTES = CLAIM_TTL_MINS;

/** Is this customer currently held by someone else? */
export function claimHolder(customerId: string, meId: string): OcrClaim | null {
  const c = useOcrEngine.getState().claims[customerId];
  if (!c || c.status !== "active") return null;
  if (+new Date(c.expiresAt) <= Date.now()) return null;
  return c.ownerId === meId ? null : c;
}
