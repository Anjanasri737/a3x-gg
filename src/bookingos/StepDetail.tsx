import { useState } from "react";
import { Check, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ActionDialog } from "@/mymoves/ActionDialog";
import { ACTIONS } from "@/mymoves/workflow";
import type { Lead } from "@/mymoves/types";
import { TOTAL_STEPS, type StepView } from "./steps";

const STATUS_TEXT: Record<StepView["status"], string> = {
  DONE: "Done",
  NOW: "Happening now",
  LOCKED: "Not reachable yet",
  SKIPPED: "Passed without a recorded action",
};

export function StepDetail({ lead, step, now }: { lead: Lead; step: StepView; now?: StepView }) {
  const [action, setAction] = useState<string | null>(null);
  const left = step.checklist.filter((c) => !c.done);
  const live = step.status === "NOW";

  const btn = (id: string, variant: "default" | "outline") => {
    const def = ACTIONS[id];
    if (!def) return null;
    return (
      <Button key={id} size="sm" variant={variant} disabled={!live} onClick={() => setAction(id)}>
        {def.label}
      </Button>
    );
  };

  return (
    <Card className="space-y-4 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Step {step.n} of {TOTAL_STEPS} · {step.stage.replace(/_/g, " ")}
          </p>
          <h3 className="mt-1 text-base font-semibold">{step.headline}</h3>
          {step.sub && <p className="text-sm text-muted-foreground">{step.sub}</p>}
        </div>
        <Badge variant={step.status === "NOW" ? "default" : step.status === "DONE" ? "secondary" : "outline"}>
          {STATUS_TEXT[step.status]}
        </Badge>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">What this step needs</p>
          {step.checklist.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing to capture here.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {step.checklist.map((c) => (
                <li key={c.label} className={`flex items-center gap-2 ${c.done ? "text-muted-foreground" : "text-destructive"}`}>
                  {c.done ? <Check className="size-3.5" /> : <X className="size-3.5" />}
                  <span className="capitalize">{c.label}</span>
                </li>
              ))}
            </ul>
          )}
          {live && left.length > 0 && (
            <p className="mt-2 text-xs text-destructive">Still missing: {left.map((c) => c.label).join(", ")}</p>
          )}
        </div>

        <div>
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">What already happened</p>
          {step.proof.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {step.status === "DONE" || step.status === "SKIPPED" ? "No action was recorded on this step." : "Nothing yet."}
            </p>
          ) : (
            <ul className="space-y-1 text-sm">
              {step.proof.map((p, i) => (
                <li key={`${p.at}-${i}`} className="text-muted-foreground">
                  <span className="text-foreground">{p.label}</span> · {p.actor} · {new Date(p.at).toLocaleString()}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div>
        <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {live ? "Do this now" : "Buttons that belong to this step"}
        </p>
        <div className="flex flex-wrap gap-2">
          {step.actions.primary.map((id) => btn(id, "default"))}
          {step.actions.secondary.map((id) => btn(id, "outline"))}
        </div>
        {!live && (
          <p className="mt-2 text-xs text-muted-foreground">
            {step.status === "LOCKED"
              ? `Locked — the customer is on step ${now?.n ?? "—"} (${now?.stage.replace(/_/g, " ") ?? "off ladder"}). Finish that first.`
              : "Already passed — history above is the record."}
          </p>
        )}
      </div>

      <div className="rounded-md border bg-muted/40 p-3 text-sm">
        <span className="text-muted-foreground">Next step after this: </span>
        {step.nextStage ? (
          <span className="font-medium">
            {step.n + 1}. {step.nextStage.replace(/_/g, " ")}
          </span>
        ) : (
          <span className="font-medium">End of the journey</span>
        )}
      </div>

      <ActionDialog lead={lead} actionId={action} onClose={() => setAction(null)} />
    </Card>
  );
}
