// WhatsApp-style CRM layer — ownership, unread, pins, archive, handovers,
// next actions and quick outcome chips. Sits on top of the lead identity store.
import { create } from "zustand";
import { persist } from "zustand/middleware";

export type WaOutcome =
  | "interested" | "tour" | "hot" | "future" | "no-answer" | "lost" | "booked" | "quote";

export interface WaClaim {
  ownerId: string;
  ownerName: string;
  claimedAt: string;
  /** last real outcome (call / note / tour / follow-up). Drives claim expiry. */
  lastOutcomeAt: string;
}

export interface WaNextAction {
  dueAt: string;
  kind: string;
  note?: string;
}

export interface WaHandover {
  id: string;
  ulid: string;
  fromId: string;
  fromName: string;
  toId: string;
  toName: string;
  message: string;
  ts: string;
  state: "pending" | "accepted" | "declined";
}

/** Why a lead is showing an unread badge — WhatsApp red dot with meaning. */
export interface WaUnread {
  count: number;
  reason: string;
}

export type WaInboxMode = "mine" | "team" | "unclaimed" | "tower";

interface WaState {
  unread: Record<string, WaUnread>;
  pinned: string[];
  archivedUntil: Record<string, string>;
  claims: Record<string, WaClaim>;
  nextActions: Record<string, WaNextAction>;
  chips: Record<string, WaOutcome[]>;
  handovers: WaHandover[];
  /** claim expiry in minutes before CRM warns / releases */
  claimSlaMins: number;

  ping: (ulid: string, reason: string, n?: number) => void;
  clearUnread: (ulid: string) => void;

  claim: (ulid: string, ownerId: string, ownerName: string) => void;
  release: (ulid: string) => void;
  touchOutcome: (ulid: string) => void;

  togglePin: (ulid: string) => void;
  archiveUntil: (ulid: string, iso: string) => void;
  unarchive: (ulid: string) => void;

  setNextAction: (ulid: string, a: WaNextAction) => void;
  clearNextAction: (ulid: string) => void;

  addChip: (ulid: string, chip: WaOutcome) => void;
  removeChip: (ulid: string, chip: WaOutcome) => void;

  transfer: (h: Omit<WaHandover, "id" | "ts" | "state">) => WaHandover;
  decideHandover: (id: string, state: "accepted" | "declined") => WaHandover | null;

  setClaimSla: (mins: number) => void;
}

const now = () => new Date().toISOString();
const uid = () => `h-${Math.random().toString(36).slice(2, 9)}`;

export const useWa = create<WaState>()(
  persist(
    (set, get) => ({
      unread: {},
      pinned: [],
      archivedUntil: {},
      claims: {},
      nextActions: {},
      chips: {},
      handovers: [],
      claimSlaMins: 15,

      ping: (ulid, reason, n = 1) =>
        set((s) => ({
          unread: {
            ...s.unread,
            [ulid]: { count: (s.unread[ulid]?.count ?? 0) + n, reason },
          },
        })),
      clearUnread: (ulid) =>
        set((s) => {
          const next = { ...s.unread };
          delete next[ulid];
          return { unread: next };
        }),

      claim: (ulid, ownerId, ownerName) =>
        set((s) => ({
          claims: { ...s.claims, [ulid]: { ownerId, ownerName, claimedAt: now(), lastOutcomeAt: now() } },
        })),
      release: (ulid) =>
        set((s) => {
          const c = { ...s.claims };
          delete c[ulid];
          return { claims: c };
        }),
      touchOutcome: (ulid) =>
        set((s) =>
          s.claims[ulid]
            ? { claims: { ...s.claims, [ulid]: { ...s.claims[ulid], lastOutcomeAt: now() } } }
            : {},
        ),

      togglePin: (ulid) =>
        set((s) => ({
          pinned: s.pinned.includes(ulid)
            ? s.pinned.filter((x) => x !== ulid)
            : [ulid, ...s.pinned].slice(0, 10),
        })),
      archiveUntil: (ulid, iso) => set((s) => ({ archivedUntil: { ...s.archivedUntil, [ulid]: iso } })),
      unarchive: (ulid) =>
        set((s) => {
          const a = { ...s.archivedUntil };
          delete a[ulid];
          return { archivedUntil: a };
        }),

      setNextAction: (ulid, a) => set((s) => ({ nextActions: { ...s.nextActions, [ulid]: a } })),
      clearNextAction: (ulid) =>
        set((s) => {
          const n = { ...s.nextActions };
          delete n[ulid];
          return { nextActions: n };
        }),

      addChip: (ulid, chip) =>
        set((s) => ({
          chips: { ...s.chips, [ulid]: Array.from(new Set([chip, ...(s.chips[ulid] ?? [])])).slice(0, 4) },
        })),
      removeChip: (ulid, chip) =>
        set((s) => ({ chips: { ...s.chips, [ulid]: (s.chips[ulid] ?? []).filter((c) => c !== chip) } })),

      transfer: (h) => {
        const rec: WaHandover = { ...h, id: uid(), ts: now(), state: "pending" };
        set((s) => ({ handovers: [rec, ...s.handovers] }));
        return rec;
      },
      decideHandover: (id, state) => {
        const rec = get().handovers.find((h) => h.id === id) ?? null;
        set((s) => ({ handovers: s.handovers.map((h) => (h.id === id ? { ...h, state } : h)) }));
        if (rec && state === "accepted") {
          get().claim(rec.ulid, rec.toId, rec.toName);
        }
        return rec;
      },

      setClaimSla: (mins) => set({ claimSlaMins: Math.max(1, mins) }),
    }),
    { name: "gharpayy.wa.v1", version: 1 },
  ),
);
