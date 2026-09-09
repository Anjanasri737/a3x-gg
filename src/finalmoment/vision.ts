// Draft Vision — screenshot rows -> identity -> draft judgment.
// Pipeline: CHAT ROW DETECTION (server) -> FIELD EXTRACTION (server) ->
// IDENTITY MATCH (here) -> DRAFT JUDGMENT (here).
// Phone is the strongest identifier but never mandatory.
import type { VisionRawRow } from "@/lib/draft-vision.functions";
import { useMovement } from "@/movement/store";
import type { DraftCode, MovementState } from "@/movement/types";
import { digitsOf, last4of } from "./bridge";

export type TimestampPrecision = "time" | "day" | "date" | "unknown";
export type IdentityLevel = "exact-phone" | "chat-id" | "name-context" | "ambiguous" | "none";
export type RowClass = "new" | "existing" | "duplicate" | "locked" | "needs-review";

export interface VisionRow {
  id: string;
  raw: VisionRawRow;
  /** immutable audit — when the screenshot was pasted, never invented message time */
  capturedAt: string;
  screenshotId: string;

  name: string | null;
  phoneDigits: string | null;
  waAccount: string;

  timestampText: string | null;
  timestampPrecision: TimestampPrecision;
  /** best-effort absolute time, null when the screenshot did not show enough */
  messageAtIso: string | null;
  ageMins: number | null;

  unread: number;
  pinned: boolean;
  isGroup: boolean;

  identity: IdentityLevel;
  identityConfidence: number;
  ulid: string | null;
  candidates: string[];

  classification: RowClass;
  lockedBy: string | null;
  existingDraft: DraftCode | null;
  lastCrmActivity: string | null;

  draft: DraftCode;
  draftConfidence: number;
  reasons: string[];
  ocrConfidence: number;

  include: boolean;
}

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const HOT = /(book|booking|advance|pay|paid|token|shift|shifting|today|tomorrow|visit|come|available|room ready|confirm)/i;
const WARM = /(price|rent|budget|photo|photos|details|location|sharing|single|double|ac\b|food|deposit)/i;
const COLD = /(later|next month|not now|planning|just checking|no thanks|cancel)/i;

/** Resolve WhatsApp's relative label against capture time — no invented precision. */
export function resolveTimestamp(
  text: string | null,
  capturedAt: string,
): { iso: string | null; precision: TimestampPrecision } {
  if (!text) return { iso: null, precision: "unknown" };
  const base = new Date(capturedAt);
  const t = text.trim().toLowerCase();

  const time = t.match(/^(\d{1,2})[:.](\d{2})\s*(am|pm)?$/);
  if (time) {
    let h = Number(time[1]);
    const m = Number(time[2]);
    const ap = time[3];
    if (ap === "pm" && h < 12) h += 12;
    if (ap === "am" && h === 12) h = 0;
    const d = new Date(base);
    d.setHours(h, m, 0, 0);
    if (d > base) d.setDate(d.getDate() - 1);
    return { iso: d.toISOString(), precision: "time" };
  }

  if (t === "yesterday") {
    const d = new Date(base);
    d.setDate(d.getDate() - 1);
    d.setHours(12, 0, 0, 0);
    return { iso: d.toISOString(), precision: "day" };
  }

  const wd = WEEKDAYS.indexOf(t);
  if (wd >= 0) {
    const d = new Date(base);
    let back = (d.getDay() - wd + 7) % 7;
    if (back === 0) back = 7;
    d.setDate(d.getDate() - back);
    d.setHours(12, 0, 0, 0);
    return { iso: d.toISOString(), precision: "day" };
  }

  const dmy = t.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (dmy) {
    const y = Number(dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3]);
    const d = new Date(y, Number(dmy[2]) - 1, Number(dmy[1]), 12, 0, 0);
    return { iso: d.toISOString(), precision: "date" };
  }

  return { iso: null, precision: "unknown" };
}

const norm = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();

/** Identity ladder: exact phone -> chat id -> name + context -> ambiguous. */
function resolveIdentity(
  phoneDigits: string | null,
  name: string | null,
  states: MovementState[],
): { level: IdentityLevel; ulid: string | null; candidates: string[]; confidence: number } {
  if (phoneDigits && phoneDigits.length >= 10) {
    const tail = phoneDigits.slice(-10);
    const hit = states.find((s) => digitsOf(s.phone ?? "").slice(-10) === tail);
    if (hit) return { level: "exact-phone", ulid: hit.ulid, candidates: [hit.ulid], confidence: 0.99 };
    return { level: "none", ulid: null, candidates: [], confidence: 0.9 };
  }

  if (phoneDigits && phoneDigits.length >= 4) {
    const hits = states.filter((s) => last4of(s.phone ?? "") === phoneDigits.slice(-4));
    if (hits.length === 1) return { level: "chat-id", ulid: hits[0].ulid, candidates: [hits[0].ulid], confidence: 0.8 };
    if (hits.length > 1)
      return { level: "ambiguous", ulid: null, candidates: hits.map((h) => h.ulid), confidence: 0.4 };
  }

  if (name) {
    const n = norm(name);
    const hits = states.filter((s) => s.name && norm(s.name) === n);
    if (hits.length === 1) return { level: "name-context", ulid: hits[0].ulid, candidates: [hits[0].ulid], confidence: 0.7 };
    if (hits.length > 1)
      return { level: "ambiguous", ulid: null, candidates: hits.map((h) => h.ulid), confidence: 0.35 };
  }

  return { level: "none", ulid: null, candidates: [], confidence: name || phoneDigits ? 0.6 : 0.2 };
}

