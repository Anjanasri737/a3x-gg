// Way 2 — Full ladder ledger. Every step is a row that opens for capture.
import { useState } from "react";
import { Check, ChevronDown, ChevronRight, Lock, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ActionDialog } from "@/mymoves/ActionDialog";
import { ACTIONS } from "@/mymoves/workflow";
import type { Lead } from "@/mymoves/types";
import { buildSteps, GROUP_LABELS, type StepView } from "@/bookingos/steps";
import { CapturePanel } from "./CapturePanel";

export function Way2Ledger({ lead }: { lead: Lead }) {
  const steps = buildSteps(lead);
  const now = steps.find((s) => s.status === "NOW");
  const [open, setOpen] = useState<string | null>(now?.stage ?? steps[0]?.stage ?? null);
  const [action, setAction] = useState<string | null>(null);
  let group = "";

  return (
    <Card className="max-h-[70vh] space-y-1 overflow-y-auto p-3">
      {steps.map((s) => {
        const head = s.group !== group ? ((group = s.group), GROUP_LABELS[s.group] ?? s.group) : null;
        return (
          <div key={s.stage}>
            {head && <p className="mt-3 mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{head}</p>}
            <button
              type="button"
              onClick={() => setOpen(open === s.stage ? null : s.stage)}
              className={`flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left text-sm transition hover:bg-accent ${
                s.status === "NOW" ? "border-primary bg-primary/5 font-medium" : "border-transparent"
              }`}
            >
              {open === s.stage ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
              <span className="w-6 text-xs text-muted-foreground">{s.n}</span>
              <StatusIcon status={s.status} />
              <span className="flex-1 capitalize">{s.stage.replace(/_/g, " ").toLowerCase()}</span>
              {s.status === "NOW" && <Badge>now</Badge>}
            </button>

            {open === s.stage && (
              <div className="ml-6 space-y-3 border-l pl-3 py-2">
                <p className="text-sm font-medium">{s.headline}</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">Needs</p>
                    <ul className="space-y-1 text-sm">
                      {(s.checklist.length ? s.checklist : [{ label: "outcome recorded", done: s.proof.length > 0 }]).map((c) => (
                        <li key={c.label} className={`flex items-center gap-2 ${c.done ? "text-muted-foreground" : "text-destructive"}`}>
                          {c.done ? <Check className="size-3.5" /> : <X className="size-3.5" />}
                          <span className="capitalize">{c.label}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">Already recorded</p>
                    {s.proof.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Capture the first record for this step below.</p>
                    ) : (
                      <ul className="space-y-1 text-sm text-muted-foreground">
                        {s.proof.map((p, i) => (
                          <li key={`${p.at}-${i}`}>
                            <span className="text-foreground">{p.label}</span> · {p.actor}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>

                {s.status === "LOCKED" ? (
                  <p className="text-xs text-muted-foreground">
                    Locked until step {now?.n ?? "—"} is closed. You can still read what it will ask for.
                  </p>
                ) : (
                  <>
                    <CapturePanel lead={lead} step={s} />
                    {s.status === "NOW" && (
                      <div className="flex flex-wrap gap-2">
                        {[...s.actions.primary, ...s.actions.secondary].map((id, i) =>
                          ACTIONS[id] ? (
                            <Button key={id} size="sm" variant={i === 0 ? "default" : "outline"} onClick={() => setAction(id)}>
                              {ACTIONS[id].label}
                            </Button>
                          ) : null,
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}
      <ActionDialog lead={lead} actionId={action} onClose={() => setAction(null)} />
    </Card>
  );
}

function StatusIcon({ status }: { status: StepView["status"] }) {
  if (status === "DONE") return <Check className="size-3.5 text-primary" />;
  if (status === "LOCKED") return <Lock className="size-3.5 text-muted-foreground" />;
  if (status === "SKIPPED") return <X className="size-3.5 text-destructive" />;
  return <span className="size-2 rounded-full bg-primary" />;
}
