import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RefreshCw, Zap, Layers3, Clock3, MessageCircle, Play, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { LeadSignalCard } from "./LeadSignalCard";
import {
  claimLead,
  createDraft30,
  listTruthRows,
  loadMyActiveDraft,
  releaseClaim,
  type TruthRow,
} from "@/lib/flow-os/service";

export function FlowWorkPage() {
  const [draft, setDraft] = useState<any>(null);
  const [truth, setTruth] = useState<TruthRow[]>([]);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const [d, t] = await Promise.all([loadMyActiveDraft(), listTruthRows()]);
    setDraft(d);
    setTruth(t);
  };
  useEffect(() => { void load(); }, []);

  const activeItems = useMemo(() => (draft?.items ?? []).filter((i: any) => i.status === "active").slice(0, 13), [draft]);
  const queuedItems = useMemo(() => (draft?.items ?? []).filter((i: any) => i.status === "queued"), [draft]);
  const completeItems = useMemo(() => (draft?.items ?? []).filter((i: any) => i.status === "completed"), [draft]);
  const dueNow = truth.filter((r) => r.next_action_at && Date.parse(r.next_action_at) <= Date.now()).length;
  const interrupts = truth.filter((r) => r.unread_visible && (r.sync_state === "RED" || r.sync_state === "AMBER")).length;
  const future = truth.filter((r) => r.sync_state === "GREY");

  async function makeDraft() {
    setBusy(true);
    try {
      const result = await createDraft30(30);
      setDraft({ batch: result.batch, items: result.items });
      toast.success(`Draft created: ${result.items.length} collision-safe leads reserved`);
    } catch (e: any) {
      toast.error(e?.message || "Could not create Draft 30");
    } finally { setBusy(false); }
  }

  async function activate(lead: TruthRow) {
    try {
      await claimLead(lead.lead_id, "NOW", draft?.batch?.id ?? null, "Open / Resume", new Date().toISOString());
      toast.success("Lead locked to you for active work");
      await load();
    } catch (e: any) {
      const msg = String(e?.message || e || "Lead is already being worked");
      toast.error(msg.includes("LEAD_ALREADY_CLAIMED") ? "Another operator is already handling this lead" : msg);
    }
  }

  async function complete(item: any) {
    try {
      if (item.work_claim_id) await releaseClaim(item.work_claim_id, "completed");
      toast.success("Completed and claim released. Next work can replenish safely.");
      await load();
    } catch (e: any) { toast.error(e?.message || "Could not complete item"); }
  }

  return (
    <div className="space-y-4">
      <header className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">My Flow OS</h1>
            <Badge variant="outline">Draft 30 → Active 13</Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">One customer, one active handler, one mission. Fresh WhatsApp movement can reorder your work without stealing another person's claim.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => void load()}><RefreshCw className="h-4 w-4 mr-2" />Refresh</Button>
          <Button onClick={makeDraft} disabled={busy}><Layers3 className="h-4 w-4 mr-2" />{draft ? "Refill / New Draft 30" : "Start Draft 30"}</Button>
        </div>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Stat label="My Draft" value={`${draft?.items?.length ?? 0}/30`} icon={Layers3} />
        <Stat label="Active Tray" value={`${activeItems.length}/13`} icon={Zap} />
        <Stat label="Due now" value={dueNow} icon={Clock3} warn={dueNow > 0} />
        <Stat label="Priority interrupts" value={interrupts} icon={MessageCircle} warn={interrupts > 0} />
      </div>

      <Tabs defaultValue="now" className="space-y-3">
        <TabsList className="h-auto flex-wrap">
          <TabsTrigger value="now">NOW ({activeItems.length + interrupts})</TabsTrigger>
          <TabsTrigger value="draft">MY 30 ({draft?.items?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="future">WAITING / FUTURE ({future.length})</TabsTrigger>
          <TabsTrigger value="done">DONE TODAY ({completeItems.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="now" className="space-y-3">
          {truth.filter((r) => r.unread_visible && (r.sync_state === "RED" || r.sync_state === "AMBER")).map((lead) => (
            <div key={`interrupt-${lead.lead_id}`} className="relative">
              <div className="absolute -top-2 left-3 z-10"><Badge className="text-[9px] gap-1"><Zap className="h-3 w-3" /> PRIORITY INTERRUPT</Badge></div>
              <LeadSignalCard lead={lead} onPrimary={() => activate(lead)} />
            </div>
          ))}
          {activeItems.map((item: any) => item.lead && (
            <div key={item.id} className="space-y-1">
              <LeadSignalCard lead={item.lead} onPrimary={() => activate(item.lead)} primaryLabel={item.mission || "Resume"} />
              <div className="flex justify-end"><Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => complete(item)}><CheckCircle2 className="h-3 w-3 mr-1" />Complete & Next</Button></div>
            </div>
          ))}
          {!activeItems.length && !interrupts && <Empty text="No immediate work. Start or refill Draft 30." />}
        </TabsContent>

        <TabsContent value="draft" className="space-y-2">
          {(draft?.items ?? []).map((item: any) => item.lead && (
            <div key={item.id} className="grid grid-cols-[44px_1fr] gap-2 items-start">
              <div className="rounded-lg border text-center py-2 text-sm font-bold">#{item.rank}</div>
              <LeadSignalCard lead={item.lead} compact onPrimary={() => activate(item.lead)} primaryLabel={item.mission || undefined} />
            </div>
          ))}
          {!draft?.items?.length && <Empty text="No active Draft 30. The system will reserve the highest-value eligible leads atomically when you start one." />}
        </TabsContent>

        <TabsContent value="future" className="space-y-2">
          {future.map((lead) => <LeadSignalCard key={lead.lead_id} lead={lead} compact onPrimary={() => activate(lead)} primaryLabel="Reactivate" />)}
          {!future.length && <Empty text="No intentionally parked future/waiting leads in the 3-day view." />}
        </TabsContent>

        <TabsContent value="done" className="space-y-2">
          {completeItems.map((item: any) => (
            <Card key={item.id} className="p-3 text-sm flex justify-between items-center"><span>{item.mission || item.lead_id}</span><Badge variant="secondary">Completed</Badge></Card>
          ))}
          {!completeItems.length && <Empty text="Completed work will appear here." />}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Stat({ label, value, icon: Icon, warn }: { label: string; value: string | number; icon: React.ComponentType<{ className?: string }>; warn?: boolean }) {
  return <Card className={`p-3 ${warn ? "border-amber-500/50" : ""}`}><div className="flex justify-between"><div className="text-2xl font-bold tabular-nums">{value}</div><Icon className="h-4 w-4 text-muted-foreground" /></div><div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div></Card>;
}

function Empty({ text }: { text: string }) {
  return <Card className="p-8 text-center text-sm text-muted-foreground"><Play className="h-5 w-5 mx-auto mb-2" />{text}</Card>;
}
