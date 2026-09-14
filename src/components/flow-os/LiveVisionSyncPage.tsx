import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Eye, FileImage, Loader2, RefreshCw, ShieldCheck, Sparkles, Upload } from "lucide-react";
import { toast } from "sonner";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { LeadSignalCard } from "./LeadSignalCard";
import { RevenueLeakagePanel } from "./RevenueLeakagePanel";
import { UnifiedCustomerWorkspace } from "./UnifiedCustomerWorkspace";
import { prepareScreenshot } from "@/lib/vision/image";
import {
  analyzeScreenshot,
  createScreenshotBatch,
  finalizeVisionBatch,
  loadVisionBatch,
  registerScreenshot,
} from "@/lib/vision/screenshots.functions";
import { resolveVisionObservation } from "@/lib/vision/resolve-observation.functions";
import { LeadStoryByPhone } from "@/components/lead-os/LeadStoryByPhone";
import type { ObservationRecord, ScreenshotRecord } from "@/lib/vision/types";
import {
  createLabelRule,
  getTruthRow,
  ingestManualBatch,
  listTruthRows,
  type ManualObservationInput,
  type TruthRow,
} from "@/lib/flow-os/service";

type FileState = {
  file: File;
  status: "queued" | "preparing" | "uploading" | "analyzing" | "extracted" | "reused" | "review" | "error";
  screenshotId?: string;
  rowCount?: number;
  confidence?: number;
  message?: string;
};

type BatchSummary = {
  detected: number;
  expected: number;
  inserted: number;
  silentDrops: number;
  unresolved: number;
  errors: number;
  complete: boolean;
};

const CHECKPOINTS = ["10:30 AM", "1:00 PM", "5:00 PM", "8:00 PM", "Other"];

function parseManualRows(raw: string): ManualObservationInput[] {
  return raw.split(/\n+/).map((line) => line.trim()).filter(Boolean).map((line) => {
    const [contactName = "", phone = "", lastMessage = "", seenRaw = "unknown", colorHint = "", handlerHint = ""] = line.split("|").map((x) => x.trim());
    const seenState = seenRaw.toLowerCase().includes("unseen") ? "unseen" : seenRaw.toLowerCase().includes("seen") ? "seen" : "unknown";
    return {
      contactName,
      phone,
      lastMessage,
      direction: seenState === "unseen" ? "incoming" : "unknown",
      seenState,
      unreadVisible: seenState === "unseen" || /unread/i.test(seenRaw),
      colorHint: colorHint || null,
      handlerHint: handlerHint || null,
      rawText: line,
    } satisfies ManualObservationInput;
  });
}

async function runWithConcurrency<T>(items: T[], limit: number, worker: (item: T, index: number) => Promise<void>) {
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, Math.max(1, items.length)) }, async () => {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      await worker(items[index], index);
    }
  });
  await Promise.all(runners);
}

function Stat({ label, value, danger, good }: { label: string; value: number | string; danger?: boolean; good?: boolean }) {
  return <div className={`rounded-xl border p-3 ${danger ? "border-red-500/50 bg-red-500/5" : good ? "border-emerald-500/40 bg-emerald-500/5" : "bg-card"}`}><div className="text-2xl font-bold tabular-nums">{value}</div><div className="text-[10px] uppercase tracking-wide text-muted-foreground mt-1">{label}</div></div>;
}

function statusBadge(status: FileState["status"]) {
  const danger = status === "error";
  const success = status === "extracted" || status === "reused";
  return <Badge variant={danger ? "destructive" : success ? "secondary" : "outline"} className="text-[9px] uppercase">{status}</Badge>;
}