function judgeDraft(row: VisionRawRow, ageMins: number | null): { draft: DraftCode; conf: number; reasons: string[] } {
  const text = row.lastMessageText ?? "";
  const unread = row.unreadCount ?? (row.unread ? 1 : 0);
  const reasons: string[] = [];
  let score = 0;

  if (unread > 0) { score += 2; reasons.push(`${unread} unread`); }
  if (row.lastMessageDirection === "customer") { score += 1; reasons.push("customer spoke last"); }
  if (HOT.test(text)) { score += 3; reasons.push("intent words in preview"); }
  else if (WARM.test(text)) { score += 1.5; reasons.push("enquiry words in preview"); }
  if (COLD.test(text)) { score -= 2; reasons.push("deferral words in preview"); }
  if (ageMins != null) {
    if (ageMins < 240) { score += 2; reasons.push("message under 4h old"); }
    else if (ageMins < 1440) { score += 1; reasons.push("message today"); }
    else if (ageMins > 7 * 1440) { score -= 2; reasons.push("over a week old"); }
    else reasons.push(`${Math.round(ageMins / 1440)}d old`);
  } else reasons.push("no readable timestamp");
  if (row.pinned) { score += 0.5; reasons.push("pinned"); }

  const draft: DraftCode = score >= 5 ? "D1" : score >= 3 ? "D2" : score >= 1 ? "D3" : "D4";
  const conf = Math.max(0.3, Math.min(0.95, 0.45 + Math.abs(score) * 0.07));
  return { draft, conf, reasons };
}

export function buildVisionRows(
  raw: VisionRawRow[],
  opts: { capturedAt: string; screenshotId: string; waAccount: string; alreadyPicked: string[] },
): VisionRow[] {
  const mv = useMovement.getState();
  const states = Object.values(mv.states);
  const seenPhones = new Set<string>();
  const seenNames = new Set<string>();

  return raw.map((r, i) => {
    const phoneDigits = r.phoneVisible
      ? digitsOf(r.phoneVisible)
      : r.displayName && /\d{6,}/.test(r.displayName)
        ? digitsOf(r.displayName)
        : null;
    const name = r.displayName && !/^\+?[\d\s()-]+$/.test(r.displayName) ? r.displayName.trim() : null;

    const ts = resolveTimestamp(r.visibleTimestampText, opts.capturedAt);
    const ageMins = ts.iso ? Math.round((+new Date(opts.capturedAt) - +new Date(ts.iso)) / 60000) : null;

    const id = resolveIdentity(phoneDigits, name, states);
    const st = id.ulid ? mv.states[id.ulid] : null;
    const lock = id.ulid ? mv.lockOf(id.ulid) : null;
    const lockedBy = lock && lock.operatorId !== mv.actor.id ? lock.operatorName : null;

    const dupKey = phoneDigits?.slice(-10) ?? (name ? norm(name) : "");
    const isDupInBatch =
      !!dupKey && (phoneDigits ? seenPhones.has(dupKey) : seenNames.has(dupKey));
    if (dupKey) (phoneDigits ? seenPhones : seenNames).add(dupKey);

    const judgment = judgeDraft(r, ageMins);

    let classification: RowClass;
    if (isDupInBatch || (id.ulid && opts.alreadyPicked.includes(id.ulid))) classification = "duplicate";
    else if (lockedBy) classification = "locked";
    else if (id.level === "ambiguous" || (r.ocrConfidence ?? 1) < 0.55 || r.chatType === "group")
      classification = "needs-review";
    else if (id.ulid) classification = "existing";
    else classification = "new";

    return {
      id: `${opts.screenshotId}-${i}`,
      raw: r,
      capturedAt: opts.capturedAt,
      screenshotId: opts.screenshotId,
      name: name ?? st?.name ?? null,
      phoneDigits,
      waAccount: opts.waAccount,
      timestampText: r.visibleTimestampText,
      timestampPrecision: ts.precision,
      messageAtIso: ts.iso,
      ageMins,
      unread: r.unreadCount ?? (r.unread ? 1 : 0),
      pinned: !!r.pinned,
      isGroup: r.chatType === "group",
      identity: id.level,
      identityConfidence: id.confidence,
      ulid: id.ulid,
      candidates: id.candidates,
      classification,
      lockedBy,
      existingDraft: st?.crmDraft ?? null,
      lastCrmActivity: st?.lastCustomerMsgAt ?? st?.updatedAt ?? null,
      draft: judgment.draft,
      draftConfidence: judgment.conf,
      reasons: judgment.reasons,
      ocrConfidence: r.ocrConfidence ?? 0.7,
      include: classification !== "duplicate" && classification !== "locked" && !(r.chatType === "group"),
    };
  });
}
