import { Check, Lock, MinusCircle, Play } from "lucide-react";
import type { Stage } from "@/mymoves/types";
import { GROUP_LABELS, TOTAL_STEPS, stepRange, type StepView } from "./steps";

export function StepRail({
  steps,
  selected,
  onSelect,
}: {
  steps: StepView[];
  selected: Stage;
  onSelect: (stage: Stage) => void;
}) {
  const groups = [...new Set(steps.map((s) => s.group))];

  return (
    <div className="space-y-4">
      {groups.map((g) => (
        <div key={g}>
          <p className="mb-1.5 text-xs uppercase tracking-wide text-muted-foreground">
            Step {stepRange(g)} of {TOTAL_STEPS} · {GROUP_LABELS[g] ?? g}
          </p>
          <div className="space-y-1">
            {steps.filter((s) => s.group === g).map((s) => {
              const active = s.stage === selected;
              const Icon = s.status === "DONE" ? Check : s.status === "NOW" ? Play : s.status === "SKIPPED" ? MinusCircle : Lock;
              return (
                <button
                  key={s.stage}
                  type="button"
                  onClick={() => onSelect(s.stage)}
                  aria-current={active ? "step" : undefined}
                  className={`flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left text-xs transition hover:bg-muted/60 ${
                    active ? "border-primary bg-primary/5" : "border-transparent"
                  } ${s.status === "NOW" ? "font-semibold text-primary" : s.status === "LOCKED" ? "text-muted-foreground/70" : "text-muted-foreground"}`}
                >
                  <span className="w-5 shrink-0 tabular-nums">{s.n}</span>
                  <Icon className="size-3.5 shrink-0" />
                  <span className="flex-1 truncate">{s.stage.replace(/_/g, " ")}</span>
                  {s.status === "NOW" && <span className="shrink-0 text-[10px] uppercase">now</span>}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
