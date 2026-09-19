import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock3, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { MovementEvent, MovementState } from "@/movement/types";
import type { CareRole } from "./playbooks";
import { useCheckpointStore } from "./checkpoint-store";
import { calculateResults, checkpointDue, CHECKPOINTS, deriveValues, diagnose, type CheckpointCode } from "./checkpoints";

const codes = Object.keys(CHECKPOINTS) as CheckpointCode[];

export function CheckpointPanel({ role, operatorId, operatorName, states, events, onOpenCustomer }: {
  role: CareRole; operatorId: string; operatorName: string; states: MovementState[]; events: MovementEvent[]; onOpenCustomer?: (id: string) => void;
}) {
  const snapshots = useCheckpointStore((state) => state.snapshots);
  const overrides = useCheckpointStore((state) => state.overrides);
  const saveSnapshot = useCheckpointStore((state) => state.saveSnapshot);
  const addOverride = useCheckpointStore((state) => state.addOverride);
  const today = new Date().toISOString().slice(0, 10);
  const mine = snapshots.filter((item) => item.date === today && item.operatorId === operatorId && item.role === role);
  const [code, setCode] = useState<CheckpointCode>(() => codes.find((item) => !mine.some((snapshot) => snapshot.code === item)) ?? "C4");
  const [note, setNote] = useState("");
  const [recoveryOwner, setRecoveryOwner] = useState(operatorName);
  const [overrideText, setOverrideText] = useState("");
  const [overrideKind, setOverrideKind] = useState("UNCAPTURED_BLOCKER");
  const previous = mine.filter((item) => codes.indexOf(item.code) < codes.indexOf(code)).sort((a, b) => codes.indexOf(b.code) - codes.indexOf(a.code))[0];
  const values = useMemo(() => deriveValues(role, states, events), [role, states, events]);
  const results = useMemo(() => calculateResults(role, code, values, previous), [role, code, values, previous]);
  const reason = useMemo(() => diagnose(role, values, results, states), [role, values, results, states]);
  const saved = mine.find((item) => item.code === code);

  const submit = () => {
    const due = code === "C2" ? "17:00" : code === "C3" ? "20:00" : code === "C4" ? "10:30" : "13:00";
    const recoveryDate = code === "C4" ? new Date(Date.now() + 86_400_000).toISOString().slice(0, 10) : today;
    saveSnapshot({
      id: `checkpoint-${today}-${operatorId}-${code}`, date: today, operatorId, operatorName, role, code,
      dueAt: checkpointDue(today, code), capturedAt: new Date().toISOString(), values, results, reason,
      recoveryOwner, recoveryDueAt: reason ? new Date(`${recoveryDate}T${due}:00`).toISOString() : null,
      recoveryState: reason ? "OPEN" : "DONE", mustWinCustomerIds: reason?.affectedCustomerIds.slice(0, 3) ?? [], note: note.trim(),
    });
  };

  return (
    <section className="border bg-card">
      <div className="flex flex-wrap items-center gap-2 border-b p-2">
        <Clock3 className="h-3.5 w-3.5 text-primary" /><p className="text-[10px] font-semibold uppercase text-muted-foreground">Four-checkpoint scorecard</p>
        <div className="ml-auto flex gap-1">{codes.map((item) => <Button key={item} size="sm" variant={code === item ? "default" : mine.some((snapshot) => snapshot.code === item) ? "secondary" : "outline"} className="h-6 px-2 text-[9px]" onClick={() => setCode(item)}>{item}</Button>)}</div>
      </div>
      <div className="p-2">
        <div className="flex items-center justify-between gap-2"><div><p className="text-xs font-semibold">{CHECKPOINTS[code].label}</p><p className="text-[10px] text-muted-foreground">{CHECKPOINTS[code].question}</p></div><Badge variant={saved ? "secondary" : "outline"}>{saved ? "Submitted" : "Due"}</Badge></div>
        <div className="mt-2 max-h-56 overflow-auto border">
          <div className="grid grid-cols-[minmax(130px,1fr)_repeat(5,48px)] gap-1 border-b bg-muted/40 px-2 py-1 text-[9px] font-semibold text-muted-foreground"><span>KPI</span><span>Previous</span><span>Now</span><span>Move</span><span>Pace</span><span>Gap</span></div>
          {results.map((item) => <div key={item.key} className="grid grid-cols-[minmax(130px,1fr)_repeat(5,48px)] gap-1 border-b px-2 py-1 text-[10px] last:border-0"><span className="truncate">{item.label}</span><span>{item.previous ?? "—"}</span><span className="font-semibold">{item.current}</span><span>{item.delta === null ? "—" : `${item.delta >= 0 ? "+" : ""}${item.delta}`}</span><span>{item.expected}</span><span className={cn(item.status === "CRITICAL" || item.status === "BEHIND" ? "text-destructive" : "text-success")}>{item.gap >= 0 ? "+" : ""}{item.gap}</span></div>)}
        </div>
        {reason ? <div className="mt-2 border border-destructive/40 bg-destructive/5 p-2"><div className="flex gap-1.5"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 text-destructive"/><div><p className="text-xs font-semibold text-destructive">{reason.label}</p><p className="text-[10px] text-muted-foreground">{reason.action}</p></div></div><div className="mt-1 flex flex-wrap gap-1">{reason.affectedCustomerIds.slice(0, 8).map((id) => <Button key={id} size="sm" variant="outline" className="h-6 px-2 text-[9px]" onClick={() => onOpenCustomer?.(id)}>{id.slice(-8)}</Button>)}</div></div> : <div className="mt-2 flex items-center gap-1.5 text-xs text-success"><CheckCircle2 className="h-3.5 w-3.5"/>No recovery reason triggered.</div>}
        <div className="mt-2 grid gap-1.5 sm:grid-cols-2"><Input value={recoveryOwner} onChange={(event) => setRecoveryOwner(event.target.value)} placeholder="Recovery owner" className="h-8 text-xs"/><Input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Exceptional context only" className="h-8 text-xs"/></div>
        <Button size="sm" className="mt-2 w-full" onClick={submit}>{saved ? "Refresh this checkpoint" : "Submit checkpoint"}</Button>
        {saved?.reason && <div className="mt-2 border-t pt-2"><p className="text-[10px] font-semibold uppercase text-muted-foreground">Disagree with the system reason</p><div className="mt-1 grid gap-1 sm:grid-cols-[150px_1fr]"><select value={overrideKind} onChange={(event) => setOverrideKind(event.target.value)} className="h-8 rounded-md border bg-background px-2 text-xs"><option value="UNCAPTURED_BLOCKER">Uncaptured blocker</option><option value="SOURCE_DELAY">Source delay</option><option value="WRONG_COHORT">Wrong customer group</option><option value="OTHER">Other</option></select><Textarea value={overrideText} onChange={(event) => setOverrideText(event.target.value)} placeholder="Explain the disagreement. The system reason remains in history." className="min-h-16 text-xs"/></div><Button size="sm" variant="outline" className="mt-1" disabled={!overrideText.trim()} onClick={() => { addOverride({ snapshotId: saved.id, taxonomy: overrideKind, note: overrideText.trim(), by: operatorName }); setOverrideText(""); }}>Send for manager acknowledgement</Button>{overrides.filter((item) => item.snapshotId === saved.id).map((item) => <p key={item.id} className="mt-1 text-[10px] text-muted-foreground"><Users className="mr-1 inline h-3 w-3"/>{item.taxonomy} · {item.acknowledgedAt ? `Acknowledged by ${item.acknowledgedBy}` : "Waiting for manager"}</p>)}</div>}
      </div>
    </section>
  );
}