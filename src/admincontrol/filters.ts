// Global admin filters — they persist and apply to every tab of the control room.
import { create } from "zustand";
import { persist } from "zustand/middleware";

export type DayWindow = "today" | "1" | "3" | "7" | "all";
export type HealthFilter = "all" | "RED" | "AMBER" | "GREEN" | "GREY";

export interface ControlFilters {
  day: DayWindow;
  wa: string;
  operator: string;
  zone: string;
  stage: string;
  health: HealthFilter;
  leak: string;
  search: string;
  set: (patch: Partial<Omit<ControlFilters, "set" | "reset">>) => void;
  reset: () => void;
}

const BASE = {
  day: "7" as DayWindow,
  wa: "all",
  operator: "all",
  zone: "all",
  stage: "all",
  health: "all" as HealthFilter,
  leak: "all",
  search: "",
};

export const useControlFilters = create<ControlFilters>()(
  persist(
    (set) => ({
      ...BASE,
      set: (patch) => set(patch),
      reset: () => set({ ...BASE }),
    }),
    { name: "gharpayy.admin.control.filters.v1" },
  ),
);

export function windowStart(day: DayWindow): number {
  if (day === "all") return 0;
  const now = new Date();
  if (day === "today") return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return now.getTime() - Number(day) * 86400000;
}
