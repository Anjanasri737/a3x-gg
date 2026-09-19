import { AlertTriangle, CheckCircle2, Clock3, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useCheckpointStore } from "@/movement-care/checkpoint-store";
import { CHECKPOINTS } from "@/movement-care/checkpoints";

export function CheckpointControl({ managerName, onOpenCustomer }: { managerName: string; onOpenCustomer?: (id: string) => void }) {
  const snapshots = useCheckpointStore((state) => state.snapshots);
  const overrides = useCheckpointStore((state) => state.overrides);
  const carryForwards = useCheckpointStore((state) => state.carryForwards);
  const acknowledge = useCheckpointStore((state) => state.acknowledgeOverride);
  const resolveRecovery = useCheckpointStore((state) => state.resolveRecovery);
  const today = new Date().toISOString().slice(0, 10);
  const current = snapshots.filter((item) => item.date === today);
  const people = [...new Set(current.map((item) => item.operatorId))];
  const open = current.filter((item) => item.recoveryState === "OPEN");
  const pendingOverrides = overrides.filter((item) => !item.acknowledgedAt);
  const completion = (code: keyof typeof CHECKPOINTS) => current.filter((item) => item.code === code).length;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
        {(["C1", "C2", "C3", "C4"] as const).map((code) => <Metric key={code} label={CHECKPOINTS[code].label} value={`${completion(code)}/${people.length || 1}`} />)}
        <Metric label="Open recoveries" value={open.length} danger={open.length > 0} />
        <Metric label="Tomorrow carry-forward" value={carryForwards.filter((item) => item.state === "OPEN").length} danger={carryForwards.some((item) => item.state === "OPEN")} />
      </div>

      <section className="border bg-card"><h3 className="border-b px-3 py-2 text-sm font-semibold">Who is behind, why, and who recovers it</h3><div className="divide-y">
        {open.length === 0 ? <p className="p-3 text-xs text-muted-foreground">No open checkpoint recovery yet.</p> : open.map((item) => <div key={item.id} className="grid gap-2 p-3 text-xs lg:grid-cols-[150px_130px_1fr_180px_auto] lg:items-center"><div><p className="font-semibold">{item.operatorName}</p><p className="text-muted-foreground">{item.role === "tcm" ? "TCM" : "Flow Ops"} · {item.code}</p></div><Badge variant="destructive" className="w-fit">{item.reason?.label ?? "Behind"}</Badge><div><p>{item.reason?.action}</p><div className="mt-1 flex flex-wrap gap-1">{item.reason?.affectedCustomerIds.slice(0, 6).map((id) => <Button key={id} size="sm" variant="outline" className="h-6 px-2 text-[9px]" onClick={() => onOpenCustomer?.(id)}>{id.slice(-8)}</Button>)}</div></div><div><p className="font-medium">{item.recoveryOwner}</p><p className="text-muted-foreground">Due {item.recoveryDueAt ? new Date(item.recoveryDueAt).toLocaleString() : "—"}</p></div><Button size="sm" variant="outline" onClick={() => resolveRecovery(item.id)}><CheckCircle2 className="h-3.5 w-3.5"/>Done</Button></div>)}
      </div></section>

      <section className="border bg-card"><h3 className="border-b px-3 py-2 text-sm font-semibold">Manager acknowledgements</h3><div className="divide-y">{pendingOverrides.length === 0 ? <p className="p-3 text-xs text-muted-foreground">No reason disagreements waiting.</p> : pendingOverrides.map((item) => <div key={item.id} className="flex flex-wrap items-center gap-2 p-3 text-xs"><AlertTriangle className="h-3.5 w-3.5 text-warning"/><div className="min-w-0 flex-1"><p className="font-semibold">{item.taxonomy}</p><p className="text-muted-foreground">{item.note} · raised by {item.by}</p></div><Button size="sm" onClick={() => acknowledge(item.id, managerName)}><Users className="h-3.5 w-3.5"/>Acknowledge</Button></div>)}</div></section>

      <section className="border bg-card"><h3 className="border-b px-3 py-2 text-sm font-semibold">Person 360 · same KPI rows through the day</h3><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-xs"><thead><tr className="border-b bg-muted/40">{["Person", "KPI", "C1", "C2", "Move", "C3", "Move", "C4", "Move", "Latest pace", "Gap"].map((head, index) => <th key={`${head}-${index}`} className="px-2 py-1.5">{head}</th>)}</tr></thead><tbody>{people.flatMap((personId) => { const rows=current.filter((item)=>item.operatorId===personId); const latest=rows.sort((a,b)=>a.code.localeCompare(b.code)).at(-1); return (latest?.results ?? []).map((metric) => { const get=(code:"C1"|"C2"|"C3"|"C4")=>rows.find((item)=>item.code===code)?.results.find((result)=>result.key===metric.key); const c1=get("C1"),c2=get("C2"),c3=get("C3"),c4=get("C4"); return <tr key={`${personId}-${metric.key}`} className="border-b"><td className="px-2 py-1.5 font-medium">{latest?.operatorName}</td><td className="px-2 py-1.5">{metric.label}</td><td className="px-2 py-1.5">{c1?.current ?? "Missing"}</td><td className="px-2 py-1.5">{c2?.current ?? "Missing"}</td><td className="px-2 py-1.5">{c2?.delta == null ? "—" : `${c2.delta>=0?"+":""}${c2.delta}`}</td><td className="px-2 py-1.5">{c3?.current ?? "Missing"}</td><td className="px-2 py-1.5">{c3?.delta == null ? "—" : `${c3.delta>=0?"+":""}${c3.delta}`}</td><td className="px-2 py-1.5">{c4?.current ?? "Missing"}</td><td className="px-2 py-1.5">{c4?.delta == null ? "—" : `${c4.delta>=0?"+":""}${c4.delta}`}</td><td className="px-2 py-1.5">{metric.expected}</td><td className="px-2 py-1.5">{metric.gap>=0?"+":""}{metric.gap}</td></tr>; }); })}</tbody></table></div></section>
    </div>
  );
}

function Metric({ label, value, danger }: { label: string; value: number | string; danger?: boolean }) { return <div className="border bg-card p-3"><p className="flex items-center gap-1 text-[10px] text-muted-foreground"><Clock3 className="h-3 w-3"/>{label}</p><p className={danger ? "mt-1 text-xl font-bold text-destructive" : "mt-1 text-xl font-bold"}>{value}</p></div>; }