export function LiveVisionSyncPage() {
  const [files, setFiles] = useState<FileState[]>([]);
  const [account, setAccount] = useState("Gharpayy WhatsApp");
  const [checkpoint, setCheckpoint] = useState("10:30 AM");
  const [expectedRows, setExpectedRows] = useState("");
  const [batchId, setBatchId] = useState<string | null>(null);
  const [screenshots, setScreenshots] = useState<ScreenshotRecord[]>([]);
  const [observations, setObservations] = useState<ObservationRecord[]>([]);
  const [storyRowId, setStoryRowId] = useState<string | null>(null);
  const [truth, setTruth] = useState<TruthRow[]>([]);
  const [summary, setSummary] = useState<BatchSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [reviewOnly, setReviewOnly] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Partial<ObservationRecord>>({});
  const [nonCustomerReasons, setNonCustomerReasons] = useState<Record<string, string>>({});
  const [manualRows, setManualRows] = useState("");
  const [manualBusy, setManualBusy] = useState(false);
  const [ruleColor, setRuleColor] = useState("green");
  const [ruleSeen, setRuleSeen] = useState<"seen" | "unseen" | "unknown">("unseen");
  const [rulePattern, setRulePattern] = useState("visit|coming|tour");
  const [ruleLabel, setRuleLabel] = useState("Tour-ready");
  const [selectedLead, setSelectedLead] = useState<TruthRow | null>(null);

  const expected = Number.parseInt(expectedRows || "0", 10) || 0;
  const refreshTruth = async () => setTruth(await listTruthRows());
  useEffect(() => { void refreshTruth(); }, []);

  const counters = useMemo(() => ({
    unique: truth.filter((r) => r.latest_observation_at).length,
    red: truth.filter((r) => r.sync_state === "RED").length,
    amber: truth.filter((r) => r.sync_state === "AMBER").length,
    green: truth.filter((r) => r.sync_state === "GREEN").length,
    grey: truth.filter((r) => r.sync_state === "GREY").length,
    unread: truth.filter((r) => r.unread_visible).length,
    unowned: truth.filter((r) => !r.current_owner && !r.reservation_operator).length,
  }), [truth]);

  const shownObservations = reviewOnly ? observations.filter((o) => o.reconciliation_state === "needs_review") : observations;
  const manualParsed = useMemo(() => parseManualRows(manualRows), [manualRows]);
  const screenshotNames = useMemo(() => new Map(screenshots.map((s) => [s.id, s.file_name || "Screenshot"])), [screenshots]);

  function replaceFile(index: number, patch: Partial<FileState>) {
    setFiles((current) => current.map((item, i) => i === index ? { ...item, ...patch } : item));
  }

  async function reloadBatch(id = batchId) {
    if (!id) return;
    const data = await loadVisionBatch({ data: { batchId: id } });
    setScreenshots(data.screenshots);
    setObservations(data.observations);
  }

  async function refinalize(id = batchId) {
    if (!id || expected <= 0) return null;
    const finalized = await finalizeVisionBatch({ data: { batchId: id, expectedOverride: expected } });
    setSummary(finalized);
    return finalized;
  }

  async function openLead(leadId: string) {
    const row = await getTruthRow(leadId);
    if (row) setSelectedLead(row);
  }

  async function analyzeSelected() {
    if (!files.length) { toast.error("Select WhatsApp screenshots first"); return; }
    if (expected <= 0) { toast.error("Enter an independent expected visible-row count before analysis"); return; }
    setBusy(true);
    setSummary(null);
    try {
      const created = await createScreenshotBatch({ data: { whatsappAccount: account || null, screenshotCount: files.length } });
      setBatchId(created.batchId);

      await runWithConcurrency(files, 3, async (entry, index) => {
        try {
          replaceFile(index, { status: "preparing", message: "Resizing + hashing" });
          const prepared = await prepareScreenshot(entry.file);
          replaceFile(index, { status: "uploading", message: `${prepared.width}×${prepared.height} · ${(prepared.bytes / 1024).toFixed(0)} KB` });
          const registered = await registerScreenshot({ data: { batchId: created.batchId, fileName: prepared.fileName, imageHash: prepared.hash, dataUrl: prepared.dataUrl, whatsappAccount: account || null } });
          replaceFile(index, { status: "analyzing", screenshotId: registered.screenshotId, message: registered.reused ? "Exact image found — reusing prior extraction" : "Lovable AI Vision reading every visible row" });
          const result = await analyzeScreenshot({ data: { screenshotId: registered.screenshotId } });
          if (!result.ok) { replaceFile(index, { status: "error", message: result.message }); return; }
          const needsReview = result.observations.some((row) => row.reconciliation_state === "needs_review");
          replaceFile(index, { status: result.reused ? "reused" : needsReview ? "review" : "extracted", rowCount: result.detectedRowCount, confidence: result.extractionConfidence, message: result.warnings[0] || `${result.insertedRowCount} rows inserted` });
        } catch (error: any) {
          replaceFile(index, { status: "error", message: error?.message || "Screenshot failed" });
        }
      });

      const finalized = await finalizeVisionBatch({ data: { batchId: created.batchId, expectedOverride: expected } });
      setSummary(finalized);
      await reloadBatch(created.batchId);
      await refreshTruth();
      if (finalized.complete) toast.success(`ZERO-MISS: ${finalized.inserted}/${finalized.expected} independently expected rows accounted`);
      else if (finalized.silentDrops > 0) toast.error(`${finalized.silentDrops} expected visible row(s) are missing — revenue leakage until resolved`);
      else toast.warning(`${finalized.unresolved} row(s) need identity review before the batch can close`);
    } catch (error: any) {
      toast.error(error?.message || "Could not analyze screenshot batch");
    } finally {
      setBusy(false);
    }
  }

  async function resolveObservation(row: ObservationRecord) {
    try {
      const updated = await resolveVisionObservation({ data: {
        observationId: row.id,
        contactName: editDraft.contact_name ?? row.contact_name,
        phoneRaw: editDraft.phone_raw ?? row.phone_raw,
        lastMessagePreview: editDraft.last_message_preview ?? row.last_message_preview,
        detectedLabel: editDraft.detected_label ?? row.detected_label,
        seenState: (editDraft.seen_state as "seen" | "unseen" | "unknown" | undefined) ?? (row.seen_state as any),
        colorHint: editDraft.color_hint ?? row.color_hint,
        handlerHint: editDraft.handler_hint ?? row.handler_hint,
        mode: "resolve",
        reason: editDraft.reconciliation_reason ?? null,
      } });
      setObservations((all) => all.map((o) => o.id === row.id ? updated : o));
      setEditingId(null);
      setEditDraft({});
      await refinalize();
      await refreshTruth();
      toast.success(updated.lead_id ? "Row resolved into one canonical CRM customer" : "Row updated");
    } catch (error: any) { toast.error(error?.message || "Could not resolve row"); }
  }

  async function markNonCustomer(row: ObservationRecord) {
    const reason = (nonCustomerReasons[row.id] || "").trim();
    if (reason.length < 3) { toast.error("Write a specific reason before marking a visible row non-customer"); return; }
    try {
      const updated = await resolveVisionObservation({ data: { observationId: row.id, mode: "non_customer", reason } });
      setObservations((all) => all.map((o) => o.id === row.id ? updated : o));
      await refinalize();
      toast.success("Visible row justified as non-customer");
    } catch (error: any) { toast.error(error?.message || "Could not mark non-customer"); }
  }

  async function processManualFallback() {
    if (!manualParsed.length) { toast.error("Paste at least one extracted row"); return; }
    if (expected <= 0) { toast.error("Independent expected-row count is still required"); return; }
    setManualBusy(true);
    try {
      const result = await ingestManualBatch({ whatsappAccount: account, screenshotNames: files.map((f) => f.file.name), visibleRowsExpected: expected, rows: manualParsed });
      toast.success(`Manual fallback accounted ${result.counts.resolved + result.counts.review + result.counts.nonCustomer}/${result.counts.visibleRows} expected rows`);
      await refreshTruth();
    } catch (error: any) { toast.error(error?.message || "Manual fallback failed"); }
    finally { setManualBusy(false); }
  }

  async function saveRule() {
    try {
      await createLabelRule({ whatsappAccount: account, colorHint: ruleColor || null, seenState: ruleSeen, textPattern: rulePattern || null, inferredLabel: ruleLabel, inferredPriority: ruleSeen === "unseen" ? "hot" : "active", inferredBucket: /visit|tour/i.test(rulePattern) ? "TOUR_READY" : "TODAY", rank: 10, isEnabled: true });
      toast.success("Colour / seen / message label rule saved");
    } catch (error: any) { toast.error(error?.message || "Could not save rule"); }
  }

  if (selectedLead) return <div className="space-y-3"><Button variant="outline" onClick={() => setSelectedLead(null)}>← Back to WhatsApp Truth Sync</Button><UnifiedCustomerWorkspace lead={selectedLead} onClose={() => setSelectedLead(null)} onChanged={async () => { await refreshTruth(); const row = await getTruthRow(selectedLead.lead_id); if (row) setSelectedLead(row); }} /></div>;

  return <div className="space-y-4">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <div className="flex items-center gap-2 flex-wrap"><h1 className="text-2xl font-bold tracking-tight">WhatsApp Truth Sync</h1><Badge className="gap-1"><Sparkles className="h-3 w-3" /> Lovable AI Vision</Badge><Badge variant="outline">Private screenshots</Badge><Badge variant="outline">3-day rolling truth</Badge></div>
        <p className="text-sm text-muted-foreground max-w-4xl mt-1">Re-upload the WhatsApp universe through the day. Screenshots are immutable observations; the CRM remains the operating truth. A visible row that is neither linked nor specifically justified is revenue leakage.</p>
      </div>
      <Button variant="outline" onClick={() => void refreshTruth()}><RefreshCw className="h-4 w-4 mr-2" />Refresh truth</Button>
    </div>

    <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-2"><Stat label="3-day customers" value={counters.unique} /><Stat label="Revenue leaks" value={counters.red} danger={counters.red > 0} /><Stat label="Sync required" value={counters.amber} danger={counters.amber > 0} /><Stat label="Synchronized" value={counters.green} good /><Stat label="Future / waiting" value={counters.grey} /><Stat label="Fresh unread" value={counters.unread} danger={counters.unread > 0} /><Stat label="Unowned" value={counters.unowned} danger={counters.unowned > 0} /></div>

    <Card className="p-4">
      <div className="grid gap-3 md:grid-cols-3 items-end">
        <label className="text-xs space-y-1"><span>WhatsApp account / source</span><Input value={account} onChange={(e) => setAccount(e.target.value)} /></label>
        <label className="text-xs space-y-1"><span>Daily checkpoint</span><select className="h-10 w-full rounded-md border bg-background px-3" value={checkpoint} onChange={(e) => setCheckpoint(e.target.value)}>{CHECKPOINTS.map((c) => <option key={c}>{c}</option>)}</select></label>
        <label className="text-xs space-y-1"><span>Independent expected visible rows *</span><Input type="number" min="1" max="10000" value={expectedRows} onChange={(e) => setExpectedRows(e.target.value)} placeholder="Example: 438" /></label>
      </div>
      <div className="mt-3 rounded-lg border bg-muted/20 p-3 text-xs text-muted-foreground"><b>Control equation:</b> Expected visible rows = all extracted observations. Review rows still count as observations but prevent closure. Missing observations are silent drops. Recommended checkpoints: 10:30 AM · 1 PM · 5 PM · 8 PM, always preserving the last 3 days of evidence.</div>
    </Card>

    <Tabs defaultValue="analyze" className="space-y-4">
      <TabsList className="h-auto flex-wrap"><TabsTrigger value="analyze">Analyze screenshots</TabsTrigger><TabsTrigger value="review">Review {observations.filter((o) => o.reconciliation_state === "needs_review").length ? `(${observations.filter((o) => o.reconciliation_state === "needs_review").length})` : ""}</TabsTrigger><TabsTrigger value="leakage">Revenue leakage</TabsTrigger><TabsTrigger value="truth">3-day truth</TabsTrigger><TabsTrigger value="rules">Colour rules</TabsTrigger></TabsList>

      <TabsContent value="analyze" className="space-y-4">
        <Card className="p-4 space-y-4">
          <div className="flex items-center justify-between gap-3"><div className="text-sm"><b>{checkpoint}</b> capture · {expected > 0 ? `${expected} rows independently expected` : "expected count missing"}</div><Badge variant="secondary" className="gap-2"><ShieldCheck className="h-4 w-4" /> Private bucket</Badge></div>
          <label className="rounded-xl border-2 border-dashed p-8 text-center block cursor-pointer hover:bg-muted/30 transition-colors"><Upload className="h-7 w-7 mx-auto mb-2 text-muted-foreground" /><div className="font-semibold">Select WhatsApp screenshots</div><div className="text-xs text-muted-foreground mt-1">20–30+ at once · JPEG/PNG/WebP · resized + SHA-256 dedupe · max 3 AI analyses concurrently</div><input type="file" accept="image/*" multiple className="hidden" onChange={(e) => setFiles(Array.from(e.target.files ?? []).map((file) => ({ file, status: "queued" })))} /></label>
          {files.length > 0 && <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-72 overflow-auto">{files.map((entry, index) => <div key={`${entry.file.name}-${index}`} className="rounded-lg border p-2 flex gap-2 items-start"><FileImage className="h-4 w-4 mt-0.5 text-muted-foreground" /><div className="min-w-0 flex-1"><div className="text-xs font-medium truncate">{entry.file.name}</div><div className="text-[10px] text-muted-foreground truncate">{entry.message || `${(entry.file.size / 1024).toFixed(0)} KB`}</div>{entry.rowCount !== undefined && <div className="text-[10px] mt-1">{entry.rowCount} rows · {entry.confidence ?? 0}% confidence</div>}</div>{["preparing","uploading","analyzing"].includes(entry.status) ? <Loader2 className="h-4 w-4 animate-spin" /> : statusBadge(entry.status)}</div>)}</div>}
          <Button size="lg" className="w-full gap-2" disabled={busy || !files.length || expected <= 0} onClick={() => void analyzeSelected()}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}{busy ? "Analyzing WhatsApp universe…" : `Analyze ${files.length || 0} screenshots against ${expected || "?"} expected rows`}</Button>

          {summary && <div className="space-y-2"><div className={`rounded-lg border p-3 text-sm flex flex-wrap items-center gap-2 ${summary.complete ? "border-emerald-500/40 bg-emerald-500/5" : "border-red-500/40 bg-red-500/5"}`}>{summary.complete ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <AlertTriangle className="h-4 w-4 text-red-600" />}<b>{summary.complete ? "ZERO-MISS COMPLETE" : "DO NOT CLOSE — REVENUE LEAKAGE / REVIEW"}</b><span className="text-muted-foreground">Expected {summary.expected} = observations {summary.inserted}; unresolved {summary.unresolved}; AI errors {summary.errors}; silent drops {summary.silentDrops}</span></div><div className="grid grid-cols-2 md:grid-cols-6 gap-2"><Stat label="AI detected" value={summary.detected} /><Stat label="Independent expected" value={summary.expected} /><Stat label="Observations" value={summary.inserted} /><Stat label="Needs review" value={summary.unresolved} danger={summary.unresolved > 0} /><Stat label="AI errors" value={summary.errors} danger={summary.errors > 0} /><Stat label="Silent drops" value={summary.silentDrops} danger={summary.silentDrops > 0} good={summary.silentDrops === 0} /></div></div>}

          <Accordion type="single" collapsible><AccordionItem value="manual"><AccordionTrigger>Manual fallback / paste extracted rows</AccordionTrigger><AccordionContent className="space-y-3"><p className="text-xs text-muted-foreground">Use only when Vision is unavailable or a screenshot is unreadable. Format: Name | Phone | Last message | seen/unseen | colour | handler.</p><Textarea className="min-h-40 font-mono text-xs" value={manualRows} onChange={(e) => setManualRows(e.target.value)} placeholder="Rahul | 9876543210 | Can I visit today at 6? | unseen | green | Aditi" /><Button variant="outline" disabled={manualBusy || !manualParsed.length || expected <= 0} onClick={() => void processManualFallback()}>{manualBusy ? "Reconciling…" : `Reconcile ${manualParsed.length} manual rows against ${expected || "?"} expected`}</Button></AccordionContent></AccordionItem></Accordion>
        </Card>
      </TabsContent>

      <TabsContent value="review" className="space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap"><div><h2 className="font-semibold">Zero-miss identity review</h2><p className="text-xs text-muted-foreground">Fix a phone → match/create exactly one canonical customer. Non-customer requires a written reason.</p></div><Button variant={reviewOnly ? "default" : "outline"} size="sm" onClick={() => setReviewOnly((v) => !v)}>{reviewOnly ? "Showing Needs Review" : "Showing All Rows"}</Button></div>
        {shownObservations.map((row) => {
          const editing = editingId === row.id;
          return <Card key={row.id} className={`p-3 ${row.reconciliation_state === "needs_review" ? "border-amber-500/45" : ""}`}>
            <div className="flex items-start justify-between gap-2 flex-wrap"><div className="flex gap-2 items-center flex-wrap"><Badge variant="outline">{screenshotNames.get(row.screenshot_id) || "Screenshot"} · row {row.row_index ?? "?"}</Badge><Badge variant={row.reconciliation_state === "needs_review" ? "destructive" : "secondary"}>{row.reconciliation_state.replaceAll("_", " ")}</Badge><Badge variant="outline">OCR {row.ocr_confidence ?? 0}%</Badge>{row.detected_label && <Badge>{row.detected_label}</Badge>}</div><Button variant="ghost" size="sm" onClick={() => { setEditingId(editing ? null : row.id); setEditDraft({}); }}>{editing ? "Cancel" : "Fix / Resolve"}</Button></div>
            {editing ? <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-3">
              <Input placeholder="Name" defaultValue={row.contact_name ?? ""} onChange={(e) => setEditDraft((d) => ({ ...d, contact_name: e.target.value || null }))} />
              <Input placeholder="Phone *" defaultValue={row.phone_raw ?? ""} onChange={(e) => setEditDraft((d) => ({ ...d, phone_raw: e.target.value || null }))} />
              <Input placeholder="Colour" defaultValue={row.color_hint ?? ""} onChange={(e) => setEditDraft((d) => ({ ...d, color_hint: e.target.value || null }))} />
              <Input placeholder="Label" defaultValue={row.detected_label ?? ""} onChange={(e) => setEditDraft((d) => ({ ...d, detected_label: e.target.value || null }))} />
              <Input placeholder="Handler hint" defaultValue={row.handler_hint ?? ""} onChange={(e) => setEditDraft((d) => ({ ...d, handler_hint: e.target.value || null }))} />
              <Input placeholder="Review note" defaultValue={row.reconciliation_reason ?? ""} onChange={(e) => setEditDraft((d) => ({ ...d, reconciliation_reason: e.target.value || null }))} />
              <Textarea className="md:col-span-2" placeholder="Last message" defaultValue={row.last_message_preview ?? ""} onChange={(e) => setEditDraft((d) => ({ ...d, last_message_preview: e.target.value || null }))} />
              <div className="md:col-span-2 flex flex-wrap gap-2"><Button onClick={() => void resolveObservation(row)}>Resolve into CRM</Button><Input className="min-w-72 flex-1" value={nonCustomerReasons[row.id] || ""} onChange={(e) => setNonCustomerReasons((all) => ({ ...all, [row.id]: e.target.value }))} placeholder="Required reason if this visible row is not a customer" /><Button variant="outline" onClick={() => void markNonCustomer(row)}>Mark non-customer</Button></div>
            </div> : <div className="grid grid-cols-1 md:grid-cols-[1fr_1.5fr_1fr] gap-3 mt-3 text-xs"><div><div className="text-muted-foreground text-[10px] uppercase">Identity</div><div className="font-semibold">{row.contact_name || "Name unreadable"}</div><div>{row.phone_raw || "No visible phone"}</div><div className="mt-1">{row.seen_state} · {row.color_hint || "no colour"}</div></div><div><div className="text-muted-foreground text-[10px] uppercase">Last message</div><div>{row.last_message_preview || "No preview readable"}</div><div className="mt-2 flex gap-1 flex-wrap"><Badge variant="outline">Hint: {row.stage_inference || "UNKNOWN"}</Badge><Badge variant="outline">{row.stage_confidence ?? 0}%</Badge><Badge variant="secondary">{row.work_bucket || "no bucket"}</Badge></div></div><div><div className="text-muted-foreground text-[10px] uppercase">CRM / handler</div><div>{row.lead_id ? `Linked: ${row.lead_id.slice(0, 8)}…` : "Not linked"}</div><div>{row.handler_hint ? `Visible handler: ${row.handler_hint}` : "No visible handler hint"}</div><div className="mt-1 text-muted-foreground">{row.reconciliation_reason}</div>{row.lead_id && <Button variant="outline" size="sm" className="mt-2 h-7" onClick={() => void openLead(row.lead_id!)}>Open customer</Button>}<Button variant="outline" size="sm" className="mt-2 ml-2 h-7" onClick={() => setStoryRowId(storyRowId === row.id ? null : row.id)}>{storyRowId === row.id ? "Hide story" : "Full story"}</Button></div></div>}
            {storyRowId === row.id && <div className="mt-3 space-y-2 rounded-lg border p-3"><h3 className="text-sm font-semibold">Full story — steps, last message, labels, next step, how to approach next</h3><LeadStoryByPhone phone={row.phone_normalized || row.phone_raw} fallbackName={row.contact_name} /></div>}
          </Card>;
        })}
        {!shownObservations.length && <Card className="p-8 text-center text-sm text-muted-foreground"><Eye className="h-5 w-5 mx-auto mb-2" />{observations.length ? "No rows currently need review." : "Analyze screenshots to populate review rows."}</Card>}
      </TabsContent>

      <TabsContent value="leakage"><RevenueLeakagePanel onOpenLead={openLead} /></TabsContent>
      <TabsContent value="truth" className="space-y-2">{truth.map((row) => <LeadSignalCard key={row.lead_id} lead={row} onPrimary={() => void openLead(row.lead_id)} primaryLabel="Open customer" />)}{!truth.length && <Card className="p-8 text-center text-sm text-muted-foreground">No CRM truth rows yet.</Card>}</TabsContent>
      <TabsContent value="rules"><Card className="p-4 space-y-4 max-w-3xl"><div><h2 className="font-semibold">Colour + seen/unseen + message rules</h2><p className="text-xs text-muted-foreground">Colour remains raw evidence. Account-specific rules can infer a working label/priority without changing commercial truth automatically.</p></div><div className="grid grid-cols-1 sm:grid-cols-2 gap-3"><label className="text-xs space-y-1"><span>Colour hint</span><Input value={ruleColor} onChange={(e) => setRuleColor(e.target.value)} /></label><label className="text-xs space-y-1"><span>Seen state</span><select className="h-10 w-full rounded-md border bg-background px-3" value={ruleSeen} onChange={(e) => setRuleSeen(e.target.value as any)}><option value="unseen">Unseen</option><option value="seen">Seen</option><option value="unknown">Unknown</option></select></label><label className="text-xs space-y-1"><span>Message regex</span><Input value={rulePattern} onChange={(e) => setRulePattern(e.target.value)} /></label><label className="text-xs space-y-1"><span>Infer label</span><Input value={ruleLabel} onChange={(e) => setRuleLabel(e.target.value)} /></label></div><Button onClick={() => void saveRule()}>Save rule</Button></Card></TabsContent>
    </Tabs>
  </div>;
}
