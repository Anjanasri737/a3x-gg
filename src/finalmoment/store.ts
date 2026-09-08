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
  /** minutes allowed to work the 30 leads once the round is locked */
  workMins: number;
  ulids: string[];
  cursor: number;
  /** leads finished in this round, in completion order */
  done: string[];
  /** completion timestamps, for the per-minute pace chart */
  doneAt: string[];
  /** how long marking took, in seconds */
  markSecs: number;
  calls: number;
  connected: number;
  texts: number;
  tours: number;
  quotes: number;
  bookings: number;
  closed: number;
}

export type RoundCounter = "calls" | "connected" | "texts" | "tours" | "quotes" | "bookings" | "closed";

/** Per-draft marking timer — starts the moment you add the first lead to that draft. */
export interface MarkTimer {
  startedAt: string;
  lockedAt?: string;
}

interface FMState {
  rounds: FMRound[];
  activeRoundId: string | null;
  /** marking pool for the round being assembled */
  picks: string[];
  /** leads marked "111111" on WhatsApp during this marking pass */
  waMarked: string[];
  markStartedAt: string | null;
  /** one marking timer per draft label */
  markTimers: Partial<Record<RoundLabel, MarkTimer>>;
  windowSecs: number;
  workMins: number;
  target: number;

  startMarkTimer: (label?: RoundLabel) => void;
  resetMarkTimer: (label?: RoundLabel) => void;
  setWindow: (secs: number) => void;
  setWorkMins: (mins: number) => void;

  pick: (ulid: string) => void;
  unpick: (ulid: string) => void;
  pickMany: (ulids: string[]) => void;
  clearPicks: () => void;

  markWa: (ulid: string) => void;
  markWaMany: (ulids: string[]) => void;

  startRound: (label: RoundLabel, ulids: string[]) => FMRound;
  bump: (counter: RoundCounter, n?: number) => void;
  setCursor: (i: number) => void;
  markDone: (ulid: string) => void;
  unmarkDone: (ulid: string) => void;
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
      markTimers: {},
      windowSecs: 300,
      workMins: 90,
      target: 30,

      startMarkTimer: (label) =>
        set((s) => {
          const patch: Partial<FMState> = {};
          if (!s.markStartedAt) patch.markStartedAt = now();
          if (label && !s.markTimers[label]) {
            patch.markTimers = { ...s.markTimers, [label]: { startedAt: now() } };
          }
          return patch;
        }),
      resetMarkTimer: (label) =>
        set((s) => ({
          markStartedAt: now(),
          markTimers: label ? { ...s.markTimers, [label]: { startedAt: now() } } : s.markTimers,
        })),
      setWindow: (secs) => set({ windowSecs: secs }),
      setWorkMins: (mins) => set({ workMins: mins }),

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
        const s0 = get();
        const t = s0.markTimers[label];
        const markSecs = t
          ? Math.round((Date.now() - +new Date(t.startedAt)) / 1000)
          : s0.markStartedAt
            ? Math.round((Date.now() - +new Date(s0.markStartedAt)) / 1000)
            : 0;
        const r: FMRound = {
          id: `${label}-R${String(s0.rounds.length + 1).padStart(2, "0")}`,
          label,
          startedAt: now(),
          target: s0.target,
          windowSecs: s0.windowSecs,
          workMins: s0.workMins,
          ulids,
          cursor: 0,
          done: [],
          doneAt: [],
          markSecs,
          calls: 0, connected: 0, texts: 0, tours: 0, quotes: 0, bookings: 0, closed: 0,
        };
        set((s) => ({
          rounds: [r, ...s.rounds].slice(0, 60),
          activeRoundId: r.id,
          picks: [],
          markTimers: { ...s.markTimers, [label]: { startedAt: t?.startedAt ?? now(), lockedAt: now() } },
        }));
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

