// One store for both modes. Every write appends to the lead's timeline.
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { BATCH_SIZE, HANDLERS, ROUNDS } from "./types";
import type { Batch, CapturedRow, FlowLead, Mode, Qualification, Temp } from "./types";
import { seedCapturedRows, seedLeads } from "./seed";

const now = () => new Date().toISOString();
const DAY = 86_400_000;

export const daysOld = (isoDate: string) => Math.floor((Date.now() - +new Date(isoDate)) / DAY);

export function autoTemp(l: FlowLead): Temp {
  if (l.tempReason && l.temp) return l.temp;
  const soon = l.q.moveIn ? +new Date(l.q.moveIn) - Date.now() < 20 * DAY : false;
  if (l.q.when === "NOW" || l.q.when === "TODAY" || soon) return "HOT";
  if (daysOld(l.lastActivityAt) >= 5 || l.q.when === "FUTURE") return "COLD";
  return "HOT";
}

interface State {
  mode: Mode;
  me: string;
  round: number;
  rows: CapturedRow[];
  leads: FlowLead[];
  batches: Batch[];

  setMode: (m: Mode) => void;
  setMe: (name: string) => void;
  setRound: (r: number) => void;

  // capture
  addRow: (rowId: string) => void;
  mergeRow: (rowId: string) => void;
  ignoreRow: (rowId: string) => void;
  addAllNew: () => number;
  resetCapture: () => void;

  // batches
  buildBatch: (handler: string, round: number) => Batch | undefined;
  buildAllRounds: () => number;
  stuckCount: () => number;

  // qualification
  answer: (leadId: string, key: keyof Qualification, value: string) => void;
  finishQualification: (leadId: string, nextAction: string, nextActionAt: string) => void;

  // expert powers
  setTemp: (leadId: string, temp: Temp, reason: string) => void;
  reassign: (leadId: string, handler: string) => void;
  moveStage: (leadId: string, stage: string, reason: string) => void;
  bulk: (leadIds: string[], patch: { handler?: string; nextAction?: string; nextActionAt?: string; temp?: Temp; escalate?: boolean }, reason: string) => void;
  escalate: (leadId: string, reason: string) => void;
  reset: () => void;
}

const ev = (actor: string, label: string, detail?: string) => ({ at: now(), actor, label, detail });

