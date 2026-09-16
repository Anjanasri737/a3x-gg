// One screen per customer. Answers the five questions at the top, the journey
// in the middle, the proof at the bottom.
import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowLeft, Clock, ShieldAlert, UserCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { StepRail } from "./StepRail";
import { StepPanel } from "./StepPanel";
import { health, fmtMins } from "./engine";
import { NEXT_ACTIONS } from "./journey";
import { HANDLERS } from "./types";
import type { FlowLead } from "./types";
import { useBookingFlow } from "./store";

const dueIn = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString().slice(0, 16);

export function Workspace({ lead, onBack, onNext }: { lead: FlowLead; onBack: () => void; onNext: () => void }) {
  const { mode, me, setNext, claim, escalate, reassign, setTemp } = useBookingFlow();
  const expert = mode === "EXPERT";
  const [selected, setSelected] = useState<string>("");
  const [nextAction, setNextAction] = useState(NEXT_ACTIONS[0]!);
  const [due, setDue] = useState(dueIn(2));
  const [mounted, setMounted] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => setMounted(true), []);

  const h = useMemo(() => (mounted ? health(lead) : undefined), [lead, mounted]);
  const currentKey = h?.step?.key;

  useEffect(() => {
    if (currentKey) setSelected((s) => s || currentKey);
  }, [currentKey]);

  const openKey = selected || currentKey || "CAPTURE";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="ghost" onClick={onBack}><ArrowLeft className="mr-1 h-4 w-4" />Back to the board</Button>
        <Button size="sm" variant="outline" onClick={onNext}>Next customer</Button>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">{lead.name}</h2>
            <p className="text-xs text-muted-foreground">{lead.phone} · {lead.waAccount}</p>
            <p className="mt-1 max-w-lg text-xs text-muted-foreground">Last message: “{lead.lastMessage}”</p>
          </div>
          {mounted && h && (
            <div className="grid gap-1 text-xs">
              <Row label="Where is it" value={h.complete ? "Checked in" : h.step?.title ?? "—"} />
              <Row label="Who owns it" value={lead.owner ?? "NOBODY"} bad={!lead.owner} />
              <Row label="Waiting on" value={h.waitingOn} />
              <Row label="What next" value={lead.nextAction ?? "NOT SET"} bad={!lead.nextAction} />
              <Row
                label="By when"
                value={lead.nextActionAt ? new Date(lead.nextActionAt).toLocaleString() : "NO DEADLINE"}
                bad={!lead.nextActionAt || h.sla === "LATE"}
              />
            </div>
          )}
        </div>

        {mounted && h && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <Badge variant="outline" className="text-[10px]">{h.done} of {h.total} steps done</Badge>
            {h.sla === "LATE" && <Badge variant="destructive" className="text-[10px]"><Clock className="mr-1 h-3 w-3" />Late by {fmtMins(h.minutesLate)}</Badge>}
            {h.sla === "DUE" && <Badge className="bg-amber-500 text-[10px] hover:bg-amber-500">Due within the hour</Badge>}
            {h.toTower && <Badge variant="destructive" className="text-[10px]"><ShieldAlert className="mr-1 h-3 w-3" />Control Tower</Badge>}
            {h.signals.map((s) => (
              <Badge key={s} variant="outline" className="border-destructive/40 text-[10px] text-destructive"><AlertTriangle className="mr-1 h-3 w-3" />{s}</Badge>
            ))}
          </div>
        )}

        <div className="mt-3 flex flex-wrap items-end gap-2 border-t pt-3">
          {!lead.owner && (
            <Button size="sm" onClick={() => { claim(lead.id); toast.success(`${lead.name} is yours, ${me}`); }}>
              <UserCheck className="mr-1.5 h-4 w-4" />I own this lead
            </Button>
          )}
          <div>
            <p className="mb-1 text-[10px] uppercase text-muted-foreground">Next step</p>
            <div className="flex flex-wrap gap-1">
              {NEXT_ACTIONS.map((a) => (
                <Button key={a} size="sm" variant={a === nextAction ? "default" : "outline"} className="h-7 px-2 text-[11px]" onClick={() => setNextAction(a)}>{a}</Button>
              ))}
            </div>
          </div>
          <label className="text-xs">
            <span className="text-muted-foreground">By when</span>
            <Input type="datetime-local" className="mt-1 h-8 w-[13rem]" value={due} onChange={(e) => setDue(e.target.value)} />
          </label>
          <Button size="sm" variant="secondary" onClick={() => { setNext(lead.id, nextAction, new Date(due).toISOString()); toast.success("Next step and deadline locked"); }}>
            Lock it
          </Button>
          <Button size="sm" variant="outline" onClick={() => { escalate(lead.id, "Operator asked for help"); toast.success("Control Tower notified"); }}>
            Send to Control Tower
          </Button>
          {expert && (
            <>
              <select
                className="h-8 rounded-md border bg-background px-2 text-xs"
                value={lead.owner ?? ""}
                onChange={(e) => { reassign(lead.id, e.target.value); toast.success(`Handed to ${e.target.value}`); }}
              >
                <option value="">Reassign to…</option>
                {HANDLERS.map((x) => <option key={x} value={x}>{x}</option>)}
              </select>
              <Button size="sm" variant="outline" className="h-8" onClick={() => setTemp(lead.id, "HOT", "Expert override")}>Mark hot</Button>
              <Button size="sm" variant="outline" className="h-8" onClick={() => setTemp(lead.id, "COLD", "Expert override")}>Mark cold</Button>
            </>
          )}
        </div>
      </Card>

      <Card className="p-4">
        <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
          The journey — click any step to see what is done, what is missing and what comes next
        </p>
        <StepRail lead={lead} selected={openKey} onSelect={(k) => { setSelected(k); panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }} allowLocked={expert} />
      </Card>

      <div ref={panelRef}>
        <StepPanel lead={lead} stepKey={openKey} expert={expert} />
      </div>

      <Card className="p-4">
        <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">What has already happened ({lead.events.length})</p>
        <ol className="space-y-1.5 text-xs">
          {[...lead.events].reverse().map((e, i) => (
            <li key={i} className="flex flex-wrap gap-1.5 border-b pb-1.5 last:border-0">
              <span className="text-muted-foreground">{mounted ? new Date(e.at).toLocaleString() : ""}</span>
              <span className="font-medium">{e.label}</span>
              {e.detail && <span className="text-muted-foreground">— {e.detail}</span>}
              <span className="ml-auto text-muted-foreground">{e.actor}</span>
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}

function Row({ label, value, bad }: { label: string; value: string; bad?: boolean }) {
  return (
    <div className="flex gap-2">
      <span className="w-24 text-muted-foreground">{label}</span>
      <span className={bad ? "font-medium text-destructive" : "font-medium"}>{value}</span>
    </div>
  );
}
