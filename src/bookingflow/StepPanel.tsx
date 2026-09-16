// One step, opened. Shows what is done, what is missing, the question to ask,
// the answer buttons, and what the next step will be.
import { useEffect, useState } from "react";
import { ArrowRight, Check, Lock, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { JOURNEY, isExtraRequired, isStepDone, missingOn } from "./journey";
import type { JStep } from "./journey";
import type { FlowLead } from "./types";
import { useBookingFlow } from "./store";

export function StepPanel({ lead, stepKey, expert }: { lead: FlowLead; stepKey: string; expert: boolean }) {
  const { answerStep, editFields } = useBookingFlow();
  const f = lead.f ?? {};
  const idx = JOURNEY.findIndex((s) => s.key === stepKey);
  const step = JOURNEY[idx] as JStep;
  const currentIdx = JOURNEY.findIndex((s) => !isStepDone(f, s));
  const [values, setValues] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    setValues({});
    setEditing(false);
  }, [stepKey, lead.id]);

  if (!step) return null;

  const done = isStepDone(f, step);
  const isNow = currentIdx === idx;
  const locked = !done && !isNow;
  const canWrite = isNow || expert || editing;

  const put = (k: string, v: string) => setValues((s) => ({ ...s, [k]: v }));

  function submit(mainValue?: string) {
    const payload = { ...values, ...(mainValue !== undefined ? { [step.field]: mainValue } : {}) };
    const main = payload[step.field] ?? f[step.field];
    if (!main) {
      toast.error(`${step.title} is still empty`);
      return;
    }
    const merged = { ...f, ...payload };
    const missingExtra = (step.extra ?? []).filter((x) => !merged[x.field] && isExtraRequired(merged, step, x.field));
    if (missingExtra.length) {
      toast.error(`Also fill: ${missingExtra.map((m) => m.label).join(", ")}`);
      return;
    }
    if (done || editing) {
      editFields(lead.id, payload, "corrected on a completed step");
      toast.success("Updated and logged");
      setEditing(false);
      return;
    }
    answerStep(lead.id, step.key, payload);
    toast.success(`${step.title} — saved`);
    setValues({});
  }

  const nextStep = JOURNEY[idx + 1];
  const missing = missingOn(f, step);
  const inputType = step.kind === "DATE" ? "date" : step.kind === "DATETIME" ? "datetime-local" : step.kind === "NUMBER" ? "number" : "text";

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="text-[10px]">Step {idx + 1} of {JOURNEY.length}</Badge>
        <Badge variant="secondary" className="text-[10px]">{step.group}</Badge>
        {done && <Badge className="bg-primary/15 text-[10px] text-primary hover:bg-primary/15"><Check className="mr-1 h-3 w-3" />Done</Badge>}
        {isNow && <Badge className="text-[10px]">Do this now</Badge>}
        {locked && <Badge variant="outline" className="text-[10px]"><Lock className="mr-1 h-3 w-3" />Locked</Badge>}
        <span className="ml-auto text-[10px] text-muted-foreground">waiting on {step.waitingOn}</span>
      </div>

      <h3 className="mt-2 text-lg font-semibold">{step.question}</h3>
      <p className="text-sm text-muted-foreground">{step.help}</p>

      {done && !editing && (
        <div className="mt-3 rounded-md border bg-muted/40 p-3 text-xs">
          <p className="font-medium">Answer on record</p>
          <p className="mt-0.5 text-muted-foreground">
            {step.options?.find((o) => o.value === f[step.field])?.label ?? f[step.field]}
            {(step.extra ?? []).map((x) => (f[x.field] ? ` · ${x.label}: ${f[x.field]}` : "")).join("")}
          </p>
          <Button size="sm" variant="outline" className="mt-2 h-7 px-2 text-[11px]" onClick={() => setEditing(true)}>
            <Pencil className="mr-1 h-3 w-3" />Correct this (it gets logged)
          </Button>
        </div>
      )}

      {locked && !expert && (
        <div className="mt-3 rounded-md border border-dashed p-3 text-xs text-muted-foreground">
          This step opens after step {currentIdx + 1} — {JOURNEY[currentIdx]?.title}. Still needed there: {missingOn(f, JOURNEY[currentIdx]).join(", ") || "an answer"}.
        </div>
      )}

      {canWrite && !(done && !editing) && (
        <div className="mt-4 space-y-2">
          {step.kind === "CHOICE" &&
            step.options?.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => submit(o.value)}
                className="flex w-full items-center justify-between rounded-md border p-3 text-left transition hover:border-primary hover:bg-accent"
              >
                <span>
                  <span className="block text-sm font-medium">{o.label}</span>
                  {o.hint && <span className="block text-xs text-muted-foreground">{o.hint}</span>}
                  {o.effect === "ESCALATE" && <span className="block text-xs text-destructive">Goes to Control Tower</span>}
                  {o.effect === "CLOSE" && <span className="block text-xs text-destructive">Closes the journey with a reason</span>}
                </span>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </button>
            ))}

          {step.kind !== "CHOICE" && (
            <div className="flex flex-wrap gap-2">
              <Input
                className="max-w-xs"
                type={inputType}
                placeholder={step.placeholder}
                value={values[step.field] ?? f[step.field] ?? ""}
                onChange={(e) => put(step.field, e.target.value)}
              />
            </div>
          )}

          {(step.extra ?? []).map((x) => (
            <label key={x.field} className="block text-xs">
              <span className="text-muted-foreground">{x.label}</span>
              <Input
                className="mt-1 max-w-xs"
                type={x.kind === "DATE" ? "date" : x.kind === "DATETIME" ? "datetime-local" : x.kind === "NUMBER" ? "number" : "text"}
                placeholder={x.placeholder}
                value={values[x.field] ?? f[x.field] ?? ""}
                onChange={(e) => put(x.field, e.target.value)}
              />
            </label>
          ))}

          {(step.kind !== "CHOICE" || (step.extra ?? []).length > 0) && (
            <Button size="sm" onClick={() => submit()}>Save this step</Button>
          )}
        </div>
      )}

      {!done && missing.length > 0 && (
        <p className="mt-3 text-xs text-destructive">Still missing here: {missing.join(", ")}</p>
      )}

      {nextStep && (
        <div className="mt-4 border-t pt-3 text-xs">
          <p className="text-muted-foreground">After this comes</p>
          <p className="font-medium">{idx + 2}. {nextStep.title} — {nextStep.question}</p>
        </div>
      )}
    </Card>
  );
}
