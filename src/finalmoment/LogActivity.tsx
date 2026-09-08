// Full CRM activity logger for Final Moment: pick the category, the outcome, add a note,
// choose the next step — one click writes the state change, the event and the next action.
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { useMovement } from "@/movement/store";
import { NEXT_ACTION_LABEL, type MovementState } from "@/movement/types";
import { FM_CATEGORIES, toneClass, type FMActivity } from "./activities";
import { useFinalMoment } from "./store";

interface Props {
  lead: MovementState;
  onLogged?: () => void;
}

export function LogActivity({ lead, onLogged }: Props) {
  const mv = useMovement();
  const fm = useFinalMoment();
  const [cat, setCat] = useState(FM_CATEGORIES[0].key);
  const [pick, setPick] = useState<FMActivity | null>(null);
  const [note, setNote] = useState("");
  const [stepKey, setStepKey] = useState<string | null>(null);

  const category = useMemo(() => FM_CATEGORIES.find((c) => c.key === cat)!, [cat]);
  const steps = pick?.nextSteps ?? [];
  const chosen = steps.find((s) => s.key === stepKey) ?? steps[0];

  function choose(a: FMActivity) {
    // tap once to select, tap the same one again to log it straight away
    if (pick?.key === a.key) {
      submit();
      return;
    }
    setPick(a);
    setStepKey(a.nextSteps[0]?.key ?? null);
  }

  function submit() {
    if (!pick) {
      toast.error("Pick what happened first");
      return;
    }
    pick.apply(mv, lead, note.trim());
    if (pick.counter) {
      fm.bump(pick.counter);
      // an outcome finishes the lead for this round's 90-minute pace
      if (["tours", "quotes", "bookings", "closed"].includes(pick.counter)) fm.markDone(lead.ulid);
    }
    mv.log(lead.ulid, "note", `${pick.emoji} ${pick.label}${note.trim() ? ` — ${note.trim()}` : ""}`);

    if (chosen && chosen.inHours > 0) {
      mv.setNextAction(lead.ulid, {
        kind: chosen.kind,
        dueAt: new Date(Date.now() + chosen.inHours * 3600000).toISOString(),
        ownerId: mv.actor.id,
        ownerName: mv.actor.name,
        note: chosen.label,
      });
    }
    toast.success(`${pick.label}${chosen && chosen.inHours > 0 ? ` · next: ${chosen.label}` : ""}`);
    setPick(null);
    setNote("");
    setStepKey(null);
    onLogged?.();
  }

  return (
    <div className="space-y-3 rounded-lg border p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Log activity — every CRM action
        </div>
        {lead.nextAction && (
          <Badge variant="outline" className="text-[10px]">
            next: {NEXT_ACTION_LABEL[lead.nextAction.kind]} ·{" "}
            {new Date(lead.nextAction.dueAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </Badge>
        )}
      </div>

      <div className="flex flex-wrap gap-1">
        {FM_CATEGORIES.map((c) => (
          <button
            key={c.key}
            onClick={() => setCat(c.key)}
            className={cn(
              "rounded-full border px-2.5 py-1 text-[11px]",
              cat === c.key ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground",
            )}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {category.activities.map((a) => (
          <button
            key={a.key}
            onClick={() => choose(a)}
            className={cn("rounded-md border px-2 py-1 text-[11px]", toneClass(a.tone, pick?.key === a.key))}
          >
            <span className="mr-1">{a.emoji}</span>
            {a.label}
          </button>
        ))}
      </div>

      {pick && (
        <>
          <Separator />
          <Textarea
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={pick.hint ?? "Add what the customer said (optional)"}
            className="text-xs"
          />
          {steps.length > 0 && (
            <div>
              <div className="pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Then what happens
              </div>
              <div className="flex flex-wrap gap-1.5">
                {steps.map((s) => (
                  <button
                    key={s.key}
                    onClick={() => setStepKey(s.key)}
                    className={cn(
                      "rounded-md border px-2 py-1 text-[11px]",
                      chosen?.key === s.key ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground",
                    )}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          )}
          <Button className="w-full" size="sm" onClick={submit}>
            Log “{pick.label}”
          </Button>
        </>
      )}
    </div>
  );
}
