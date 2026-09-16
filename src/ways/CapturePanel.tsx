// Shared capture surface for every "way". There is never a dead end here:
// if the step has no missing field, it still asks for the outcome, the owner,
// the next action and the deadline — capturing something is the whole point.
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useMyMoves } from "@/mymoves/store";
import type { Lead } from "@/mymoves/types";
import type { StepView } from "@/bookingos/steps";

type FieldKey = "owner" | "nextAction" | "nextActionAt" | "blocker" | "area" | "moveIn" | "roomType" | "budget" | "intent";

const FIELD_FOR_LABEL: Record<string, FieldKey> = {
  owner: "owner",
  "next action": "nextAction",
  deadline: "nextActionAt",
  "decision date": "nextActionAt",
  "follow-up date": "nextActionAt",
  "expected price or decision date": "nextActionAt",
  blocker: "blocker",
  reason: "blocker",
  area: "area",
  "move-in": "moveIn",
  "room type": "roomType",
  budget: "budget",
  intent: "intent",
};

const META: Record<FieldKey, { label: string; type: string }> = {
  owner: { label: "Owner", type: "text" },
  nextAction: { label: "Next action", type: "text" },
  nextActionAt: { label: "Next-action deadline", type: "datetime-local" },
  blocker: { label: "Blocker / reason", type: "text" },
  area: { label: "Area", type: "text" },
  moveIn: { label: "Move-in date", type: "date" },
  roomType: { label: "Room type", type: "text" },
  budget: { label: "Budget", type: "number" },
  intent: { label: "Customer intent", type: "text" },
};

const INTENTS = ["READY_TO_BOOK", "READY_TO_VISIT", "COMPARING", "JUST_EXPLORING"];

/** Always at least these — a step must leave a record behind. */
const ALWAYS: FieldKey[] = ["owner", "nextAction", "nextActionAt"];

export function CapturePanel({ lead, step, compact }: { lead: Lead; step: StepView; compact?: boolean }) {
  const updateLeadDetails = useMyMoves((s) => s.updateLeadDetails);
  const base = useMemo(
    () => ({
      owner: lead.owner ?? "",
      nextAction: lead.nextAction ?? "",
      nextActionAt: lead.nextActionAt?.slice(0, 16) ?? "",
      blocker: lead.blocker ?? "",
      area: lead.requirement.area ?? "",
      moveIn: lead.requirement.moveIn ?? "",
      roomType: lead.requirement.roomType ?? "",
      budget: lead.requirement.budget ? String(lead.requirement.budget) : "",
      intent: lead.requirement.intent ?? "",
    }),
    [lead],
  );
  const [values, setValues] = useState(base);
  const [saved, setSaved] = useState(false);
  const set = (k: FieldKey, v: string) => {
    setValues((c) => ({ ...c, [k]: v }));
    setSaved(false);
  };

  const missing = step.checklist.filter((c) => !c.done).map((c) => FIELD_FOR_LABEL[c.label]).filter(Boolean) as FieldKey[];
  const fields = Array.from(new Set([...missing, ...ALWAYS])).slice(0, compact ? 4 : 9);
  const unmapped = step.checklist.filter((c) => !c.done && !FIELD_FOR_LABEL[c.label]).map((c) => c.label);

  return (
    <div className="space-y-3 rounded-md border bg-muted/30 p-3">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Capture on this step</p>
        <p className="text-xs text-muted-foreground">
          {missing.length > 0
            ? `Record what is missing so this step can close: ${step.checklist.filter((c) => !c.done).map((c) => c.label).join(", ")}.`
            : "Nothing is missing on the form — so record the outcome, who owns it and when the next move is due."}
        </p>
      </div>

      <div className={compact ? "grid gap-3" : "grid gap-3 sm:grid-cols-2"}>
        {fields.map((key) =>
          key === "intent" ? (
            <div key={key} className="space-y-1.5 sm:col-span-2">
              <Label>Customer intent</Label>
              <div className="flex flex-wrap gap-2">
                {INTENTS.map((i) => (
                  <Button key={i} size="sm" variant={values.intent === i ? "default" : "outline"} onClick={() => set("intent", i)}>
                    {i.replace(/_/g, " ")}
                  </Button>
                ))}
              </div>
            </div>
          ) : (
            <div key={key} className="space-y-1.5">
              <Label htmlFor={`cap-${step.stage}-${key}`}>{META[key].label}</Label>
              <Input
                id={`cap-${step.stage}-${key}`}
                type={META[key].type}
                value={values[key]}
                onChange={(e) => set(key, e.target.value)}
              />
            </div>
          ),
        )}
      </div>

      {unmapped.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Still needs an action button (not a text field): {unmapped.join(", ")}.
        </p>
      )}

      <div className="flex items-center gap-2">
        <Button
          size="sm"
          onClick={() => {
            updateLeadDetails(lead.id, values);
            setSaved(true);
          }}
        >
          Save to history
        </Button>
        {saved && <span className="text-xs text-muted-foreground">Saved and added to this customer's timeline.</span>}
      </div>
    </div>
  );
}
