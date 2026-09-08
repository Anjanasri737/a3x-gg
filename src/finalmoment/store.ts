// Final Moment — 300-second draft rounds: mark 30 on WhatsApp, sync 30 in CRM, work 30.
// Keeps its own round/marking state; all lead truth + audit still lives in the Movement OS store.
import { create } from "zustand";
import { persist } from "zustand/middleware";

export type RoundLabel = "D1" | "D2" | "D3" | "D4";

export interface FMRound {
  id: string;
  label: RoundLabel;
  startedAt: string;
  endedAt?: string;
  target: number;
  windowSecs: number;
  ulids: string[];
  cursor: number;
  calls: number;
  connected: number;
  texts: number;
  tours: number;
  quotes: number;
  bookings: number;
  closed: number;
}

export type RoundCounter = "calls" | "connected" | "texts" | "tours" | "quotes" | "bookings" | "closed";

interface FMState {
  rounds: FMRound[];
  activeRoundId: string | null;
  /** marking pool for the round being assembled */
  picks: string[];
  /** leads marked "111111" on WhatsApp during this marking pass */
  waMarked: string[];
  markStartedAt: string | null;
  windowSecs: number;
  target: number;

  startMarkTimer: () => void;
  resetMarkTimer: () => void;
  setWindow: (secs: number) => void;

  pick: (ulid: string) => void;
  unpick: (ulid: string) => void;
  pickMany: (ulids: string[]) => void;
  clearPicks: () => void;

  markWa: (ulid: string) => void;
  markWaMany: (ulids: string[]) => void;

  startRound: (label: RoundLabel, ulids: string[]) => FMRound;
  bump: (counter: RoundCounter, n?: number) => void;
  setCursor: (i: number) => void;
  endRound: () => void;
  resetAll: () => void;
}

const now = () => new Date().toISOString();

export const useFinalMoment = create<FMState>()(
  persist(
    (set, get) => ({
      rounds: [],
      activeRoundId: null,
      picks: [],
      waMarked: [],
      markStartedAt: null,
      windowSecs: 300,
      target: 30,

      startMarkTimer: () => set((s) => (s.markStartedAt ? {} : { markStartedAt: now() })),
      resetMarkTimer: () => set({ markStartedAt: now() }),
      setWindow: (secs) => set({ windowSecs: secs }),

      pick: (ulid) =>
        set((s) => {
          const next = s.picks.includes(ulid) ? s.picks : [...s.picks, ulid];
          return { picks: next, markStartedAt: s.markStartedAt ?? now() };
        }),
      unpick: (ulid) => set((s) => ({ picks: s.picks.filter((u) => u !== ulid) })),
      pickMany: (ulids) =>
        set((s) => ({
          picks: [...s.picks, ...ulids.filter((u) => !s.picks.includes(u))],
          markStartedAt: s.markStartedAt ?? now(),
        })),
      clearPicks: () => set({ picks: [] }),

      markWa: (ulid) =>
        set((s) => ({ waMarked: s.waMarked.includes(ulid) ? s.waMarked : [...s.waMarked, ulid] })),
      markWaMany: (ulids) =>
        set((s) => ({ waMarked: [...s.waMarked, ...ulids.filter((u) => !s.waMarked.includes(u))] })),

      startRound: (label, ulids) => {
        const r: FMRound = {
          id: `${label}-R${String(get().rounds.length + 1).padStart(2, "0")}`,
          label,
          startedAt: now(),
          target: get().target,
          windowSecs: get().windowSecs,
          ulids,
          cursor: 0,
          calls: 0, connected: 0, texts: 0, tours: 0, quotes: 0, bookings: 0, closed: 0,
        };
        set((s) => ({ rounds: [r, ...s.rounds].slice(0, 60), activeRoundId: r.id, picks: [] }));
        return r;
      },

      bump: (counter, n = 1) =>
        set((s) => ({
          rounds: s.rounds.map((r) =>
            r.id === s.activeRoundId ? { ...r, [counter]: r[counter] + n } : r,
          ),
        })),

      setCursor: (i) =>
        set((s) => ({
          rounds: s.rounds.map((r) => (r.id === s.activeRoundId ? { ...r, cursor: i } : r)),
        })),

      endRound: () =>
        set((s) => ({
          rounds: s.rounds.map((r) => (r.id === s.activeRoundId ? { ...r, endedAt: now() } : r)),
          activeRoundId: null,
          markStartedAt: null,
          waMarked: [],
        })),

      resetAll: () =>
        set({ rounds: [], activeRoundId: null, picks: [], waMarked: [], markStartedAt: null }),
    }),
    { name: "gharpayy.finalmoment.v1", version: 1 },
  ),
);

export const last4 = (phone?: string) => (phone ?? "").replace(/\D/g, "").slice(-4);

/** Parse a pasted blob into last-4 tokens: numbers, commas, spaces, newlines all fine. */
export function parseTokens(raw: string): string[] {
  return Array.from(
    new Set(
      raw
        .split(/[^0-9]+/)
        .map((t) => t.trim())
        .filter((t) => t.length >= 4)
        .map((t) => t.slice(-4)),
    ),
  );
}
