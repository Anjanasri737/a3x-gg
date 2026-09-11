import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarClock, ExternalLink, MessageSquare, Phone, RefreshCw, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { LeadSignalCard } from "./LeadSignalCard";
import { CompleteNextPanel } from "./CompleteNextPanel";
import { CanonicalBookingPanel, CanonicalCheckInPanel } from "./CanonicalCommercialPanel";
import { inferMessageIntelligence } from "@/lib/flow-os/message-intelligence";
import { confirmFlowStageHint, setFlowNextAction } from "@/lib/flow-os/customer-actions";
import { listLeadTimeline } from "@/lib/flow-os/commercial-api";
import { claimLead, touchClaim, type TruthRow } from "@/lib/flow-os/service";

const SAFE_HINT_STAGES = new Set([
  "NEW", "DOSSIER", "MATCHED", "TOUR_SCHEDULED", "TOUR_CONFIRMED",
  "TOUR_IN_PROGRESS", "POST_VISIT", "NEGOTIATION",
]);

export function UnifiedCustomerWorkspace({
  lead,
  item,
  onClose,
  onChanged,
}: {
  lead: TruthRow;
  item?: any;
  onClose: () => void;
  onChanged?: () => void | Promise<void>;
}) {
  const [claimId, setClaimId] = useState<string | null>(lead.claim_id ?? item?.work_claim_id ?? null);
  const [readOnlyReason, setReadOnlyReason] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [timeline, setTimeline] = useState<any[]>([]);
  const [dispositionOpen, setDispositionOpen] = useState(false);
  const [nextActionOpen, setNextActionOpen] = useState(false);
  const [nextAction, setNextAction] = useState(lead.next_action_kind || "Follow up customer");
  const [nextAt, setNextAt] = useState("");
  const [nextNotes, setNextNotes] = useState("");

  const intelligence = useMemo(() => inferMessageIntelligence({
    lastMessage: lead.last_message_preview,
    direction: lead.preview_direction as any,
    unreadVisible: lead.unread_visible,
    seenState: lead.seen_state as any,
    colorHint: lead.color_hint,
    detectedLabel: lead.detected_label,
    savedStage: lead.current_pipeline_stage,
  }), [lead]);

  const hintStage = (lead.stage_inference || intelligence.inferredPipelineHint || "").toUpperCase();
  const stageMismatch = Boolean(hintStage && lead.current_pipeline_stage && hintStage !== lead.current_pipeline_stage);
  const canConfirmHint = SAFE_HINT_STAGES.has(hintStage) && stageMismatch && !readOnlyReason;
  const waDigits = lead.phone?.replace(/\D/g, "") ?? "";

  const refreshTimeline = async () => {
    try { setTimeline(await listLeadTimeline(lead.lead_id, 100)); }
    catch { setTimeline([]); }
  };

  useEffect(() => {
    let cancelled = false;
    void claimLead(lead.lead_id, "NOW", item?.batch_id ?? lead.current_batch_id ?? null, "Open customer workspace", new Date().toISOString())
      .then((result: any) => {
        if (cancelled) return;
        const claim = Array.isArray(result) ? result[0] : result;
        if (claim?.id) setClaimId(claim.id);
        setReadOnlyReason(null);
      })
      .catch((error: any) => {
        if (cancelled) return;
        const text = String(error?.message || error || "Another operator is handling this customer");
        setReadOnlyReason(text.includes("OWNED_BY_OTHER") ? "This lead belongs to another owner. Reassign it explicitly in Control Tower before working it." : text.includes("ALREADY_CLAIMED") ? "Another operator already has the live/reserved claim." : text);
      });
    void refreshTimeline();
    return () => { cancelled = true; };
    // Claim only when switching customer/batch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead.lead_id, item?.batch_id]);

  async function heartbeat() {
    if (!claimId) return;
    try { await touchClaim(claimId); } catch { /* claim refresh is best-effort after the canonical action succeeds */ }
  }

  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    setMessage(null);
    try {
      await action();
      await heartbeat();
      await refreshTimeline();
      await onChanged?.();
      setMessage(success);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  const effectiveItem = item ? { ...item, work_claim_id: claimId || item.work_claim_id } : null;

  return <Card className="overflow-hidden border-primary/30 shadow-xl">
    <div className="border-b bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-bold">{lead.wa_name || "Unnamed customer"}</h2>
            <Badge variant="outline">{(lead.current_pipeline_stage || "DOSSIER").replaceAll("_", " ")}</Badge>
            {lead.sync_state === "RED" && <Badge variant="destructive">Revenue leak</Badge>}
            {lead.sync_state === "AMBER" && <Badge variant="outline" className="border-amber-500">Sync required</Badge>}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{lead.phone} · Owner {lead.current_owner_name || lead.current_owner || "unassigned"} · {lead.reservation_operator_name ? `Drafted by ${lead.reservation_operator_name}` : "not reserved"}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" asChild disabled={Boolean(readOnlyReason)}><a href={`tel:${lead.phone}`}><Phone className="mr-1.5 h-4 w-4" />Call</a></Button>
          <Button variant="outline" size="sm" asChild disabled={Boolean(readOnlyReason)}><a href={`https://wa.me/${waDigits}`} target="_blank" rel="noreferrer"><MessageSquare className="mr-1.5 h-4 w-4" />WhatsApp</a></Button>
          <Button variant="outline" size="sm" disabled={Boolean(readOnlyReason)} onClick={() => setNextActionOpen((v) => !v)}><CalendarClock className="mr-1.5 h-4 w-4" />Next action</Button>
          {effectiveItem && <Button size="sm" disabled={Boolean(readOnlyReason)} onClick={() => setDispositionOpen((v) => !v)}>Complete & Next</Button>}
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close customer workspace"><X className="h-4 w-4" /></Button>
        </div>
      </div>

      {readOnlyReason && <div className="mt-3 rounded-lg border border-amber-400 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:bg-amber-950/30 dark:text-amber-100"><b>Read only.</b> {readOnlyReason}</div>}
      {message && <div className={`mt-3 rounded-lg border px-3 py-2 text-sm ${/fail|error|required|blocked|another/i.test(message) ? "border-red-300 bg-red-50 text-red-900" : "border-emerald-300 bg-emerald-50 text-emerald-900"}`}>{message}</div>}
    </div>

    {nextActionOpen && <div className="border-b bg-muted/20 p-4">
      <div className="grid gap-3 md:grid-cols-[1fr_260px_1fr_auto] items-end">
        <label className="text-xs space-y-1"><span>Next action *</span><Input value={nextAction} onChange={(e) => setNextAction(e.target.value)} /></label>
        <label className="text-xs space-y-1"><span>Due date & time *</span><Input type="datetime-local" value={nextAt} onChange={(e) => setNextAt(e.target.value)} /></label>
        <label className="text-xs space-y-1"><span>Context</span><Input value={nextNotes} onChange={(e) => setNextNotes(e.target.value)} placeholder="What must happen next?" /></label>
        <Button disabled={busy || Boolean(readOnlyReason) || !nextAction.trim() || !nextAt} onClick={() => void run(async () => {
          await setFlowNextAction({ leadId: lead.lead_id, kind: nextAction.trim(), dueAt: new Date(nextAt).toISOString(), notes: nextNotes.trim() || null });
          setNextActionOpen(false);
        }, "Dated next action saved")}>Save</Button>
      </div>
    </div>}

    {dispositionOpen && effectiveItem && <div className="border-b p-4"><CompleteNextPanel item={effectiveItem} onClose={() => setDispositionOpen(false)} onDone={async () => { setDispositionOpen(false); await onChanged?.(); onClose(); }} /></div>}

    <div className="p-4"><LeadSignalCard lead={lead} /></div>

    <Tabs defaultValue="whatsapp" className="border-t">
      <TabsList className="h-auto w-full justify-start rounded-none border-b bg-muted/20 px-4 py-2 flex-wrap">
        <TabsTrigger value="profile">Profile</TabsTrigger>
        <TabsTrigger value="whatsapp">WhatsApp Intelligence</TabsTrigger>
        <TabsTrigger value="properties">Properties</TabsTrigger>
        <TabsTrigger value="tour">Tour</TabsTrigger>
        <TabsTrigger value="booking">Booking</TabsTrigger>
        <TabsTrigger value="checkin">Check-in</TabsTrigger>
        <TabsTrigger value="timeline">Timeline</TabsTrigger>
      </TabsList>

      <div className="p-5">
        <TabsContent value="profile" className="mt-0 grid gap-3 md:grid-cols-2">
          <Info label="Customer" value={lead.wa_name || "Not captured"} />
          <Info label="Phone" value={lead.phone} />
          <Info label="Location" value={lead.location_text || "Not confirmed"} />
          <Info label="Move-in" value={lead.movein_date || "Not confirmed"} />
          <Info label="Current mission" value={lead.current_mission || intelligence.primaryMission} wide />
          <Info label="Primary blocker" value={lead.primary_blocker || intelligence.blockerHint || "Not identified"} wide />
        </TabsContent>

        <TabsContent value="whatsapp" className="mt-0 space-y-4">
          <Card className="p-4">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Latest visible WhatsApp message</div>
            <div className="mt-1 text-base font-medium">{lead.last_message_preview || "No message preview captured"}</div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge variant="outline">Seen: {lead.seen_state || "unknown"}</Badge>
              <Badge variant="outline">Colour: {lead.color_hint || "not detected"}</Badge>
              <Badge variant="outline">Label: {lead.detected_label || "not detected"}</Badge>
              <Badge variant="outline">Visible handler: {lead.handler_hint || "not detected"}</Badge>
            </div>
          </Card>

          <Card className={`p-4 ${stageMismatch ? "border-amber-400" : ""}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Message-derived stage hint — advisory until confirmed</div>
                <div className="mt-1 text-lg font-semibold">Hint: {hintStage || "UNKNOWN"}</div>
                <div className="text-sm">Saved CRM: {lead.current_pipeline_stage || "DOSSIER"}</div>
                <div className="mt-2 text-xs text-muted-foreground">Confidence {lead.stage_confidence ?? intelligence.confidence}% · {intelligence.reasons.slice(0, 3).join(" · ")}</div>
              </div>
              {stageMismatch && <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <Button disabled={!canConfirmHint || busy} onClick={() => void run(() => confirmFlowStageHint({ leadId: lead.lead_id, stage: hintStage, mission: intelligence.primaryMission, observationId: lead.observation_id }), `CRM stage confirmed as ${hintStage.replaceAll("_", " ")}`)}>{SAFE_HINT_STAGES.has(hintStage) ? "Confirm stage from evidence" : "Use canonical commercial action"}</Button>
              </div>}
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="properties" className="mt-0"><Capability title="Property Match" description="Use the existing verified supply/matching engine. It must return to this same canonical lead; no new customer record is created." href="/supply-hub/match" action="Open Lead Matcher" /></TabsContent>
        <TabsContent value="tour" className="mt-0"><Capability title="Tour Execution" description="Schedule/confirm/run the tour using the existing Gharpayy tour capability. WhatsApp evidence can suggest a tour stage, but tour execution remains a real operational action." href="/myt/schedule" action="Open Tour Scheduler" /></TabsContent>
        <TabsContent value="booking" className="mt-0"><CanonicalBookingPanel leadId={lead.lead_id} canAct={!readOnlyReason} onMeaningfulAction={heartbeat} onChanged={onChanged} /></TabsContent>
        <TabsContent value="checkin" className="mt-0"><CanonicalCheckInPanel leadId={lead.lead_id} canAct={!readOnlyReason} onMeaningfulAction={heartbeat} onChanged={onChanged} /></TabsContent>
        <TabsContent value="timeline" className="mt-0 space-y-3">
          <div className="flex justify-between"><div><h3 className="font-semibold">One customer timeline</h3><p className="text-xs text-muted-foreground">Human actions and commercial state changes for this canonical lead.</p></div><Button variant="outline" size="sm" onClick={() => void refreshTimeline()}><RefreshCw className="mr-1.5 h-3.5 w-3.5" />Refresh</Button></div>
          {timeline.map((event) => <Card key={event.id} className="p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2"><div className="font-semibold">{String(event.activity || "activity").replaceAll("_", " ")}</div><div className="text-xs text-muted-foreground">{event.at ? new Date(event.at).toLocaleString() : ""}</div></div>
            {event.detail && <div className="mt-1 text-xs text-muted-foreground">{event.detail}</div>}
            {(event.prev_stage || event.new_stage) && <div className="mt-2 flex gap-1"><Badge variant="outline">{event.prev_stage || "—"}</Badge><span>→</span><Badge>{event.new_stage || "—"}</Badge></div>}
          </Card>)}
          {!timeline.length && <Card className="p-6 text-center text-sm text-muted-foreground">No timeline events yet.</Card>}
        </TabsContent>
      </div>
    </Tabs>
  </Card>;
}

function Info({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return <div className={`rounded-lg border p-3 ${wide ? "md:col-span-2" : ""}`}><div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div><div className="mt-1 text-sm font-medium">{value}</div></div>;
}

function Capability({ title, description, href, action }: { title: string; description: string; href: string; action: string }) {
  return <Card className="p-5"><div className="flex flex-wrap items-start justify-between gap-4"><div><h3 className="font-semibold">{title}</h3><p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p></div><Button asChild><a href={href}>{action}<ExternalLink className="ml-1.5 h-4 w-4" /></a></Button></div></Card>;
}
