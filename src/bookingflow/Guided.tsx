import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, CheckCircle2, Clock } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NEXT_ACTIONS, STEPS } from "./types";
import type { FlowLead } from "./types";
import { useBookingFlow } from "./store";

const dueIn = (hours: number) => new Date(Date.now() + hours * 3_600_000).toISOString().slice(0, 16);

export function Guided({ lead, onNext, onBack }: { lead: FlowLead; onNext: () => void; onBack: () => void }) {
  const { answer, finishQualification, escalate } = useBookingFlow();
  const [draft, setDraft] = useState("");
  const [blocker, setBlocker] = useState("");
  const [nextAction, setNextAction] = useState(NEXT_ACTIONS[0]);
  const [due, setDue] = useState(dueIn(2));

  const stepIndex = useMemo(() => STEPS.findIndex((s) => !lead.q[s.key]), [lead.q]);
  const step = stepIndex >= 0 ? STEPS[stepIndex] : undefined;
  const answered = stepIndex < 0 ? STEPS.length : stepIndex;

  function save(value: string) {
    if (!step || !value.trim()) return;
    answer(lead.id, step.key, value);
    setDraft("");
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button size="sm" variant="ghost" onClick={onBack}><ArrowLeft className="mr-1 h-4 w-4" />Back to batch</Button>
        <Badge variant="secondary">Step 3 of 3 · Qualify</Badge>
        <Badge variant="outline">{answered} of {STEPS.length} answered</Badge>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold">{lead.name}</h2>
            <p className="text-xs text-muted-foreground">{lead.phone} · {lead.waAccount} · owner {lead.owner ?? "unassigned"}</p>
          </div>
          <p className="max-w-xs truncate text-xs text-muted-foreground">Last message: “{lead.lastMessage}”</p>
        </div>
      </Card>

      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div className="h-full bg-primary transition-all" style={{ width: `${(answered / STEPS.length) * 100}%` }} />
      </div>

      {step ? (
        <Card className="p-5">
          <p className="text-xs uppercase tracking-wide text-primary">Question {stepIndex + 1} · {step.goal}</p>
          <h3 className="mt-1 text-xl font-semibold">{step.question}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{step.help}</p>

          <div className="mt-4 space-y-2">
            {step.kind === "CHOICE" &&
              step.options?.map((o) => (
                <button key={o.value} onClick={() => save(o.value)} className="flex w-full items-center justify-between rounded-md border p-3 text-left transition hover:border-primary hover:bg-accent">
                  <span>
                    <span className="block text-sm font-medium">{o.label}</span>
                    {o.hint && <span className="block text-xs text-muted-foreground">{o.hint}</span>}
                  </span>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </button>
              ))}
            {step.kind !== "CHOICE" && (
              <div className="flex gap-2">
                <Input
                  autoFocus
                  type={step.kind === "DATE" ? "date" : "text"}
                  placeholder={step.placeholder}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && save(draft)}
                />
                <Button onClick={() => save(draft)} disabled={!draft.trim()}>Save</Button>
              </div>
            )}
          </div>

          {answered > 0 && (
            <div className="mt-5 border-t pt-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Already answered</p>
              <ul className="mt-1 space-y-0.5 text-xs">
                {STEPS.slice(0, answered).map((s) => (
                  <li key={s.key} className="flex items-center gap-1.5">
                    <CheckCircle2 className="h-3 w-3 text-primary" /><span className="text-muted-foreground">{s.goal}:</span> <span>{String(lead.q[s.key])}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      ) : (
        <Card className="p-5">
          <p className="text-xs uppercase tracking-wide text-primary">Last screen · lock the next step</p>
          <h3 className="mt-1 text-xl font-semibold">
            {lead.q.ack === "CAN_CLOSE" && "You said you can close this. What happens next?"}
            {lead.q.ack === "NEED_HELP" && "You need help. Tell Control Tower what is blocking you."}
            {lead.q.ack === "NOT_REAL" && "Not a real lead. Give the reason before closing."}
          </h3>

          {lead.q.ack !== "CAN_CLOSE" && (
            <Textarea className="mt-3 min-h-20" placeholder="Budget too low, no inventory, wrong number, parent not agreeing…" value={blocker} onChange={(e) => setBlocker(e.target.value)} />
          )}

          <div className="mt-4 space-y-3">
            <div>
              <p className="mb-1 text-xs text-muted-foreground">Next step</p>
              <div className="flex flex-wrap gap-1.5">
                {NEXT_ACTIONS.map((a) => (
                  <Button key={a} size="sm" variant={a === nextAction ? "default" : "outline"} className="h-7 px-2 text-[11px]" onClick={() => setNextAction(a)}>{a}</Button>
                ))}
              </div>
            </div>
            <label className="block text-xs">
              <span className="text-muted-foreground">Do it by</span>
              <Input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} className="mt-1 max-w-xs" />
            </label>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              onClick={() => {
                if (lead.q.ack !== "CAN_CLOSE" && !blocker.trim()) { toast.error("Write the reason first"); return; }
                if (blocker.trim()) answer(lead.id, "blocker", blocker.trim());
                finishQualification(lead.id, nextAction, new Date(due).toISOString());
                if (lead.q.ack === "NEED_HELP") escalate(lead.id, blocker.trim());
                toast.success(`${lead.name} is marked — ${nextAction}`);
                onNext();
              }}
            >
              <Clock className="mr-1.5 h-4 w-4" />Save and open the next customer
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
