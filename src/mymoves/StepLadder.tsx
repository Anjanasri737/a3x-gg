// The journey is a fixed numbered ladder. Every lead sits on exactly one step,
// so the same 26 steps appear in the same order for every customer.
import { Check } from "lucide-react";
import type { Lead, Stage } from "./types";
import { STAGE_ORDER, WORKFLOW } from "./workflow";

/** Main path, in order. Exits (future / lost / invalid) are not steps. */
export const EXITS: Stage[] = ["FUTURE", "LOST", "INVALID"];
export const LADDER: Stage[] = STAGE_ORDER.filter((s) => !EXITS.includes(s));

export const GROUPS: { label: string; group: ReturnType<() => string> }[] = [
  { label: "Capture & identity", group: "capture" },
  { label: "Work the lead", group: "work" },
  { label: "Tour", group: "tour" },
  { label: "Closing", group: "close" },
  { label: "Booking", group: "booking" },
  { label: "Check-in", group: "checkin" },
  { label: "Closed", group: "closed" },
];

export const stepNumber = (stage: Stage) => LADDER.indexOf(stage) + 1;
export const TOTAL_STEPS = LADDER.length;

export function stepRange(group: string) {
  const idx = LADDER.map((s, i) => ({ s, i })).filter(({ s }) => WORKFLOW[s].group === group).map(({ i }) => i + 1);
  return idx.length ? `${idx[0]}–${idx[idx.length - 1]}` : "—";
}

export function StepLadder({ lead }: { lead: Lead }) {
  const exited = EXITS.includes(lead.stage);
  const current = exited ? -1 : LADDER.indexOf(lead.stage);

  return (
    <div className="space-y-3">
      {GROUPS.filter((g) => g.group !== "closed").map((g) => {
        const steps = LADDER.map((s, i) => ({ s, n: i + 1 })).filter(({ s }) => WORKFLOW[s].group === g.group);
        return (
          <div key={g.label}>
            <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">
              Step {stepRange(g.group)} · {g.label}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {steps.map(({ s, n }) => {
                const done = current > -1 && n < current + 1;
                const isNow = n === current + 1;
                return (
                  <span key={s}
                    className={`flex items-center gap-1 rounded-md border px-2 py-1 text-xs ${
                      isNow ? "border-primary bg-primary/10 font-medium text-primary"
                        : done ? "border-transparent bg-muted text-muted-foreground"
                        : "border-dashed text-muted-foreground/70"}`}>
                    {done ? <Check className="size-3" /> : <span className="tabular-nums">{n}</span>}
                    {s.replace(/_/g, " ")}
                  </span>
                );
              })}
            </div>
          </div>
        );
      })}
      {exited && (
        <p className="text-xs text-muted-foreground">
          Off the main ladder — {lead.stage.replace(/_/g, " ")}{lead.lostReason ? `: ${lead.lostReason}` : ""}
        </p>
      )}
    </div>
  );
}
