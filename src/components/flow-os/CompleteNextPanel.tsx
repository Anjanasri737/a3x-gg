import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { CalendarClock, CheckCircle2, X } from "lucide-react";
import { completeAndNext, type FlowOutcome } from "@/lib/flow-os/work-actions";
import { toast } from "sonner";

const OUTCOMES: { value: FlowOutcome; label: string; dated: boolean; noteRequired?: boolean }[] = [
  { value: "waiting", label: "Worked → next action", dated: true },
  { value: "future", label: "Move to Future", dated: true },
  { value: "handoff", label: "Handoff", dated: true },
  { value: "booked", label: "Booked", dated: false },
  { value: "checked_in", label: "Checked In", dated: false },
  { value: "lost", label: "Lost", dated: false, noteRequired: true },
];

export function CompleteNextPanel({
  item,
  onDone,
  onClose,
}: {
  item: any;
  onDone: (result: any) => void;
  onClose: () => void;
}) {
  const [outcome, setOutcome] = useState<FlowOutcome>("waiting");
  const [nextAction, setNextAction] = useState(item?.mission || "Follow up");
  const [nextAt, setNextAt] = useState(() => {
    const d = new Date(Date.now() + 2 * 3600_000);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  });
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const cfg = useMemo(() => OUTCOMES.find((x) => x.value === outcome)!, [outcome]);

  async function submit() {
    if (!item?.work_claim_id) { toast.error("Active work claim is required before disposition"); return; }
    if (cfg.dated && (!nextAction.trim() || !nextAt)) { toast.error("A dated next action is mandatory"); return; }
    if (cfg.noteRequired && !notes.trim()) { toast.error("Lost reason is mandatory"); return; }
    setBusy(true);
    try {
      const result = await completeAndNext({
        batchItemId: item.id,
        claimId: item.work_claim_id,
        outcome,
        nextActionKind: cfg.dated ? nextAction.trim() : null,
        nextActionAt: cfg.dated ? new Date(nextAt).toISOString() : null,
        notes: notes.trim() || null,
      });
      toast.success(cfg.dated ? "Saved, scheduled and moved to the next customer" : `${cfg.label} saved · next customer promoted`);
      onDone(result);
    } catch (e: any) {
      toast.error(e?.message || "Could not complete disposition");
    } finally { setBusy(false); }
  }

  return (
    <Card className="p-4 border-primary/30 shadow-lg space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4" /><h3 className="font-semibold">Complete & Next</h3><Badge variant="outline">No silent exit</Badge></div>
          <p className="text-xs text-muted-foreground mt-1">Finish this work with a valid commercial disposition. Future/waiting/handoff cannot be saved without a date.</p>
        </div>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}><X className="h-4 w-4" /></Button>
      </div>

      <div className="flex gap-1.5 flex-wrap">
        {OUTCOMES.map((o) => <Button key={o.value} type="button" size="sm" variant={outcome === o.value ? "default" : "outline"} className="h-8 text-xs" onClick={() => setOutcome(o.value)}>{o.label}</Button>)}
      </div>

      {cfg.dated && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="text-xs space-y-1"><span>Next action</span><Input value={nextAction} onChange={(e) => setNextAction(e.target.value)} placeholder="Call / confirm tour / send quote" /></label>
          <label className="text-xs space-y-1"><span className="flex items-center gap-1"><CalendarClock className="h-3 w-3" /> Due date & time</span><Input type="datetime-local" value={nextAt} onChange={(e) => setNextAt(e.target.value)} /></label>
        </div>
      )}
      <label className="text-xs space-y-1"><span>{outcome === "lost" ? "Lost reason *" : "Outcome note"}</span><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={outcome === "lost" ? "Booked elsewhere / budget mismatch / plan changed…" : "What happened, what changed, what the next owner should know"} /></label>
      <Button className="w-full" onClick={submit} disabled={busy}>{busy ? "Saving…" : `${cfg.label} · Complete & Next`}</Button>
    </Card>
  );
}
