import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Upload, RefreshCw, ShieldCheck, AlertTriangle, Eye, Users, MessageCircle, Database, Plus } from "lucide-react";
import { toast } from "sonner";
import { LeadSignalCard } from "./LeadSignalCard";
import {
  createLabelRule,
  ingestManualBatch,
  listLabelRules,
  listScreenshotBatches,
  listTruthRows,
  type ManualObservationInput,
  type ScreenshotBatchSummary,
  type TruthRow,
} from "@/lib/flow-os/service";

function parseManualRows(raw: string): ManualObservationInput[] {
  return raw
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [contactName = "", phone = "", lastMessage = "", seenRaw = "unknown", colorHint = "", handlerHint = ""] = line.split("|").map((x) => x.trim());
      const seenState = seenRaw.toLowerCase().includes("unseen") ? "unseen" : seenRaw.toLowerCase().includes("seen") ? "seen" : "unknown";
      const unreadVisible = seenState === "unseen" || /unread/i.test(seenRaw);
      return {
        contactName,
        phone,
        lastMessage,
        direction: unreadVisible ? "incoming" : "unknown",
        seenState,
        unreadVisible,
        colorHint: colorHint || null,
        handlerHint: handlerHint || null,
        rawText: line,
      } satisfies ManualObservationInput;
    });
}

