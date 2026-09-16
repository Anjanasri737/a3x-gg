// The whole journey as clickable numbered steps, grouped. Done / now / locked.
import { Check, Lock, Play } from "lucide-react";
import { JOURNEY, GROUPS, isStepDone } from "./journey";
import type { FlowLead } from "./types";
import { cn } from "@/lib/utils";

export function StepRail({
  lead,
  selected,
  onSelect,
  allowLocked,
}: {
  lead: FlowLead;
  selected: string;
  onSelect: (key: string) => void;
  allowLocked: boolean;
}) {
  const f = lead.f ?? {};
  const currentIdx = JOURNEY.findIndex((s) => !isStepDone(f, s));

  return (
    <div className="space-y-3">
      {GROUPS.map((group) => (
        <div key={group}>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{group}</p>
          <div className="flex flex-wrap gap-1.5">
            {JOURNEY.map((s, i) => {
              if (s.group !== group) return null;
              const done = isStepDone(f, s);
              const now = currentIdx === i;
              const locked = !done && !now;
              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => {
                    if (locked && !allowLocked) {
                      onSelect(s.key); // still show it, panel explains why it is locked
                      return;
                    }
                    onSelect(s.key);
                  }}
                  className={cn(
                    "flex items-center gap-1.5 rounded-md border px-2 py-1 text-left text-[11px] transition",
                    selected === s.key && "ring-2 ring-primary",
                    done && "border-primary/40 bg-primary/10",
                    now && "border-primary bg-primary text-primary-foreground",
                    locked && "border-dashed text-muted-foreground",
                  )}
                >
                  <span className="font-mono text-[10px] opacity-70">{i + 1}</span>
                  {done ? <Check className="h-3 w-3" /> : now ? <Play className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
                  <span className="max-w-[9rem] truncate">{s.title}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
