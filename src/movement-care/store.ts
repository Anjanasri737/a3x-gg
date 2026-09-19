import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { CareGoal, CareRole, CareRound } from "./playbooks";

export interface DailyCommitment {
  date: string;
  role: CareRole;
  goal: CareGoal;
  target: number;
  supportNeeded: string;
  targetPropertyIds: string[];
  committedAt: string;
}

export interface RoundReport {
  id: string;
  date: string;
  round: CareRound;
  role: CareRole;
  goal: CareGoal;
  actual: number;
  target: number;
  moved: string;
  stuck: string;
  need: string;
  reportedAt: string;
}

interface MovementCareStore {
  commitment: DailyCommitment | null;
  reports: RoundReport[];
  commit: (input: Omit<DailyCommitment, "date" | "committedAt">) => DailyCommitment;
  setTargetProperties: (ids: string[]) => void;
  report: (input: Omit<RoundReport, "id" | "date" | "reportedAt">) => RoundReport;
  clearCommitment: () => void;
}

const dayKey = () => new Date().toISOString().slice(0, 10);

export const useMovementCare = create<MovementCareStore>()(
  persist(
    (set) => ({
      commitment: null,
      reports: [],
      commit: (input) => {
        const commitment: DailyCommitment = {
          ...input,
          date: dayKey(),
          committedAt: new Date().toISOString(),
        };
        set({ commitment });
        return commitment;
      },
      report: (input) => {
        const report: RoundReport = {
          ...input,
          id: `care-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          date: dayKey(),
          reportedAt: new Date().toISOString(),
        };
        set((state) => ({ reports: [report, ...state.reports].slice(0, 90) }));
        return report;
      },
      setTargetProperties: (ids) =>
        set((state) => ({ commitment: state.commitment ? { ...state.commitment, targetPropertyIds: ids } : null })),
      clearCommitment: () => set({ commitment: null }),
    }),
    { name: "gharpayy.movement-care.v2" },
  ),
);

export function todaysCommitment(commitment: DailyCommitment | null) {
  return commitment?.date === dayKey() ? commitment : null;
}