function KPI({ label, value, danger, good, icon: Icon }: { label: string; value: number | string; danger?: boolean; good?: boolean; icon?: React.ComponentType<{ className?: string }> }) {
  return (
    <div className={`rounded-xl border p-3 ${danger ? "border-red-500/50 bg-red-500/5" : good ? "border-emerald-500/40 bg-emerald-500/5" : "bg-card"}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="text-2xl font-bold tabular-nums">{value}</div>
        {Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
      </div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground mt-1">{label}</div>
    </div>
  );
}

export function ScreenshotSyncPage() {
  const [batches, setBatches] = useState<ScreenshotBatchSummary[]>([]);
  const [truth, setTruth] = useState<TruthRow[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [account, setAccount] = useState("Gharpayy WhatsApp");
  const [visibleRows, setVisibleRows] = useState(0);
  const [manualRows, setManualRows] = useState("");
  const [busy, setBusy] = useState(false);
  const [ruleColor, setRuleColor] = useState("green");
  const [ruleSeen, setRuleSeen] = useState<"seen" | "unseen" | "unknown">("unseen");
  const [rulePattern, setRulePattern] = useState("visit|coming|tour");
  const [ruleLabel, setRuleLabel] = useState("Tour-ready");

  const load = async () => {
    const [b, t] = await Promise.all([listScreenshotBatches(), listTruthRows()]);
    setBatches(b);
    setTruth(t);
  };

  useEffect(() => { void load(); }, []);

  const rows = useMemo(() => parseManualRows(manualRows), [manualRows]);
  const counters = useMemo(() => ({
    unique: truth.filter((r) => r.latest_observation_at).length,
    red: truth.filter((r) => r.sync_state === "RED").length,
    amber: truth.filter((r) => r.sync_state === "AMBER").length,
    green: truth.filter((r) => r.sync_state === "GREEN").length,
    grey: truth.filter((r) => r.sync_state === "GREY").length,
    unread: truth.filter((r) => r.unread_visible).length,
    unowned: truth.filter((r) => !r.current_owner && !r.current_handler).length,
    noAction: truth.filter((r) => !r.next_action_at && r.sync_state !== "GREEN").length,
  }), [truth]);

  async function processBatch() {
    if (visibleRows <= 0) { toast.error("Enter the exact number of visible WhatsApp rows first"); return; }
    if (rows.length === 0) { toast.error("Add extracted/review rows. No row may disappear silently."); return; }
    setBusy(true);
    try {
      const result = await ingestManualBatch({
        whatsappAccount: account,
        screenshotNames: files.map((f) => f.name),
        visibleRowsExpected: visibleRows,
        rows,
      });
      if (result.counts.silentDrops > 0) {
        toast.error(`${result.counts.silentDrops} visible row(s) are still unaccounted — batch remains INCOMPLETE`);
      } else {
        toast.success(`Batch reconciled: ${result.counts.visibleRows} / ${result.counts.visibleRows} rows accounted`);
      }
      await load();
    } catch (e: any) {
      toast.error(e?.message || "Screenshot reconciliation failed");
    } finally {
      setBusy(false);
    }
  }

  async function saveRule() {
    try {
      await createLabelRule({
        whatsappAccount: account,
        colorHint: ruleColor || null,
        seenState: ruleSeen,
        textPattern: rulePattern || null,
        inferredLabel: ruleLabel,
        inferredPriority: ruleSeen === "unseen" ? "hot" : "active",
        inferredBucket: /visit|tour/i.test(rulePattern) ? "TOUR_READY" : "TODAY",
        rank: 10,
        isEnabled: true,
      });
      toast.success("Colour / seen / message label rule saved");
      void listLabelRules();
    } catch (e: any) { toast.error(e?.message || "Could not save rule"); }
  }

  const latestBatch = batches[0];
  const accounted = latestBatch ? latestBatch.rows_reconciled + latestBatch.unresolved_count : 0;
  const silentDrops = latestBatch ? Math.max(0, latestBatch.visible_rows_expected - accounted) : 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">WhatsApp Truth Sync</h1>
            <Badge variant="outline">3-day reconciliation</Badge>
          </div>
          <p className="text-sm text-muted-foreground max-w-3xl mt-1">
            Upload the same WhatsApp universe repeatedly. Screenshots are evidence; customers are permanent. Every visible row must end as CRM, review, duplicate observation or justified non-customer — never silently dropped.
          </p>
        </div>
        <Button variant="outline" onClick={() => void load()} className="gap-2"><RefreshCw className="h-4 w-4" /> Refresh truth</Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-2">
        <KPI label="3-day customers" value={counters.unique} icon={Users} />
        <KPI label="Revenue leaks" value={counters.red} danger={counters.red > 0} icon={AlertTriangle} />
        <KPI label="Sync required" value={counters.amber} danger={counters.amber > 0} />
        <KPI label="Synchronized" value={counters.green} good icon={ShieldCheck} />
        <KPI label="Future / waiting" value={counters.grey} />
        <KPI label="Fresh unread" value={counters.unread} danger={counters.unread > 0} icon={MessageCircle} />
        <KPI label="Unowned" value={counters.unowned} danger={counters.unowned > 0} />
        <KPI label="No next action" value={counters.noAction} danger={counters.noAction > 0} />
      </div>

      <Tabs defaultValue="upload" className="space-y-4">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="upload">Upload & reconcile</TabsTrigger>
          <TabsTrigger value="leakage">Revenue leakage</TabsTrigger>
          <TabsTrigger value="moved">Moved / unread</TabsTrigger>
          <TabsTrigger value="synced">Synchronized</TabsTrigger>
          <TabsTrigger value="rules">Colour & label rules</TabsTrigger>
        </TabsList>

        <TabsContent value="upload" className="space-y-4">
          <div className="grid grid-cols-1 xl:grid-cols-[1fr_1.2fr] gap-4">
            <Card className="p-4 space-y-4">
              <div>
                <h2 className="font-semibold">1. Screenshot batch</h2>
                <p className="text-xs text-muted-foreground">20–30+ screenshots can be selected together. Raw image OCR is adapter-based; this build uses explicit row review when no vision provider is configured.</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="text-xs space-y-1"><span>WhatsApp account</span><Input value={account} onChange={(e) => setAccount(e.target.value)} /></label>
                <label className="text-xs space-y-1"><span>Exact visible rows</span><Input type="number" min={0} value={visibleRows || ""} onChange={(e) => setVisibleRows(Number(e.target.value))} placeholder="e.g. 181" /></label>
              </div>
              <label className="rounded-xl border border-dashed p-6 text-center block cursor-pointer hover:bg-muted/30">
                <Upload className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
                <div className="font-medium text-sm">Select screenshots</div>
                <div className="text-xs text-muted-foreground">{files.length ? `${files.length} selected` : "PNG / JPG / screenshots"}</div>
                <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => setFiles(Array.from(e.target.files ?? []))} />
              </label>
              <div className="rounded-lg bg-muted/40 p-3 text-xs">
                <b>Zero-miss gate:</b> visible rows must equal resolved + review + justified non-customer. Exact screenshot reuploads should be hashed by the future OCR adapter; newer observations of the same customer are appended, never duplicated as new customers.
              </div>
            </Card>

            <Card className="p-4 space-y-3">
              <div>
                <h2 className="font-semibold">2. Extraction / review rows</h2>
                <p className="text-xs text-muted-foreground">Current no-provider adapter. One line = one visible chat row. Format: Name | Phone | Last message | seen/unseen | colour/label hint | handler hint.</p>
              </div>
              <Textarea
                className="min-h-[240px] font-mono text-xs"
                value={manualRows}
                onChange={(e) => setManualRows(e.target.value)}
                placeholder={`Rahul Sharma | 9876543210 | Can I visit today at 6? | unseen | green | Aditi\nPriya | 9988776655 | Please share photos | seen | blue | Avani`}
              />
              <div className="grid grid-cols-3 gap-2">
                <KPI label="Expected" value={visibleRows} />
                <KPI label="Segmented" value={rows.length} good={rows.length === visibleRows && visibleRows > 0} />
                <KPI label="Unaccounted before save" value={Math.max(0, visibleRows - rows.length)} danger={rows.length !== visibleRows} />
              </div>
              <Button className="w-full gap-2" size="lg" disabled={busy} onClick={processBatch}>
                <Database className="h-4 w-4" /> {busy ? "Reconciling…" : "Reconcile into CRM"}
              </Button>
            </Card>
          </div>

          {latestBatch && (
            <Card className={`p-4 ${silentDrops ? "border-red-500/50" : "border-emerald-500/40"}`}>
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <div className="font-semibold">Latest reconciliation</div>
                  <div className="text-xs text-muted-foreground">{latestBatch.whatsapp_account || "WhatsApp"} · {new Date(latestBatch.uploaded_at).toLocaleString()}</div>
                </div>
                <Badge variant={silentDrops ? "destructive" : "secondary"}>{latestBatch.status.toUpperCase()}</Badge>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-6 gap-2 mt-3">
                <KPI label="Screenshots" value={latestBatch.screenshot_count} />
                <KPI label="Visible" value={latestBatch.visible_rows_expected} />
                <KPI label="Segmented" value={latestBatch.rows_segmented} />
                <KPI label="Resolved" value={latestBatch.rows_reconciled} />
                <KPI label="Review" value={latestBatch.unresolved_count} />
                <KPI label="Silent drops" value={silentDrops} danger={silentDrops > 0} good={silentDrops === 0} />
              </div>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="leakage" className="space-y-2">
          {truth.filter((r) => r.sync_state === "RED").map((r) => <LeadSignalCard key={r.lead_id} lead={r} />)}
          {!truth.some((r) => r.sync_state === "RED") && <Empty text="Zero red leakage items in the current 3-day truth view." />}
        </TabsContent>

        <TabsContent value="moved" className="space-y-2">
          {truth.filter((r) => r.sync_state === "AMBER" || r.unread_visible).map((r) => <LeadSignalCard key={r.lead_id} lead={r} />)}
          {!truth.some((r) => r.sync_state === "AMBER" || r.unread_visible) && <Empty text="No stale CRM / fresh-unread mismatches right now." />}
        </TabsContent>

        <TabsContent value="synced" className="space-y-2">
          {truth.filter((r) => r.sync_state === "GREEN" || r.sync_state === "GREY").map((r) => <LeadSignalCard key={r.lead_id} lead={r} compact />)}
        </TabsContent>

        <TabsContent value="rules">
          <Card className="p-4 space-y-4 max-w-3xl">
            <div>
              <h2 className="font-semibold">Colour + seen/unseen + last-message label rules</h2>
              <p className="text-xs text-muted-foreground">Colour is evidence, not universal commercial truth. Configure what a colour means for each WhatsApp account. Raw colour and inferred label stay separate.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="text-xs space-y-1"><span>Colour hint</span><Input value={ruleColor} onChange={(e) => setRuleColor(e.target.value)} /></label>
              <label className="text-xs space-y-1"><span>Seen state</span>
                <select className="h-10 w-full rounded-md border bg-background px-3" value={ruleSeen} onChange={(e) => setRuleSeen(e.target.value as any)}>
                  <option value="unseen">Unseen</option><option value="seen">Seen</option><option value="unknown">Unknown</option>
                </select>
              </label>
              <label className="text-xs space-y-1"><span>Message pattern</span><Input value={rulePattern} onChange={(e) => setRulePattern(e.target.value)} /></label>
              <label className="text-xs space-y-1"><span>Infer label</span><Input value={ruleLabel} onChange={(e) => setRuleLabel(e.target.value)} /></label>
            </div>
            <Button onClick={saveRule} className="gap-2"><Plus className="h-4 w-4" /> Save label rule</Button>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <Card className="p-8 text-center text-sm text-muted-foreground"><Eye className="h-5 w-5 mx-auto mb-2" />{text}</Card>;
}