export const useBookingFlow = create<State>()(
  persist(
    (set, get) => ({
      mode: "GUIDED",
      me: HANDLERS[0],
      round: 1,
      rows: seedCapturedRows(),
      leads: seedLeads(),
      batches: [],

      setMode: (mode) => set({ mode }),
      setMe: (me) => set({ me }),
      setRound: (round) => set({ round }),

      addRow: (rowId) =>
        set((s) => {
          const row = s.rows.find((r) => r.id === rowId);
          if (!row || row.status !== "NEW") return s;
          const lead: FlowLead = {
            id: `bf-new-${row.id}`,
            name: row.name,
            phone: row.phone,
            waAccount: "Gharpayy Sales 01",
            lastMessage: row.lastMessage,
            lastActivityAt: now(),
            unread: row.unread,
            labels: row.labels,
            stage: "CAPTURED",
            q: {},
            events: [ev("Draft Vision", "Added to CRM from screenshot", row.screenshot)],
          };
          return {
            leads: [lead, ...s.leads],
            rows: s.rows.map((r) => (r.id === rowId ? { ...r, status: "ADDED", leadId: lead.id } : r)),
          };
        }),

      mergeRow: (rowId) =>
        set((s) => {
          const row = s.rows.find((r) => r.id === rowId);
          if (!row) return s;
          const match = s.leads.find((l) => l.name.toLowerCase() === row.name.toLowerCase());
          if (!match) return s;
          return {
            rows: s.rows.map((r) => (r.id === rowId ? { ...r, status: "MERGED", leadId: match.id } : r)),
            leads: s.leads.map((l) =>
              l.id === match.id
                ? {
                    ...l,
                    lastMessage: row.lastMessage,
                    lastActivityAt: now(),
                    events: [...l.events, ev("Draft Vision", "New messages merged into existing customer", row.screenshot)],
                  }
                : l,
            ),
          };
        }),

      ignoreRow: (rowId) => set((s) => ({ rows: s.rows.map((r) => (r.id === rowId ? { ...r, status: "IGNORED" } : r)) })),

      addAllNew: () => {
        const ids = get().rows.filter((r) => r.status === "NEW").map((r) => r.id);
        ids.forEach((id) => get().addRow(id));
        return ids.length;
      },

      resetCapture: () => set({ rows: seedCapturedRows() }),

      buildBatch: (handler, round) => {
        const s = get();
        const existing = s.batches.find((b) => b.handler === handler && b.round === round);
        if (existing) return existing;
        const pool = s.leads
          .filter((l) => !l.batchId && !l.qualifiedAt && daysOld(l.lastActivityAt) <= 7)
          .sort((a, b) => +new Date(a.lastActivityAt) - +new Date(b.lastActivityAt))
          .slice(0, BATCH_SIZE);
        if (pool.length === 0) return undefined;
        const batch: Batch = {
          id: `batch-${handler}-${round}`,
          handler,
          round,
          createdAt: now(),
          leadIds: pool.map((l) => l.id),
        };
        const ids = new Set(batch.leadIds);
        set({
          batches: [...s.batches, batch],
          leads: s.leads.map((l) =>
            ids.has(l.id)
              ? { ...l, batchId: batch.id, handler, round, owner: handler, events: [...l.events, ev("System", `Given to ${handler} — round ${round}`)] }
              : l,
          ),
        });
        return batch;
      },

      buildAllRounds: () => {
        let made = 0;
        ROUNDS.forEach((round) => {
          HANDLERS.forEach((h) => {
            const before = get().batches.length;
            get().buildBatch(h, round);
            if (get().batches.length > before) made += 1;
          });
        });
        return made;
      },

      stuckCount: () => get().leads.filter((l) => !l.qualifiedAt && daysOld(l.lastActivityAt) > 7).length,

      answer: (leadId, key, value) =>
        set((s) => ({
          leads: s.leads.map((l) =>
            l.id === leadId
              ? { ...l, q: { ...l.q, [key]: value }, events: [...l.events, ev(s.me, `${key} answered`, value)] }
              : l,
          ),
        })),

      finishQualification: (leadId, nextAction, nextActionAt) =>
        set((s) => ({
          leads: s.leads.map((l) => {
            if (l.id !== leadId) return l;
            const ack = l.q.ack;
            const stage = ack === "NOT_REAL" ? "CLOSED" : ack === "NEED_HELP" ? "CONTROL_TOWER" : "QUALIFIED";
            return {
              ...l,
              owner: l.owner ?? s.me,
              stage,
              nextAction,
              nextActionAt,
              qualifiedAt: now(),
              escalated: ack === "NEED_HELP",
              closedReason: ack === "NOT_REAL" ? l.q.blocker || "Not a real lead" : undefined,
              temp: l.tempReason ? l.temp : autoTemp({ ...l }),
              events: [
                ...l.events,
                ev(s.me, `Qualification finished — ${stage.toLowerCase().replace("_", " ")}`, `${nextAction} by ${new Date(nextActionAt).toLocaleString()}`),
              ],
            };
          }),
        })),

      setTemp: (leadId, temp, reason) =>
        set((s) => ({
          leads: s.leads.map((l) =>
            l.id === leadId ? { ...l, temp, tempReason: reason, events: [...l.events, ev(s.me, `Forced ${temp.toLowerCase()}`, reason)] } : l,
          ),
        })),

      reassign: (leadId, handler) =>
        set((s) => ({
          leads: s.leads.map((l) =>
            l.id === leadId ? { ...l, handler, owner: handler, events: [...l.events, ev(s.me, `Owner changed to ${handler}`)] } : l,
          ),
        })),

      moveStage: (leadId, stage, reason) =>
        set((s) => ({
          leads: s.leads.map((l) => (l.id === leadId ? { ...l, stage, events: [...l.events, ev(s.me, `Moved to ${stage}`, reason)] } : l)),
        })),

      bulk: (leadIds, patch, reason) =>
        set((s) => {
          const ids = new Set(leadIds);
          return {
            leads: s.leads.map((l) =>
              ids.has(l.id)
                ? {
                    ...l,
                    ...(patch.handler ? { handler: patch.handler, owner: patch.handler } : {}),
                    ...(patch.nextAction ? { nextAction: patch.nextAction } : {}),
                    ...(patch.nextActionAt ? { nextActionAt: patch.nextActionAt } : {}),
                    ...(patch.temp ? { temp: patch.temp, tempReason: reason } : {}),
                    ...(patch.escalate ? { escalated: true, stage: "CONTROL_TOWER" } : {}),
                    events: [...l.events, ev(s.me, "Bulk action applied", reason)],
                  }
                : l,
            ),
          };
        }),

      escalate: (leadId, reason) =>
        set((s) => ({
          leads: s.leads.map((l) =>
            l.id === leadId
              ? { ...l, escalated: true, stage: "CONTROL_TOWER", events: [...l.events, ev(s.me, "Sent to Control Tower", reason)] }
              : l,
          ),
        })),

      reset: () => set({ rows: seedCapturedRows(), leads: seedLeads(), batches: [] }),
    }),
    { name: "gharpayy-booking-flow-v1", version: 1 },
  ),
);
