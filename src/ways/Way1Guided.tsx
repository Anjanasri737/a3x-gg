// Way 1 — Guided one-question run. Only the current step is on screen.
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ActionDialog } from "@/mymoves/ActionDialog";
import { ACTIONS } from "@/mymoves/workflow";
import { sla } from "@/mymoves/engine";
import type { Lead } from "@/mymoves/types";
import { StepRail } from "@/bookingos/StepRail";
import { buildSteps, TOTAL_STEPS } from "@/bookingos/steps";
import { CapturePanel } from "./CapturePanel";

export function Way1Guided({ lead }: { lead: Lead }) {
  const steps = buildSteps(lead);
  const now = steps.find((s) => s.status === "NOW") ?? steps[steps.length - 1];
  const [action, setAction] = useState<string | null>(null);
  const [showLadder, setShowLadder] = useState(false);
  const t = sla(lead);

  return (
    <Card className="space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Step {now.n} of {TOTAL_STEPS} · one thing to do
          </p>
          <h3 className="text-lg font-semibold">{now.headline}</h3>
          {now.sub && <p className="text-sm text-muted-foreground">{now.sub}</p>}
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={t.overdue ? "destructive" : "secondary"}>{t.label}</Badge>
          <Badge variant="outline">{lead.owner ?? "No owner"}</Badge>
        </div>
      </div>

      <CapturePanel lead={lead} step={now} compact />

      <div>
        <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">Record the outcome</p>
        <div className="flex flex-wrap gap-2">
          {[...now.actions.primary, ...now.actions.secondary].map((id, i) =>
            ACTIONS[id] ? (
              <Button key={id} size="sm" variant={i === 0 ? "default" : "outline"} onClick={() => setAction(id)}>
                {ACTIONS[id].label}
              </Button>
            ) : null,
          )}
        </div>
      </div>

      <div className="rounded-md border bg-muted/40 p-3 text-sm">
        <span className="text-muted-foreground">After this: </span>
        <span className="font-medium">
          {now.nextStage ? `${now.n + 1}. ${now.nextStage.replace(/_/g, " ")}` : "End of the journey"}
        </span>
      </div>

      <div>
        <Button size="sm" variant="ghost" onClick={() => setShowLadder((v) => !v)}>
          {showLadder ? "Hide the full journey" : "Show the full journey"}
        </Button>
        {showLadder && (
          <div className="mt-2 max-h-[40vh] overflow-y-auto rounded-md border p-2">
            <StepRail steps={steps} selected={now.stage} onSelect={() => {}} />
          </div>
        )}
      </div>

      <ActionDialog lead={lead} actionId={action} onClose={() => setAction(null)} />
    </Card>
  );
}
