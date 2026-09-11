import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RefreshCw, Zap, Layers3, Clock3, MessageCircle, Play, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { LeadSignalCard } from "./LeadSignalCard";
import { UnifiedCustomerWorkspace } from "./UnifiedCustomerWorkspace";
import {
  claimLead,
  createDraft30,
  currentUserId,
  listTruthRows,
  loadMyActiveDraft,
  type TruthRow,
} from "@/lib/flow-os/service";

type SelectedWork = { lead: TruthRow; item?: any };

export function FlowWorkPage() {
  const [draft, setDraft] = useState<any>(null);
  const [truth, setTruth] = useState<TruthRow[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<SelectedWork | null>(null);

  const load = async () => {
    const [uid, d, t] = await Promise.all([currentUserId(), loadMyActiveDraft(), listTruthRows()]);
    setUserId(uid);
    setDraft(d);
    setTruth(t);
  };
  useEffect(() => { void load(); }, []);

  const openItems = useMemo(() => (draft?.items ?? []).filter((i: any) => ["active", "queued"].includes(i.status) && i.lead), [draft]);
  const activeItems = useMemo(() => openItems.filter((i: any) => i.status === "active").slice(0, 13), [openItems]);
  const completeItems = useMemo(() => (draft?.items ?? []).filter((i: any) => i.status === "completed"), [draft]);
  const futureItems = useMemo(() => (draft?.items ?? []).filter((i: any) => i.status === "future" && i.lead), [draft]);

  const mine = useMemo(() => truth.filter((r) => {
    if (!userId) return false;
    return r.current_owner === userId || r.reservation_operator === userId || r.current_handler === userId;
  }), [truth, userId]);
  const interrupts = useMemo(() => mine.filter((r) => r.unread_visible && ["RED", "AMBER"].includes(r.sync_state)), [mine]);
  const dueNow = useMemo(() => mine.filter((r) => r.next_action_at && Date.parse(r.next_action_at) <= Date.now()).length, [mine]);

  async function makeDraft() {
    setBusy(true);
    try {
      const result = await createDraft30(30);
      setDraft(result);
      toast.success(`Draft 30 ready: ${(result?.items ?? []).filter((i: any) => ["active", "queued"].includes(i.status)).length} collision-safe customers`);
      await load();
    } catch (error: any) {
      toast.error(error?.message || "Could not create/refill Draft 30");
    } finally {
      setBusy(false);
    }
  }

  async function activate(lead: TruthRow, item?: any) {
    try {
      const claim = await claimLead(
        lead.lead_id,
        item?.intelligence?.inferredWorkBucket || "NOW",
        item?.batch_id ?? draft?.batch?.id ?? lead.current_batch_id ?? null,
        item?.mission || "Work customer now",
        lead.next_action_at,
      );
      const claimRow = Array.isArray(claim) ? claim[0] : claim;
      setSelected({
        lead: { ...lead, claim_id: claimRow?.id ?? lead.claim_id, current_handler: userId, claim_state: "active" },
        item: item ? { ...item, work_claim_id: claimRow?.id ?? item.work_claim_id } : undefined,
      });
      await load();
    } catch (error: any) {
      const msg = String(error?.message || error || "Lead cannot be opened");
      toast.error(msg.includes("OWNED_BY_OTHER") ? "This customer belongs to another owner. Reassign explicitly in Control Tower." : msg.includes("ALREADY_CLAIMED") ? "Another operator is already handling or has drafted this customer." : msg);
    }
  }

  if (selected) return <div className="space-y-3">
    <div className="flex items-center justify-between gap-3"><Button variant="outline" onClick={() => setSelected(null)}>← Back to My Work</Button><Badge variant="outline">ONE CUSTOMER WORKSPACE</Badge></div>
    <UnifiedCustomerWorkspace lead={selected.lead} item={selected.item} onClose={() => setSelected(null)} onChanged={load} />
  </div>;

  return <div className="space-y-4">
    <header className="flex items-end justify-between gap-3 flex-wrap">
      <div>
        <div className="flex items-center gap-2"><h1 className="text-2xl font-bold tracking-tight">My Flow OS</h1><Badge variant="outline">Draft 30 → Active 13</Badge></div>
        <p className="text-sm text-muted-foreground mt-1">One customer, one owner/reservation, one live handler, one mission, one dated next action. Drafting cannot steal another person's customer.</p>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" onClick={() => void load()}><RefreshCw className="h-4 w-4 mr-2" />Refresh</Button>
        <Button onClick={() => void makeDraft()} disabled={busy}><Layers3 className="h-4 w-4 mr-2" />{draft ? "Refill Draft 30" : "Start Draft 30"}</Button>
      </div>
    </header>

    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
      <Stat label="My open Draft" value={`${openItems.length}/30`} icon={Layers3} />
      <Stat label="Active tray" value={`${activeItems.length}/13`} icon={Zap} good={activeItems.length > 0} />
      <Stat label="Due now" value={dueNow} icon={Clock3} warn={dueNow > 0} />
      <Stat label="My priority interrupts" value={interrupts.length} icon={MessageCircle} warn={interrupts.length > 0} />
    </div>

    <Tabs defaultValue="now" className="space-y-3">
      <TabsList className="h-auto flex-wrap">
        <TabsTrigger value="now">NOW ({activeItems.length + interrupts.length})</TabsTrigger>
        <TabsTrigger value="draft">MY 30 ({openItems.length})</TabsTrigger>
        <TabsTrigger value="future">WAITING / FUTURE ({futureItems.length})</TabsTrigger>
        <TabsTrigger value="done">DONE ({completeItems.length})</TabsTrigger>
      </TabsList>

      <TabsContent value="now" className="space-y-3">
        {interrupts.filter((lead) => !activeItems.some((i: any) => i.lead_id === lead.lead_id)).map((lead) => <div key={`interrupt-${lead.lead_id}`} className="relative pt-2">
          <div className="absolute top-0 left-3 z-10"><Badge className="text-[9px] gap-1"><Zap className="h-3 w-3" /> PRIORITY INTERRUPT</Badge></div>
          <LeadSignalCard lead={lead} onPrimary={() => void activate(lead)} primaryLabel="Open now" />
        </div>)}
        {activeItems.map((item: any) => <div key={item.id} className="space-y-1">
          <LeadSignalCard lead={item.lead} onPrimary={() => void activate(item.lead, item)} primaryLabel={item.mission || "Open workspace"} />
          <div className="flex justify-end"><Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => void activate(item.lead, item)}><CheckCircle2 className="h-3.5 w-3.5 mr-1" />Work / Complete & Next</Button></div>
        </div>)}
        {!activeItems.length && !interrupts.length && <Empty text="No immediate work. Start or refill Draft 30." />}
      </TabsContent>

      <TabsContent value="draft" className="space-y-2">
        {openItems.map((item: any) => <div key={item.id} className="grid grid-cols-[48px_1fr] gap-2 items-start">
          <div className="rounded-lg border text-center py-2 text-sm font-bold">#{item.rank}</div>
          <LeadSignalCard lead={item.lead} compact onPrimary={() => void activate(item.lead, item)} primaryLabel={item.status === "active" ? "Open" : "Activate"} />
        </div>)}
        {!openItems.length && <Empty text="No open Draft 30. Start one and the ROI portfolio engine will reserve the best eligible customers without collisions." />}
      </TabsContent>

      <TabsContent value="future" className="space-y-2">
        {futureItems.map((item: any) => <LeadSignalCard key={item.id} lead={item.lead} compact onPrimary={() => void activate(item.lead, item)} primaryLabel="Review future" />)}
        {!futureItems.length && <Empty text="No customers intentionally parked with a dated future action in this Draft." />}
      </TabsContent>

      <TabsContent value="done" className="space-y-2">
        {completeItems.map((item: any) => <Card key={item.id} className="p-3 text-sm flex justify-between items-center"><span>{item.mission || item.lead_id}</span><Badge variant="secondary">Completed</Badge></Card>)}
        {!completeItems.length && <Empty text="Completed work will appear here." />}
      </TabsContent>
    </Tabs>
  </div>;
}

function Stat({ label, value, icon: Icon, warn, good }: { label: string; value: string | number; icon: React.ComponentType<{ className?: string }>; warn?: boolean; good?: boolean }) {
  return <Card className={`p-3 ${warn ? "border-amber-500/50" : good ? "border-emerald-500/40" : ""}`}><div className="flex justify-between"><div className="text-2xl font-bold tabular-nums">{value}</div><Icon className="h-4 w-4 text-muted-foreground" /></div><div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div></Card>;
}

function Empty({ text }: { text: string }) {
  return <Card className="p-8 text-center text-sm text-muted-foreground"><Play className="h-5 w-5 mx-auto mb-2" />{text}</Card>;
}
