// Every call is stored as a full conversation record, not a status.
// Armed follow-ups cancel themselves the moment the customer moves.
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { CallRecord } from "./types";

export interface CallEngineStore {
  records: CallRecord[];
  save: (r: CallRecord) => void;
  markSent: (id: string) => void;
  cancelFollowUps: (ulid: string, why: string) => void;
  sendFollowUp: (id: string) => void;
  /** how many times we already tried this customer without reaching them */
  noAnswerStreak: (ulid: string) => number;
  forLead: (ulid: string) => CallRecord[];
  today: () => CallRecord[];
}

const sameDay = (iso: string) => new Date(iso).toDateString() === new Date().toDateString();

export const useCallEngine = create<CallEngineStore>()(
  persist(
    (set, get) => ({
      records: [],

      save: (r) => set((s) => ({ records: [r, ...s.records].slice(0, 2000) })),

      markSent: (id) =>
        set((s) => ({ records: s.records.map((r) => (r.id === id ? { ...r, messageSent: true } : r)) })),

      cancelFollowUps: (ulid, why) =>
        set((s) => ({
          records: s.records.map((r) =>
            r.ulid === ulid && r.followUpState === "armed"
              ? { ...r, followUpState: "cancelled", waste: r.waste, stageAfter: r.stageAfter, nextStep: r.nextStep, capture: { ...r.capture, note: [r.capture.note, `follow-up cancelled: ${why}`].filter(Boolean).join(" · ") } }
              : r,
          ),
        })),

      sendFollowUp: (id) =>
        set((s) => ({ records: s.records.map((r) => (r.id === id ? { ...r, followUpState: "sent" } : r)) })),

      noAnswerStreak: (ulid) => {
        let n = 0;
        for (const r of get().records.filter((r) => r.ulid === ulid)) {
          if (r.outcome === "connected") break;
          n += 1;
        }
        return n;
      },

      forLead: (ulid) => get().records.filter((r) => r.ulid === ulid),
      today: () => get().records.filter((r) => sameDay(r.ts)),
    }),
    { name: "gharpayy.call-engine.v1" },
  ),
);
