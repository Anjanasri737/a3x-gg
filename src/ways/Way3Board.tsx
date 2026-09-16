// Way 3 — Stage board. Groups become columns; the live column carries capture.
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ActionDialog } from "@/mymoves/ActionDialog";
import { ACTIONS } from "@/mymoves/workflow";
import { sla } from "@/mymoves/engine";
import type { Lead } from "@/mymoves/types";
import { buildSteps, GROUP_LABELS, stepRange } from "@/bookingos/steps";
import { CapturePanel } from "./CapturePanel";

export function Way3Board({ lead }: { lead: Lead }) {
  const steps = buildSteps(lead);
  const now = steps.find((s) => s.status === "NOW") ?? steps[steps.length - 1];
  const [action, setAction] = useState<string | null>(null);
  const groups = Array.from(new Set(steps.map((s) => s.group)));
  const t = sla(lead);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {groups.map((g) => {
          const inGroup = steps.filter((s) => s.group === g);
          const live = inGroup.some((s) => s.status === "NOW");
          const done = inGroup.filter((s) => s.status === "DONE").length;
          return (
            <Card key={g} className={`space-y-2 p-3 ${live ? "border-primary bg-primary/5" : ""}`}>
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold">{GROUP_LABELS[g] ?? g}</p>
                <Badge variant="outline">steps {stepRange(g)}</Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                {done} of {inGroup.length} recorded
              </p>
              {live && (
                <div className="space-y-1 rounded-md border bg-background p-2">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Customer is here</p>
                  <p className="text-sm font-medium">{lead.name}</p>
                  <p className="text-xs text-muted-foreground">{now.headline}</p>
                  <Badge variant={t.overdue ? "destructive" : "secondary"}>{t.label}</Badge>
                </div>
              )}
            </Card>
          );
        })}
      </div>

      <Card className="space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Live column · {GROUP_LABELS[now.group] ?? now.group}
            </p>
            <h3 className="text-base font-semibold">
              {now.n}. {now.headline}
            </h3>
          </div>
          <Badge variant="outline">{lead.owner ?? "No owner"}</Badge>
        </div>
        <CapturePanel lead={lead} step={now} />
        <div className="flex flex-wrap gap-2">
          {[...now.actions.primary, ...now.actions.secondary].map((id, i) =>
            ACTIONS[id] ? (
              <Button key={id} size="sm" variant={i === 0 ? "default" : "outline"} onClick={() => setAction(id)}>
                {ACTIONS[id].label}
              </Button>
            ) : null,
          )}
        </div>
      </Card>

      <ActionDialog lead={lead} actionId={action} onClose={() => setAction(null)} />
    </div>
  );
}
