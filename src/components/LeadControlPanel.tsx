import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useApp, getProperty, getTcm } from "@/lib/store";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ConfidenceBar, IntentChip, StageBadge } from "./atoms";
import { HandoffThread } from "./HandoffThread";
import { SequenceChip } from "./SequenceChip";
import { SupplyMatchPanel } from "./leads/SupplyMatchPanel";
import { PostVisitGate } from "./crm10x/PostVisitGate";
import { CommitmentBanner } from "./crm10x/CommitmentBanner";
import { ObjectionTag } from "./crm10x/ObjectionLogger";
import { LeadDossierPanel } from "./crm10x/LeadDossierPanel";
import { LeadLiveStrip } from "./live/LeadLiveStrip";
import { LeadAdminStrip } from "./admin/LeadAdminStrip";
import { useLifecycle } from "@/lib/pipeline/lifecycle";
import { useLiveActivity } from "@/lib/live-activity";
import { History, Users as UsersIcon } from "lucide-react";
import {
  Phone, MessageSquare, Calendar as CalendarIcon, Tag, ClipboardCheck,
  AlertTriangle, CheckCircle2, X, Activity as ActivityIcon, MapPin,
  Wallet, Send, Zap, IndianRupee, BellRing, ExternalLink,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import type { LeadStage, FollowUpPriority, SequenceKind } from "@/lib/types";
import { toast } from "sonner";
import { useMountedNow } from "@/hooks/use-now";
import { sendTourMessage as sendOwnerTourMessage } from "@/owner/messaging";
import { useSessionTimer } from "@/lib/productivity/use-session-timer";
import { SessionTimerBadge } from "@/components/productivity/SessionTimerBadge";
import { useIdentityStore } from "@/lib/lead-identity/store";
import { useSettings } from "@/myt/lib/settings-context";
import { LeadCallLadder } from "./leads/LeadCallLadder";
import { LeadTalkTrack } from "./leads/LeadTalkTrack";
import { LeadCapturedStrip } from "./leads/LeadCapturedStrip";
import { LogActivityDialog } from "./leads/LogActivityDialog";
import { LeadFollowUpsPanel } from "./leads/LeadFollowUpsPanel";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { CallEngine } from "@/callengine/CallEngine";
import { useMovement } from "@/movement/store";
import { canonicalCustomerId } from "@/lib/canonical/customer-id";

const TAG_OPTIONS = ["price-issue", "location-mismatch", "parents-involved", "urgent", "budget-low"];
const OBJECTIONS = ["Budget", "Location", "Amenities", "Timing", "Parents", "Comparing options", "Other"];
const TEMPLATES = [
  { id: "tour-confirm", label: "Tour confirmation", body: "Hi! Confirming your tour today. Looking forward to meeting you." },
  { id: "post-tour", label: "Post-tour check-in", body: "Hi! How did you find the property? Happy to answer any questions." },
  { id: "scarcity", label: "Scarcity", body: "Just a heads-up — only a couple of beds left at this price." },
];

const DRAWER_CALLS = ["Basics", "Schedule", "Tour", "Close", "Recall"] as const;

function callNumberForStage(stage: LeadStage) {
  if (stage === "new" || stage === "contacted") return 1;
  if (stage === "tour-scheduled") return 2;
  if (stage === "tour-done") return 3;
  if (stage === "negotiation") return 4;
  return 5;
}

export function LeadControlPanel() {
  const {
    selectedLeadId, selectLead, leads, properties, tours, activities, tcms, followUps,
    setLeadStage, setLeadIntent, setLeadFollowUp, addLeadTag, removeLeadTag,
    scheduleTour, cancelTour, rescheduleTour, completeTour, setDecision, updatePostTour,
    addNote, patchLead, logCall, sendMessage, autoAssignLead, startSequence, closeDeal,
    markHandoffsRead,
  } = useApp();
  const { settings } = useSettings();

  const lead = useMemo(() => leads.find((l) => l.id === selectedLeadId) ?? null, [leads, selectedLeadId]);

  // Mark handoffs read when this lead opens
  useEffect(() => {
    if (selectedLeadId) markHandoffsRead(selectedLeadId);
  }, [selectedLeadId, markHandoffsRead]);

  const leadTours = useMemo(
    () => (lead ? tours.filter((t) => t.leadId === lead.id).sort((a, b) => +new Date(b.scheduledAt) - +new Date(a.scheduledAt)) : []),
    [tours, lead],
  );
  const leadActivities = useMemo(
    () => (lead ? activities.filter((a) => a.leadId === lead.id).slice(0, 30) : []),
    [activities, lead],
  );
  const openFollowUps = useMemo(
    () => (lead ? followUps.filter((f) => f.leadId === lead.id && !f.done) : []),
    [followUps, lead],
  );
  const overdueFollowUps = useMemo(
    () => openFollowUps.filter((f) => +new Date(f.dueAt) < Date.now()),
    [openFollowUps],
  );

  // Tour scheduling form state
  const [propertyId, setPropertyId] = useState("");
  const [tcmId, setTcmId] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [tab, setTab] = useState("control");
  const [, mounted] = useMountedNow();

  // Note state
  const [note, setNote] = useState("");
  const [customMsg, setCustomMsg] = useState("");
  const [selectedCall, setSelectedCall] = useState(1);
  const [logOpen, setLogOpen] = useState(false);
  const [logCallNo, setLogCallNo] = useState<number | undefined>(undefined);
  const [callEngineOpen, setCallEngineOpen] = useState(false);
  const drawerScrollRef = useRef<HTMLDivElement>(null);

  // The Call Conversation Engine runs on the Movement lead — match by canonical customer ID.
  const mvStates = useMovement((s) => s.states);
  const movementLead = useMemo(() => {
    if (!lead) return null;
    const cid = canonicalCustomerId({ phone: lead.phone, name: lead.name });
    return Object.values(mvStates).find((s) => s.canonicalId === cid || s.canonicalId === lead.id) ?? null;
  }, [mvStates, lead]);
  const actionEngineRef = useRef<HTMLDivElement>(null);

  // Log call never blocks: if the customer isn't in Movement yet, link them on the spot.
  const openCallEngine = () => {
    if (!lead) return;
    const cid = canonicalCustomerId({ phone: lead.phone, name: lead.name });
    const mv = useMovement.getState();
    const existing = Object.values(mv.states).find((s) => s.canonicalId === cid || s.canonicalId === lead.id);
    if (!existing) {
      mv.ensureShadow({
        ulid: lead.id,
        name: lead.name,
        phone: lead.phone,
        zone: lead.preferredArea,
        ownerName: tcm?.name,
        budget: lead.budget,
        location: lead.preferredArea,
        checkInDate: lead.moveInDate,
      });
      toast.success("Linked to Movement", { description: `${lead.name} is now tracked in Movement OS.` });
    }
    setCallEngineOpen(true);
  };

  const pendingPostTour = leadTours.find(
    (t) => t.status === "completed" && !t.postTour.filledAt,
  );
  const upcomingTour = leadTours.find((t) => t.status === "scheduled");

  useEffect(() => {
    if (!lead) return;
    setPropertyId(upcomingTour?.propertyId ?? "");
    setTcmId(upcomingTour?.tcmId ?? lead.assignedTcmId ?? "");
    setScheduledAt(upcomingTour ? toLocal(upcomingTour.scheduledAt) : "");
    setSelectedCall(callNumberForStage(lead.stage));
    setTab(pendingPostTour ? "post" : upcomingTour ? "tour" : settings.matching.drawerDefaultTab);
  }, [lead, pendingPostTour, upcomingTour, settings.matching.drawerDefaultTab]);

  // 120s target timer — every second in this drawer is logged to Productivity.
  const me = useIdentityStore((s) => s.currentUser);
  const timer = useSessionTimer({
    active: Boolean(selectedLeadId && lead),
    kind: "drawer",
    leadId: lead?.id ?? "",
    leadName: lead?.name ?? "",
    actorId: me?.id ?? "me",
    actorName: me?.name ?? "You",
    outcome: lead ? `Stage ${lead.stage}` : undefined,
  });

  const continueCall = (call: number) => {
    setSelectedCall(call);
    setTab("control");
    window.setTimeout(() => {
      actionEngineRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
  };

  if (!lead) {
    if (!selectedLeadId) return null;
    return (
      <Sheet open onOpenChange={(open) => !open && selectLead(null)}>
        <SheetContent side="right" className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Lead unavailable</SheetTitle>
            <SheetDescription>
              This lead is no longer in the active lead list. Refresh the source view and try again.
            </SheetDescription>
          </SheetHeader>
          <Button className="mt-4" onClick={() => selectLead(null)}>Close</Button>
        </SheetContent>
      </Sheet>
    );
  }

  const tcm = getTcm(lead.assignedTcmId);

  const handleSchedule = () => {
    if (!propertyId || !tcmId || !scheduledAt) {
      toast.error("Property, TCM and time are required");
      return;
    }
    scheduleTour({ leadId: lead.id, propertyId, tcmId, scheduledAt: new Date(scheduledAt).toISOString() });
    setPropertyId(""); setTcmId(""); setScheduledAt("");
    toast.success("Tour scheduled");
  };

  return (
    <Sheet open={!!selectedLeadId} onOpenChange={(o) => !o && selectLead(null)}>
      <SheetContent side="right" className="h-dvh max-h-dvh w-full gap-0 overflow-hidden p-0 sm:max-w-[640px] flex flex-col">
        {/* Top half: identity + call ladder. The lower half owns all scrolling. */}
        <div className="h-1/2 min-h-0 shrink-0 overflow-y-auto border-b border-border bg-background">
        <SheetHeader className="px-5 py-3 border-b border-border space-y-2">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
            <div className="min-w-0">
              <SheetTitle className="font-display text-lg leading-tight truncate">{lead.name}</SheetTitle>
              <SheetDescription className="text-xs truncate">
                {lead.phone} · via {lead.source} · assigned {tcm?.name ?? "—"} ({tcm?.zone ?? "—"})
              </SheetDescription>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
            <SessionTimerBadge elapsed={timer.elapsed} />
            <button
              onClick={() => selectLead(null)}
              className="h-7 w-7 shrink-0 rounded-md hover:bg-muted flex items-center justify-center"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
            </div>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <StageBadge stage={lead.stage} />
            <IntentChip intent={lead.intent} />
            <ObjectionTag leadId={lead.id} />
            <LeadHistoryChips leadId={lead.id} onOpenHistory={() => setTab("dossier")} />
          </div>
          <div className="flex items-center gap-2">
            <ConfidenceBar value={lead.confidence} />
            <span className="text-[10px] text-muted-foreground shrink-0">confidence</span>
          </div>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <Meta icon={CalendarIcon} label="Move-in" value={format(new Date(lead.moveInDate), "MMM d")} />
            <Meta icon={Wallet} label="Budget" value={`₹${(lead.budget / 1000).toFixed(0)}k`} />
            <Meta icon={MapPin} label="Area" value={lead.preferredArea} />
          </div>
          <LeadCapturedStrip lead={lead} />

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button size="sm" className="h-8 flex-1 min-w-[140px]" onClick={() => setCallEngineOpen(true)}>
              <Phone className="mr-1.5 h-3.5 w-3.5" /> Log call
            </Button>
            <Button size="sm" variant="secondary" className="h-8 flex-1 min-w-[140px]" onClick={() => setLogOpen(true)}>
              <ActivityIcon className="mr-1.5 h-3.5 w-3.5" /> + Log activity
            </Button>
            <Button size="sm" variant="outline" className="h-8" asChild>
              <a href={`tel:${lead.phone}`}><Phone className="mr-1.5 h-3.5 w-3.5" /> Call</a>
            </Button>
            <Button size="sm" variant="outline" className="h-8" asChild>
              <a href={`https://wa.me/${lead.phone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer">
                <MessageSquare className="mr-1.5 h-3.5 w-3.5" /> WhatsApp
              </a>
            </Button>
            <Button size="sm" variant="ghost" className="h-8" onClick={() => setTab("followups")}>
              <BellRing className="mr-1.5 h-3.5 w-3.5" />
              {openFollowUps.length ? `${openFollowUps.length} follow-up${openFollowUps.length === 1 ? "" : "s"}` : "No follow-up"}
            </Button>
          </div>
        </SheetHeader>
        <LeadCallLadder
          lead={lead}
          activities={leadActivities}
          tours={leadTours}
          selectedCall={selectedCall}
          onSelectCall={setSelectedCall}
          onContinue={continueCall}
        />
        <LeadTalkTrack
          lead={lead}
          call={selectedCall as 1 | 2 | 3 | 4 | 5}
          me={me?.name ?? "Gharpayy"}
          onSaveCore={(field, value) => {
            if (!value) return;
            if (field === "budget") patchLead(lead.id, { budget: Number(value) || 0 });
            else if (field === "moveInDate") patchLead(lead.id, { moveInDate: new Date(value).toISOString() });
            else patchLead(lead.id, { preferredArea: value });
            toast.success("Captured");
          }}
          onSaveNote={(text) => {
            addNote(lead.id, text);
            toast.success("Note added");
          }}
          onCapture={(label, value, call) => {
            addNote(lead.id, `[C${call}] ${label}: ${value}`);
          }}
          onLogActivity={(call) => {
            logCall(lead.id);
            setLogCallNo(call);
            setLogOpen(true);
            toast.success(`C${call} call attempt logged — pick the outcome`);
          }}

        />
        </div>

        {/* Lower half: every operational action scrolls independently. */}
        <div ref={drawerScrollRef} data-testid="lead-drawer-scroll" className="lead-drawer-scroll flex-1 min-h-0 overflow-y-auto overscroll-contain scrollbar-thin pb-8">
          <div className="pt-3">
            <LeadLiveStrip lead={lead} />
            <LeadAdminStrip lead={lead} />
            <CommitmentBanner lead={lead} />
            <PostVisitGate lead={lead} />
            {pendingPostTour && (
              <div className="mx-5 mt-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                <div className="text-xs">
                  <div className="font-semibold text-destructive">Post-tour update missing</div>
                  <div className="text-muted-foreground">
                    Tour completed {mounted ? formatDistanceToNow(new Date(pendingPostTour.scheduledAt), { addSuffix: true }) : "recently"}.
                    TCM must fill the form below.
                  </div>
                </div>
              </div>
            )}
          </div>
          <Tabs value={tab} onValueChange={setTab} className="px-5 py-4">
            <TabsList className="grid h-auto w-full grid-cols-4 gap-1 sm:grid-cols-8">
              <TabsTrigger value="best-fit" className="text-xs">Best Fit</TabsTrigger>
              <TabsTrigger value="dossier" className="text-xs">Dossier</TabsTrigger>
              <TabsTrigger value="control" className="text-xs">Control</TabsTrigger>
              <TabsTrigger value="followups" className="text-xs">
                Follow-ups {overdueFollowUps.length > 0 && <span className="ml-1 h-1.5 w-1.5 rounded-full bg-destructive" />}
              </TabsTrigger>
              <TabsTrigger value="tour" className="text-xs">Tour</TabsTrigger>
              <TabsTrigger value="post" className="text-xs">
                Post {pendingPostTour && <span className="ml-1 h-1.5 w-1.5 rounded-full bg-destructive" />}
              </TabsTrigger>
              <TabsTrigger value="handoff" className="text-xs">Handoff</TabsTrigger>
              <TabsTrigger value="log" className="text-xs">Log</TabsTrigger>
            </TabsList>

            <TabsContent value="followups" className="space-y-4 pt-4">
              <Section title="Follow-up engine">
                <LeadFollowUpsPanel lead={lead} onLogActivity={() => setLogOpen(true)} />
              </Section>
            </TabsContent>


            <TabsContent value="dossier" className="space-y-4 pt-4">
              <LeadDossierPanel lead={lead} />
            </TabsContent>

            <TabsContent value="best-fit" className="space-y-4 pt-4">
              <Section title="Best property matches">
                <SupplyMatchPanel lead={lead} onNavigateAway={() => selectLead(null)} />
              </Section>
            </TabsContent>

            {/* CONTROL — status, intent, follow-up, action engine, notes, tags */}
            <TabsContent value="control" className="space-y-4 pt-4">
              <SequenceChip leadId={lead.id} />

              <Section title="Routing">
                <div className="flex gap-2">
                  <Button
                    variant="outline" size="sm" className="flex-1"
                    onClick={() => {
                      const r = autoAssignLead(lead.id);
                      const tcm = tcms.find((t) => t.id === r.tcmId);
                      toast.success(`Auto-routed to ${tcm?.name ?? "TCM"}`, { description: r.reasons.join(" · ") });
                    }}
                  >
                    <Zap className="h-3.5 w-3.5 mr-1.5" /> Auto-route to best TCM
                  </Button>
                </div>
                <div className="text-[11px] text-muted-foreground">
                  Currently with <span className="text-foreground font-medium">{tcm?.name ?? "—"}</span> · {tcm?.zone ?? "—"} · {Math.round((tcm?.conversionRate ?? 0) * 100)}% conv
                </div>
              </Section>

              <Section title="Status engine">
                <Select value={lead.stage} onValueChange={(v) => {
                  const prev = lead.stage;
                  setLeadStage(lead.id, v as LeadStage);
                  if (v === "dropped") {
                    toast("Marked dropped", {
                      description: `${lead.name} → dropped`,
                      action: {
                        label: "Undo",
                        onClick: () => { setLeadStage(lead.id, prev); toast.success("Restored"); },
                      },
                      duration: 5000,
                    });
                  }
                }}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(["new","contacted","tour-scheduled","tour-done","negotiation","booked","dropped"] as LeadStage[]).map((s) => (
                      <SelectItem key={s} value={s} className="text-sm capitalize">{s.replace("-", " ")}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="grid grid-cols-2 gap-2 pt-1">
                  {(["first-contact","post-tour","pre-decision","cold-revival"] as SequenceKind[]).map((k) => (
                    <Button
                      key={k} size="sm" variant="outline" className="h-7 text-[11px]"
                      onClick={() => { startSequence(lead.id, k); toast.success(`Started ${k} sequence`); }}
                    >
                      Start {k}
                    </Button>
                  ))}
                </div>
              </Section>

              <div ref={actionEngineRef}>
              <Section title={`Call ${selectedCall} · ${DRAWER_CALLS[selectedCall - 1]} actions`}>
                <div className="rounded-md border border-primary/25 bg-primary/5 px-3 py-2 text-[11px] text-muted-foreground">
                  Working on <span className="font-semibold text-foreground">C{selectedCall} · {DRAWER_CALLS[selectedCall - 1]}</span>. Logging either action updates the ladder immediately.
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="outline" size="sm" onClick={() => { logCall(lead.id); toast.success(`C${selectedCall} call attempt logged`); }}>
                    <Phone className="h-3.5 w-3.5 mr-1.5" /> Log C{selectedCall} call
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => { sendMessage(lead.id, "WhatsApp template sent"); toast.success("Message sent"); }}>
                    <MessageSquare className="h-3.5 w-3.5 mr-1.5" /> Log WhatsApp
                  </Button>
                </div>
                <div className="space-y-2">
                  <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Templates</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {TEMPLATES.map((t) => (
                      <Button
                        key={t.id} variant="secondary" size="sm" className="h-7 text-[11px]"
                        onClick={() => { sendMessage(lead.id, t.body); toast.success(`Sent: ${t.label}`); }}
                      >
                        {t.label}
                      </Button>
                    ))}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Input
                    value={customMsg} onChange={(e) => setCustomMsg(e.target.value)}
                    placeholder="Custom message…" className="h-9 text-sm"
                  />
                  <Button
                    size="sm" disabled={!customMsg.trim()}
                    onClick={() => { sendMessage(lead.id, customMsg); setCustomMsg(""); toast.success("Sent"); }}
                  >
                    <Send className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </Section>
              </div>

              <Section title="Follow-up engine">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Next follow-up</Label>
                    <Input
                      type="datetime-local"
                      defaultValue={lead.nextFollowUpAt ? toLocal(lead.nextFollowUpAt) : ""}
                      onChange={(e) => {
                        if (!e.target.value) return;
                        setLeadFollowUp(lead.id, new Date(e.target.value).toISOString(), priorityFor(lead.confidence));
                      }}
                      className="h-9 text-sm"
                    />
                  </div>
                  <div>
                    <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Priority</Label>
                    <Select
                      value={lead.intent === "hot" ? "high" : lead.intent === "warm" ? "medium" : "low"}
                      onValueChange={(v) => setLeadIntent(lead.id, v === "high" ? "hot" : v === "medium" ? "warm" : "cold")}
                    >
                      <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="high">Hot</SelectItem>
                        <SelectItem value="medium">Warm</SelectItem>
                        <SelectItem value="low">Cold</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {lead.nextFollowUpAt && (
                  <div className="text-[11px] text-muted-foreground">
                    Due {mounted ? formatDistanceToNow(new Date(lead.nextFollowUpAt), { addSuffix: true }) : "soon"}
                  </div>
                )}
              </Section>

              <Section title="Notes & signals">
                <div className="flex flex-wrap gap-1.5">
                  {lead.tags.map((t) => (
                    <Badge key={t} variant="secondary" className="text-[10px] gap-1">
                      <Tag className="h-2.5 w-2.5" />
                      {t}
                      <button onClick={() => removeLeadTag(lead.id, t)} className="hover:text-destructive">
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </Badge>
                  ))}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {TAG_OPTIONS.filter((t) => !lead.tags.includes(t)).map((t) => (
                    <button
                      key={t} onClick={() => addLeadTag(lead.id, t)}
                      className="text-[10px] px-2 py-0.5 rounded-md border border-dashed border-border text-muted-foreground hover:border-accent hover:text-accent transition-colors"
                    >
                      + {t}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Textarea
                    value={note} onChange={(e) => setNote(e.target.value)}
                    placeholder="Add a note…" rows={2} className="text-sm resize-none"
                  />
                  <Button
                    size="sm" disabled={!note.trim()}
                    onClick={() => { addNote(lead.id, note); setNote(""); toast.success("Note added"); }}
                  >
                    Add
                  </Button>
                </div>
              </Section>
            </TabsContent>

            {/* TOUR */}
            <TabsContent value="tour" className="space-y-4 pt-4">
              {upcomingTour ? (
                <Section title="Upcoming tour">
                  <UpcomingTourCard
                    tour={upcomingTour}
                    scheduledAt={scheduledAt}
                    onScheduledAtChange={setScheduledAt}
                    onReschedule={() => {
                      if (!scheduledAt) {
                        toast.error("Choose a date and time to reschedule");
                        return;
                      }
                      rescheduleTour(upcomingTour.id, new Date(scheduledAt).toISOString());
                      toast.success("Tour rescheduled");
                    }}
                    onCancel={() => {
                      const prevAt = upcomingTour.scheduledAt;
                      const tourId = upcomingTour.id;
                      cancelTour(tourId);
                      toast("Tour cancelled", {
                        description: `${lead.name} · ${format(new Date(prevAt), "MMM d, p")}`,
                        action: {
                          label: "Undo",
                          onClick: () => {
                            // restore by rescheduling — store doesn't track 'cancelled' undo cleanly
                            useApp.getState().rescheduleTour(tourId, prevAt);
                            useApp.setState((s) => ({
                              tours: s.tours.map((x) => x.id === tourId ? { ...x, status: "scheduled" } : x),
                            }));
                            toast.success("Tour restored");
                          },
                        },
                        duration: 5000,
                      });
                    }}
                     onComplete={() => {
                       completeTour(upcomingTour.id);
                       setTab("post");
                       toast.success("Tour completed — fill the post-tour form");
                     }}
                  />
                </Section>
              ) : (
                <Section title="Schedule tour">
                  <div className="rounded-lg border border-dashed border-border bg-muted/30 p-4 text-center space-y-3">
                    <CalendarIcon className="h-6 w-6 mx-auto text-muted-foreground" />
                    <div className="text-xs text-muted-foreground">
                      Tours are scheduled in one place — the Schedule Tour console runs the
                      qualification scorecard, picks the best slot and auto-blocks the room.
                    </div>
                    <Link
                      to="/myt/schedule"
                      onClick={() => selectLead(null)}
                      className="inline-flex items-center justify-center gap-1.5 h-9 px-4 rounded-md bg-accent text-accent-foreground text-sm font-medium hover:bg-accent/90 transition-colors w-full"
                    >
                      <CalendarIcon className="h-4 w-4" /> Open Schedule Tour
                    </Link>
                  </div>
                </Section>
              )}

              {leadTours.length > 1 && (
                <Section title="Tour history">
                  <div className="space-y-2">
                    {leadTours.slice(upcomingTour ? 1 : 0).map((t) => {
                      const prop = getProperty(t.propertyId, properties);
                      return (
                        <div key={t.id} className="rounded-lg border border-border bg-card p-3 text-xs space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="font-medium">{prop?.name}</span>
                            <span className="text-muted-foreground">{format(new Date(t.scheduledAt), "MMM d, p")}</span>
                          </div>
                          <div className="flex items-center gap-2 text-[11px]">
                            <Badge variant="outline" className="capitalize">{t.status}</Badge>
                            {t.decision && <Badge variant="outline" className="capitalize">{t.decision}</Badge>}
                            {t.postTour.filledAt ? (
                              <span className="text-success inline-flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> Form complete</span>
                            ) : t.status === "completed" ? (
                              <span className="text-destructive inline-flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> Form pending</span>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </Section>
              )}
            </TabsContent>

            {/* POST-TOUR */}
            <TabsContent value="post" className="space-y-4 pt-4">
              {(() => {
                const target = pendingPostTour ?? leadTours.find((t) => t.status === "completed");
                if (!target) {
                  return (
                    <div className="text-sm text-muted-foreground text-center py-8">
                      No completed tours yet. The post-tour form appears here once a tour is marked complete.
                    </div>
                  );
                }
                const prop = getProperty(target.propertyId, properties);
                const pt = target.postTour;
                return (
                  <div className="space-y-4">
                    <div className="text-xs text-muted-foreground">
                      Tour at <span className="text-foreground font-medium">{prop?.name}</span> · {format(new Date(target.scheduledAt), "MMM d, p")}
                    </div>

                    {/* Send updates / reminders — one row, always visible post-tour */}
                    <div className="flex flex-wrap gap-1.5">
                      <Button
                        size="sm" variant="outline" className="h-8 text-xs gap-1.5"
                        disabled={!prop}
                        onClick={() => {
                          if (!prop) return;
                          sendOwnerTourMessage('post_visit_thanks', {
                            tourId: target.id, leadName: lead.name, phone: lead.phone,
                            propertyName: prop.name, area: prop.area,
                            tourDate: target.scheduledAt.slice(0, 10),
                            tourTime: target.scheduledAt.slice(11, 16),
                            tcmName: tcms.find((t) => t.id === target.tcmId)?.name,
                          });
                          toast.success('Thank-you message opened');
                        }}
                      >
                        <ExternalLink className="h-3 w-3" /> Thank-you msg
                      </Button>
                      <Button
                        size="sm" variant="outline" className="h-8 text-xs gap-1.5"
                        onClick={() => {
                          sendMessage(lead.id, 'Quick update — any thoughts on the property?');
                          toast.success('Update sent');
                        }}
                      >
                        <Send className="h-3 w-3" /> Send update
                      </Button>
                      <Button
                        size="sm" variant="outline" className="h-8 text-xs gap-1.5"
                        onClick={() => {
                          const dueAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
                          setLeadFollowUp(lead.id, dueAt, priorityFor(pt.confidence), 'Post-tour reminder');
                          toast.success('Reminder set for tomorrow');
                        }}
                      >
                        <BellRing className="h-3 w-3" /> Set reminder
                      </Button>
                    </div>

                    <Section title="Outcome (mandatory · explicit)">
                      <div className="text-[11px] text-muted-foreground mb-1.5">
                        Choose carefully — the lead's stage <em>and</em> closure status update only when you click here.
                        Nothing is auto-assigned by the system.
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {([
                          { o: "booked", label: "Booked ✓", tone: "default" as const, decision: "booked" as const },
                          { o: "thinking", label: "Still deciding", tone: "outline" as const, decision: "thinking" as const },
                          { o: "not-interested", label: "Not interested", tone: "outline" as const, decision: "dropped" as const },
                          { o: null, label: "Awaiting outcome (no change)", tone: "ghost" as const, decision: null },
                        ] as const).map((opt) => (
                          <Button
                            key={opt.label}
                            variant={pt.outcome === opt.o ? "default" : opt.tone}
                            size="sm" className="capitalize"
                            onClick={() => {
                              if (!confirm(`Confirm outcome: ${opt.label}? This updates the lead stage.`)) return;
                              updatePostTour(target.id, { outcome: opt.o });
                              if (opt.decision) setDecision(target.id, opt.decision);
                              toast.success(`Outcome set: ${opt.label}`);
                            }}
                          >
                            {opt.label}
                          </Button>
                        ))}
                      </div>
                    </Section>

                    <Section title={`Deal confidence — ${pt.confidence}%`}>
                      <input
                        type="range" min={0} max={100} value={pt.confidence}
                        onChange={(e) => updatePostTour(target.id, { confidence: +e.target.value })}
                        className="w-full accent-[var(--color-accent)]"
                      />
                    </Section>

                    <Section title="Key objection">
                      <Select
                        value={pt.objection ?? ""}
                        onValueChange={(v) => updatePostTour(target.id, { objection: v })}
                      >
                        <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select objection" /></SelectTrigger>
                        <SelectContent>
                          {OBJECTIONS.map((o) => <SelectItem key={o} value={o} className="text-sm">{o}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Textarea
                        rows={2} placeholder="Note…" value={pt.objectionNote}
                        onChange={(e) => updatePostTour(target.id, { objectionNote: e.target.value })}
                        className="text-sm resize-none mt-2"
                      />
                    </Section>

                    <div className="grid grid-cols-2 gap-3">
                      <Section title="Expected decision">
                        <Input
                          type="date"
                          value={pt.expectedDecisionAt ? pt.expectedDecisionAt.slice(0, 10) : ""}
                          onChange={(e) => updatePostTour(target.id, { expectedDecisionAt: e.target.value ? new Date(e.target.value).toISOString() : null })}
                          className="h-9 text-sm"
                        />
                      </Section>
                      <Section title="Next follow-up">
                        <Input
                          type="datetime-local"
                          value={pt.nextFollowUpAt ? toLocal(pt.nextFollowUpAt) : ""}
                          onChange={(e) => updatePostTour(target.id, { nextFollowUpAt: e.target.value ? new Date(e.target.value).toISOString() : null })}
                          className="h-9 text-sm"
                        />
                      </Section>
                    </div>

                    {pt.filledAt ? (
                      <div className="rounded-lg border border-success/30 bg-success/5 p-3 flex items-center gap-2 text-xs">
                        <CheckCircle2 className="h-4 w-4 text-success" />
                        <span>Form complete · saved {mounted ? formatDistanceToNow(new Date(pt.filledAt), { addSuffix: true }) : "recently"}</span>
                      </div>
                    ) : (
                      <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 flex items-center gap-2 text-xs">
                        <ClipboardCheck className="h-4 w-4" />
                        <span>Fill all four fields to mark this lead complete and silence the alert.</span>
                      </div>
                    )}

                    {/* Close deal — one click, blocks the bed, fires the booking */}
                    {lead.stage !== "booked" && (
                      <Button
                        size="lg" className="w-full bg-success text-success-foreground hover:bg-success/90"
                        onClick={() => {
                          closeDeal({
                            leadId: lead.id,
                            tourId: target.id,
                            propertyId: target.propertyId,
                            tcmId: target.tcmId,
                            amount: prop?.pricePerBed ?? 12000,
                          });
                          toast.success(`Deal closed · ${lead.name} → ${prop?.name}`, {
                            description: `Bed blocked, MRR +₹${((prop?.pricePerBed ?? 12000) / 1000).toFixed(0)}k`,
                          });
                        }}
                      >
                        <IndianRupee className="h-4 w-4 mr-1.5" /> Close deal · ₹{((prop?.pricePerBed ?? 12000) / 1000).toFixed(0)}k/mo
                      </Button>
                    )}
                    {lead.stage === "booked" && (
                      <div className="rounded-lg border border-success/40 bg-success/10 p-3 flex items-center gap-2 text-sm">
                        <CheckCircle2 className="h-5 w-5 text-success" />
                        <span className="font-semibold text-success">Booked.</span>
                        <span className="text-muted-foreground">Bed blocked, lead closed.</span>
                      </div>
                    )}
                  </div>
                );
              })()}
            </TabsContent>

            {/* HANDOFF — FlowOps ↔ TCM thread for this lead */}
            <TabsContent value="handoff" className="pt-4">
              <Section title="FlowOps ↔ TCM thread">
                <HandoffThread leadId={lead.id} />
              </Section>
            </TabsContent>

            {/* ACTIVITY LOG */}
            <TabsContent value="log" className="pt-4">
              <Section title="Activity log (auto)">
                <div className="space-y-2">
                  {leadActivities.length === 0 && (
                    <div className="text-xs text-muted-foreground">No activity yet.</div>
                  )}
                  {leadActivities.map((a) => (
                    <div key={a.id} className="flex gap-2 text-xs border-l-2 border-border pl-3 py-1">
                      <ActivityIcon className="h-3 w-3 mt-0.5 text-muted-foreground shrink-0" />
                      <div className="flex-1">
                        <div className="text-foreground">{a.text}</div>
                        <div className="text-muted-foreground text-[10px] mt-0.5">
                          {format(new Date(a.ts), "MMM d, p")} · {a.actor === "system" ? "system" : tcms.find((t) => t.id === a.actor)?.name ?? a.actor}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </Section>
            </TabsContent>
          </Tabs>
        </div>
        <LogActivityDialog
          lead={lead}
          open={logOpen}
          call={logCallNo}
          onOpenChange={(o) => { setLogOpen(o); if (!o) setLogCallNo(undefined); }}
          onLogged={() => setTab("followups")}
        />
        <Dialog open={callEngineOpen} onOpenChange={setCallEngineOpen}>
          <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="font-display">Log call — {lead.name}</DialogTitle>
              <DialogDescription className="text-xs">
                The call engine picks the purpose, captures what happened, and writes the WhatsApp message, follow-up and next step for you.
              </DialogDescription>
            </DialogHeader>
            {movementLead ? (
              <CallEngine lead={movementLead} onLogged={() => setCallEngineOpen(false)} />
            ) : (
              <p className="text-sm text-muted-foreground">
                This customer is not linked to Movement yet, so the call engine cannot run for them here. No duplicate was created.
              </p>
            )}
          </DialogContent>
        </Dialog>
      </SheetContent>
    </Sheet>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">{title}</div>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function Meta({ icon: Icon, label, value }: { icon: typeof CalendarIcon; label: string; value: string }) {
  return (
    <div className="rounded-md bg-muted/60 px-2 py-1.5">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
        <Icon className="h-2.5 w-2.5" /> {label}
      </div>
      <div className="text-xs font-medium text-foreground mt-0.5">{value}</div>
    </div>
  );
}

function UpcomingTourCard({
  tour, scheduledAt, onScheduledAtChange, onReschedule, onCancel, onComplete,
}: {
  tour: import("@/lib/types").Tour;
  scheduledAt: string;
  onScheduledAtChange: (value: string) => void;
  onReschedule: () => void;
  onCancel: () => void;
  onComplete: () => void;
}) {
  const { properties, tcms } = useApp();
  const prop = properties.find((p) => p.id === tour.propertyId);
  const tcm = tcms.find((t) => t.id === tour.tcmId);
  return (
    <div className="rounded-lg border border-accent/30 bg-accent/5 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="font-display font-semibold text-sm">{prop?.name}</div>
        <Badge className="bg-accent text-accent-foreground capitalize">{tour.status}</Badge>
      </div>
      <div className="text-xs text-muted-foreground">
        {format(new Date(tour.scheduledAt), "EEE, MMM d · p")} · {tcm?.name}
      </div>
      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
        <Input
          type="datetime-local"
          value={scheduledAt}
          onChange={(e) => onScheduledAtChange(e.target.value)}
          className="h-8 text-xs"
        />
        <Button size="sm" variant="outline" onClick={onReschedule}>Reschedule</Button>
      </div>
      <div className="flex gap-2 pt-1">
        <Button size="sm" variant="outline" className="flex-1" onClick={onCancel}>Cancel</Button>
        <Button size="sm" className="flex-1" onClick={onComplete}>Mark complete</Button>
      </div>
    </div>
  );
}

function toLocal(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function LeadHistoryChips({ leadId, onOpenHistory }: { leadId: string; onOpenHistory: () => void }) {
  const cycles = useLifecycle((s) => s.cycles[leadId]) ?? [];
  const claims = useLiveActivity((s) => s.claims).filter(
    (c) => c.leadId === leadId && c.state === "active",
  );
  if (cycles.length === 0 && claims.length === 0) return null;
  const openCycle = cycles.find((c) => !c.closedAt);
  return (
    <>
      {cycles.length > 0 && (
        <button
          type="button"
          onClick={onOpenHistory}
          title="Open full journey · cycles, revivals, and reasons"
          className="inline-flex items-center gap-1 rounded-full border border-amber-300/60 bg-amber-50 text-amber-800 px-2 py-0.5 text-[10px] font-medium hover:bg-amber-100"
        >
          <History className="h-3 w-3" />
          {cycles.length}× returning · view journey
          {openCycle ? ` · cycle ${openCycle.cycleNumber} open` : ""}
        </button>
      )}
      {claims.length > 0 && (
        <span
          title={claims.map((c) => `${c.claimerName}: ${c.reason}`).join("\n")}
          className="inline-flex items-center gap-1 rounded-full border border-emerald-300/60 bg-emerald-50 text-emerald-800 px-2 py-0.5 text-[10px] font-medium"
        >
          <UsersIcon className="h-3 w-3" />
          {claims.length} co-working now
        </span>
      )}
    </>
  );
}

function priorityFor(c: number): FollowUpPriority {
  return c >= 75 ? "high" : c >= 50 ? "medium" : "low";
}
