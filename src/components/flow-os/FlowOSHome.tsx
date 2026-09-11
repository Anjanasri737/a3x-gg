import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, ArrowRight, Camera, CheckCircle2, Layers3, RefreshCw, ShieldCheck, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { RevenueLeakagePanel } from "./RevenueLeakagePanel";
import { UnifiedCustomerWorkspace } from "./UnifiedCustomerWorkspace";
import { getTruthRow, listTruthRows, type TruthRow } from "@/lib/flow-os/service";

export function FlowOSHome() {
  const [truth, setTruth] = useState<TruthRow[]>([]);
  const [selected, setSelected] = useState<TruthRow | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try { setTruth(await listTruthRows()); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  const stats = useMemo(() => ({
    total: truth.length,
    red: truth.filter((r) => r.sync_state === "RED").length,
    amber: truth.filter((r) => r.sync_state === "AMBER").length,
    green: truth.filter((r) => r.sync_state === "GREEN").length,
    unowned: truth.filter((r) => !r.current_owner && !r.reservation_operator).length,
    activeHandlers: new Set(truth.map((r) => r.current_handler).filter(Boolean)).size,
  }), [truth]);

  async function openLead(leadId: string) {
    const row = await getTruthRow(leadId);
    if (row) setSelected(row);
  }

  if (selected) return <div className="space-y-3">
    <div className="flex justify-between gap-3"><Button variant="outline" onClick={() => setSelected(null)}>← Back to Flow OS</Button><Badge variant="outline">ONE FLOW OS</Badge></div>
    <UnifiedCustomerWorkspace lead={selected} onClose={() => setSelected(null)} onChanged={async () => { await load(); const row = await getTruthRow(selected.lead_id); if (row) setSelected(row); }} />
  </div>;

  return <div className="space-y-5">
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <div className="flex flex-wrap items-center gap-2"><h1 className="text-3xl font-bold tracking-tight">Gharpayy Flow OS 100x</h1><Badge className="gap-1"><ShieldCheck className="h-3 w-3" /> OCR → CHECK-IN</Badge></div>
        <p className="mt-2 max-w-4xl text-sm text-muted-foreground">One canonical customer, one pipeline stage, one Draft reservation, one live handler, one mission, one blocker, one dated next action and one verified physical check-in. WhatsApp screenshots are external truth evidence, not a second CRM.</p>
      </div>
      <Button variant="outline" onClick={() => void load()} disabled={loading}><RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />Refresh truth</Button>
    </header>

    <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
      <Stat label="Canonical customers" value={stats.total} icon={Users} />
      <Stat label="Revenue leaks" value={stats.red} icon={AlertTriangle} danger={stats.red > 0} />
      <Stat label="Sync required" value={stats.amber} icon={AlertTriangle} warn={stats.amber > 0} />
      <Stat label="Synchronized" value={stats.green} icon={CheckCircle2} good />
      <Stat label="Unowned" value={stats.unowned} icon={Users} danger={stats.unowned > 0} />
      <Stat label="Live handlers" value={stats.activeHandlers} icon={Users} />
    </div>

    <div className="grid gap-3 md:grid-cols-3">
      <JourneyCard step="1" title="WhatsApp Truth Sync" description="Upload 20–30+ screenshots, independently declare visible-row count, extract every row, resolve identity and prove zero silent drops." to="/vision" icon={Camera} />
      <JourneyCard step="2" title="Draft 30 / Active 13" description="ROI-balanced portfolio, owner-safe reservation and collision-proof live work for the eight-person operating team." to="/my-work" icon={Layers3} />
      <JourneyCard step="3" title="Customer → Check-in" description="Open one customer workspace for WhatsApp evidence, property/tour, quote, payment, owner approval and physical check-in gates." to="/my-work" icon={ShieldCheck} />
    </div>

    <Card className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="font-semibold">Golden spine</h2><p className="mt-1 text-sm text-muted-foreground">Screenshots → observations → identity → lead/cycle → owner → Draft 30 → Active 13 → dossier → match → tour → post-tour → quote → payment → booking → arrival → KYC → agreement → room/bed → keys → CHECKED_IN.</p></div>
        <Badge variant="outline">No parallel CRM</Badge>
      </div>
    </Card>

    <RevenueLeakagePanel onOpenLead={openLead} />
  </div>;
}

function Stat({ label, value, icon: Icon, danger, warn, good }: { label: string; value: number; icon: React.ComponentType<{ className?: string }>; danger?: boolean; warn?: boolean; good?: boolean }) {
  return <Card className={`p-3 ${danger ? "border-red-500/45" : warn ? "border-amber-500/45" : good ? "border-emerald-500/40" : ""}`}><div className="flex items-center justify-between"><div className="text-2xl font-bold tabular-nums">{value}</div><Icon className="h-4 w-4 text-muted-foreground" /></div><div className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div></Card>;
}

function JourneyCard({ step, title, description, to, icon: Icon }: { step: string; title: string; description: string; to: string; icon: React.ComponentType<{ className?: string }> }) {
  return <Card className="p-4"><div className="flex items-center gap-2"><span className="flex h-7 w-7 items-center justify-center rounded-full border text-xs font-bold">{step}</span><Icon className="h-4 w-4" /><h3 className="font-semibold">{title}</h3></div><p className="mt-3 text-sm text-muted-foreground">{description}</p><Button asChild variant="outline" className="mt-4 w-full"><Link to={to as any}>Open <ArrowRight className="ml-1.5 h-4 w-4" /></Link></Button></Card>;
}