      markDone: (ulid) =>
        set((s) => ({
          rounds: s.rounds.map((r) =>
            r.id === s.activeRoundId && !(r.done ?? []).includes(ulid)
              ? { ...r, done: [...(r.done ?? []), ulid], doneAt: [...(r.doneAt ?? []), now()] }
              : r,
          ),
        })),

      unmarkDone: (ulid) =>
        set((s) => ({
          rounds: s.rounds.map((r) => {
            if (r.id !== s.activeRoundId) return r;
            const i = (r.done ?? []).indexOf(ulid);
            if (i < 0) return r;
            return {
              ...r,
              done: (r.done ?? []).filter((u) => u !== ulid),
              doneAt: (r.doneAt ?? []).filter((_, j) => j !== i),
            };
          }),
        })),

      endRound: () =>
        set((s) => ({
          rounds: s.rounds.map((r) => (r.id === s.activeRoundId ? { ...r, endedAt: now() } : r)),
          activeRoundId: null,
          markStartedAt: null,
          waMarked: [],
        })),

      resetAll: () =>
        set({ rounds: [], activeRoundId: null, picks: [], waMarked: [], markStartedAt: null, markTimers: {} }),
    }),
    { name: "gharpayy.finalmoment.v2", version: 2 },

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

/* ----------------------------- pacing helpers ----------------------------- */

export interface Pace {
  workSecs: number;
  elapsedSecs: number;
  remainingSecs: number;
  elapsedMins: number;
  doneCount: number;
  totalCount: number;
  /** leads that should be finished by now to land 30 inside the window */
  shouldBeDone: number;
  /** ahead (+) / behind (-) schedule, in leads */
  delta: number;
  /** actual leads per minute so far */
  perMinute: number;
  /** leads per minute needed for the rest of the window */
  requiredPerMinute: number;
  /** seconds allowed per remaining lead */
  secsPerRemaining: number;
  /** projected total minutes at the current rate */
  projectedMins: number | null;
  overdue: boolean;
  /** completions bucketed per elapsed minute */
  minuteBuckets: number[];
}

export function roundPace(r: FMRound, nowMs = Date.now()): Pace {
  const workSecs = (r.workMins ?? 90) * 60;
  const startMs = +new Date(r.startedAt);
  const endMs = r.endedAt ? +new Date(r.endedAt) : nowMs;
  const elapsedSecs = Math.max(0, Math.floor((endMs - startMs) / 1000));
  const elapsedMins = elapsedSecs / 60;
  const doneCount = (r.done ?? []).length;
  const totalCount = r.ulids.length || r.target || 30;
  const shouldBeDone = Math.min(totalCount, Math.floor((elapsedSecs / workSecs) * totalCount));
  const remainingSecs = workSecs - elapsedSecs;
  const leadsLeft = Math.max(0, totalCount - doneCount);
  const perMinute = elapsedMins > 0 ? doneCount / elapsedMins : 0;
  const minsLeft = Math.max(0, remainingSecs / 60);
  const minuteBuckets: number[] = Array.from({ length: Math.max(1, Math.ceil(elapsedMins)) }, () => 0);
  for (const ts of r.doneAt ?? []) {
    const m = Math.floor((+new Date(ts) - startMs) / 60000);
    if (m >= 0 && m < minuteBuckets.length) minuteBuckets[m] += 1;
  }
  return {
    workSecs,
    elapsedSecs,
    remainingSecs,
    elapsedMins,
    doneCount,
    totalCount,
    shouldBeDone,
    delta: doneCount - shouldBeDone,
    perMinute,
    requiredPerMinute: leadsLeft === 0 ? 0 : minsLeft > 0 ? leadsLeft / minsLeft : Infinity,
    secsPerRemaining: leadsLeft === 0 ? 0 : Math.max(0, remainingSecs) / leadsLeft,
    projectedMins: perMinute > 0 ? totalCount / perMinute : null,
    overdue: remainingSecs < 0 && leadsLeft > 0,
    minuteBuckets,
  };
}
