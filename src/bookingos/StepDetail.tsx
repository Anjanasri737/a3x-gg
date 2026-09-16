import { useState } from "react";
import { Check, Pencil, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ActionDialog } from "@/mymoves/ActionDialog";
import { ACTIONS } from "@/mymoves/workflow";
import type { Lead } from "@/mymoves/types";
import { useMyMoves } from "@/mymoves/store";
import { TOTAL_STEPS, type StepView } from "./steps";

const STATUS_TEXT: Record<StepView["status"], string> = {
  DONE: "Done",
  NOW: "Happening now",
  LOCKED: "Not reachable yet",
  SKIPPED: "Passed without a recorded action",
};

export function StepDetail({ lead, step, now }: { lead: Lead; step: StepView; now?: StepView }) {
  const [action, setAction] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
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
        <div className="flex items-center gap-2">
          {step.status !== "LOCKED" && (
            <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
              <Pencil className="size-3.5" /> Edit details
            </Button>
          )}
          <Badge variant={step.status === "NOW" ? "default" : step.status === "DONE" ? "secondary" : "outline"}>
            {STATUS_TEXT[step.status]}
          </Badge>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">What this step needs</p>
          {step.checklist.length === 0 ? (
            <p className="text-sm text-muted-foreground">This step still needs an outcome recorded — use the buttons below or Edit details, so the customer never sits without a record.</p>
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
              {step.status === "DONE" || step.status === "SKIPPED" ? "No action was recorded on this step — record it now so the history is complete." : "Record the first outcome for this step."}
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
        {live ? (
          <div className="flex flex-wrap gap-2">
            {step.actions.primary.map((id) => btn(id, "default"))}
            {step.actions.secondary.map((id) => btn(id, "outline"))}
          </div>
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">
            {step.status === "LOCKED"
              ? `Locked — the customer is on step ${now?.n ?? "—"} (${now?.stage.replace(/_/g, " ") ?? "off ladder"}). Finish that first.`
              : "This step is complete. Use Edit details above to correct its recorded information; progression stays on the current step."}
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
      <EditDetailsDialog lead={lead} open={editing} onClose={() => setEditing(false)} />
    </Card>
  );
}

function EditDetailsDialog({ lead, open, onClose }: { lead: Lead; open: boolean; onClose: () => void }) {
  const updateLeadDetails = useMyMoves((s) => s.updateLeadDetails);
  const [values, setValues] = useState(() => ({
    owner: lead.owner ?? "",
    nextAction: lead.nextAction ?? "",
    nextActionAt: lead.nextActionAt?.slice(0, 16) ?? "",
    blocker: lead.blocker ?? "",
    area: lead.requirement.area ?? "",
    moveIn: lead.requirement.moveIn ?? "",
    roomType: lead.requirement.roomType ?? "",
    budget: lead.requirement.budget ? String(lead.requirement.budget) : "",
    intent: lead.requirement.intent ?? "",
  }));
  const set = (key: keyof typeof values, value: string) => setValues((current) => ({ ...current, [key]: value }));

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle>Edit customer execution details</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">Corrections are added to history. The customer stays on the current journey step.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <EditField label="Owner" value={values.owner} onChange={(v) => set("owner", v)} />
          <EditField label="Next action" value={values.nextAction} onChange={(v) => set("nextAction", v)} />
          <EditField label="Next-action deadline" type="datetime-local" value={values.nextActionAt} onChange={(v) => set("nextActionAt", v)} />
          <EditField label="Blocker / inactivity reason" value={values.blocker} onChange={(v) => set("blocker", v)} />
          <EditField label="Area" value={values.area} onChange={(v) => set("area", v)} />
          <EditField label="Move-in date" type="date" value={values.moveIn} onChange={(v) => set("moveIn", v)} />
          <EditField label="Room type" value={values.roomType} onChange={(v) => set("roomType", v)} />
          <EditField label="Budget" type="number" value={values.budget} onChange={(v) => set("budget", v)} />
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Customer intent</Label>
            <div className="flex flex-wrap gap-2">
              {["READY_TO_BOOK", "READY_TO_VISIT", "COMPARING", "JUST_EXPLORING"].map((intent) => (
                <Button key={intent} size="sm" variant={values.intent === intent ? "default" : "outline"} onClick={() => set("intent", intent)}>
                  {intent.replace(/_/g, " ")}
                </Button>
              ))}
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => { updateLeadDetails(lead.id, values); onClose(); }}>Save changes</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EditField({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input type={type} value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}
