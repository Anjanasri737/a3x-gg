// The 100x layout: the same 30-step journey, but grouped into screens of at most
// five questions so an operator answers a whole block in one go instead of
// clicking through one question at a time.
import { JOURNEY, isStepDone } from "@/bookingflow/journey";
import type { JStep } from "@/bookingflow/journey";

export interface Screen {
  id: string;
  title: string;
  group: string;
  steps: JStep[];
}

const MAX_PER_SCREEN = 5;
// No screen may hold a single lonely question — that wastes a whole click.
const MIN_PER_SCREEN = 3;

export const SCREENS: Screen[] = (() => {
  const out: Screen[] = [];
  JOURNEY.forEach((step) => {
    const last = out[out.length - 1];
    if (last && last.group === step.group && last.steps.length < MAX_PER_SCREEN) {
      last.steps.push(step);
      return;
    }
    out.push({ id: `${step.group}-${out.length}`, title: step.group, group: step.group, steps: [step] });
  });

  // Thin screens get merged into their neighbour so every screen asks a real block
  // of questions instead of one.
  for (let i = 0; i < out.length; i += 1) {
    const s = out[i]!;
    if (s.steps.length >= MIN_PER_SCREEN) continue;
    const next = out[i + 1];
    if (next && s.steps.length + next.steps.length <= MAX_PER_SCREEN) {
      next.steps = [...s.steps, ...next.steps];
      if (next.group !== s.group) next.group = `${s.group} → ${next.group}`;
      out.splice(i, 1);
      i -= 1;
      continue;
    }
    const prev = out[i - 1];
    if (prev && prev.steps.length + s.steps.length <= MAX_PER_SCREEN) {
      prev.steps = [...prev.steps, ...s.steps];
      if (prev.group !== s.group) prev.group = `${prev.group} → ${s.group}`;
      out.splice(i, 1);
      i -= 1;
    }
  }
  out.forEach((s) => { s.title = s.group; });
  // name repeated groups ("Booking 1 of 2") so the rail stays readable
  const counts = new Map<string, number>();
  out.forEach((s) => counts.set(s.group, (counts.get(s.group) ?? 0) + 1));
  const seen = new Map<string, number>();
  out.forEach((s) => {
    const total = counts.get(s.group) ?? 1;
    if (total > 1) {
      const n = (seen.get(s.group) ?? 0) + 1;
      seen.set(s.group, n);
      s.title = `${s.group} ${n}/${total}`;
    }
  });
  return out;
})();

export function screenDone(f: Record<string, string>, s: Screen) {
  return s.steps.every((st) => isStepDone(f, st));
}

export function screenProgress(f: Record<string, string>, s: Screen) {
  const done = s.steps.filter((st) => isStepDone(f, st)).length;
  return { done, total: s.steps.length };
}

/** The first screen that is not fully answered — the screen to work now. */
export function currentScreen(f: Record<string, string>): Screen {
  return SCREENS.find((s) => !screenDone(f, s)) ?? SCREENS[SCREENS.length - 1]!;
}

export const screenIndex = (id: string) => SCREENS.findIndex((s) => s.id === id);
