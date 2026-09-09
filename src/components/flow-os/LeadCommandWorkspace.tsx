import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Phone, MessageSquare, Clock3, MoreHorizontal, ArrowRight, CalendarClock, CheckCircle2, AlertTriangle } from "lucide-react";
import { ChatSignalStrip } from "./ChatSignalStrip";
import {
  classifyLastMessage,
  type SuggestedCommercialStage,
} from "@/lib/flow-os/chat-intelligence";
import {
  completeAndNext,
  confirmSuggestedStage,
  heartbeatClaim,
  moveLeadToFuture,
  requestTakeover,
  type WorkItemView,
  type FlowOperator,
} from "@/lib/flow-os/revenue-api";

const SECTIONS = ["Profile", "WhatsApp Intelligence", "Properties", "Tour", "Booking", "Check-in", "Timeline"] as const;
type Section = (typeof SECTIONS)[number];

function formatStage(stage?: string | null) {
  return (stage || "NEW").replaceAll("_", " ");
}

function claimAge(claim?: WorkItemView["claim"]) {
  if (!claim?.claimed_at) return undefined;
  const min = Math.max(0, Math.floor((Date.now() - Date.parse(claim.claimed_at)) / 60_000));
  return `${min}m claim`;
}

function primaryActionFor(stage?: string | null) {
  const s = (stage ?? "NEW").toUpperCase();
  const map: Record<string, string> = {
    NEW: "QUALIFY",
    DOSSIER: "SHOW PROPERTIES",
    MATCHED: "SCHEDULE TOUR",
    TOUR_SCHEDULED: "CONFIRM TOUR",
    TOUR_CONFIRMED: "START TOUR",
    TOUR_IN_PROGRESS: "COMPLETE TOUR",
    POST_VISIT: "SEND QUOTATION",
    QUOTED: "FOLLOW UP QUOTE",
    NEGOTIATION: "RECORD PAYMENT",
    BOOKED: "CHECK-IN READINESS",
    CHECK_IN_READY: "CONFIRM CHECK-IN",
    CHECKED_IN: "CHECKED IN",
    FUTURE: "WAITING FOR DATED FOLLOW-UP",
    LOST: "LOST",
  };
  return map[s] ?? "CHOOSE NEXT ACTION";
}

export function LeadCommandWorkspace({
  item,
  operator,
  onClose,
  onChanged,
}: {
  item: WorkItemView;
  operator: FlowOperator;
  onClose?: () => void;
  onChanged?: () => void | Promise<void>;
}) {
  const [section, setSection] = useState<Section>("WhatsApp Intelligence");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [futureOpen, setFutureOpen] = useState(false);
  const [futureDate, setFutureDate] = useState("");
  const [followUpAt, setFollowUpAt] = useState("");
  const [futureReason, setFutureReason] = useState("");
  const [futureOutcome, setFutureOutcome] = useState("Re-qualify and schedule tour");
  const [completeOpen, setCompleteOpen] = useState(false);
  const [disposition, setDisposition] = useState("");
  const [nextAction, setNextAction] = useState(item.lead.current_mission || "Follow up customer");
  const [nextActionAt, setNextActionAt] = useState("");
  const [blocker, setBlocker] = useState(item.lead.primary_blocker || "");
  const [stage, setStage] = useState(item.lead.pipeline_stage || "NEW");

  const latestMessage = item.latestObservation?.last_message ?? item.lead.last_wa_message ?? "";
  const suggestion = useMemo(() => classifyLastMessage(latestMessage), [latestMessage]);
  const claimOwnedByMe = !item.claim || item.claim.operator_id === operator.id;
  const currentHandler = item.claim?.operator_name ?? item.lead.current_handler_name ?? null;
  const waDigits = item.lead.phone?.replace(/\D/g, "") ?? "";

  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    setMessage(null);
    try {
      await action();
      if (item.claim?.id && claimOwnedByMe) {
        try { await heartbeatClaim(item.claim.id); } catch { /* non-fatal */ }
      }
      setMessage(success);
      await onChanged?.();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full min-h-[720px] flex-col bg-background">
      <div className="border-b border-border px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-bold tracking-tight">{item.lead.wa_name || "Unnamed customer"}</h2>
              <Badge variant="outline">{formatStage(item.lead.pipeline_stage)}</Badge>
              {item.isPriorityInterrupt && <Badge className="bg-red-600">Priority Interrupt</Badge>}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {item.lead.phone} · {item.lead.location_text || "Location not confirmed"} · Owner {item.lead.current_owner || "unassigned"}
            </p>
            <ChatSignalStrip
              seenState={(item.latestObservation?.seen_state ?? item.lead.wa_seen_state) as any}
              unreadCount={item.latestObservation?.unread_count ?? item.lead.wa_unread_count}
              observedAt={item.latestObservation?.captured_at ?? item.lead.last_wa_seen_at}
              labelColour={item.latestObservation?.label_colour ?? item.lead.wa_label_colour}
              labelName={item.latestObservation?.label_name ?? item.lead.wa_label_name}
              currentHandlerName={currentHandler}
              ownerName={item.lead.current_owner}
              claimAgeLabel={claimAge(item.claim)}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" asChild>
              <a href={`tel:${item.lead.phone}`}><Phone className="mr-1.5 h-4 w-4" />Call</a>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <a href={`https://wa.me/${waDigits}`} target="_blank" rel="noreferrer"><MessageSquare className="mr-1.5 h-4 w-4" />WhatsApp</a>
            </Button>
            <Button variant="outline" size="sm" onClick={() => setCompleteOpen(true)}><Clock3 className="mr-1.5 h-4 w-4" />Follow-up</Button>
            <Button variant="outline" size="icon" aria-label="More"><MoreHorizontal className="h-4 w-4" /></Button>
            {onClose && <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>}
          </div>
        </div>

        {!claimOwnedByMe && (
          <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:bg-amber-950/30 dark:text-amber-100">
            <span><b>Read only.</b> This chat is actively handled by {currentHandler || "another operator"}.</span>
            <Button size="sm" variant="outline" disabled={busy || !item.claim?.id} onClick={() => item.claim?.id && run(() => requestTakeover(item.claim!.id), "Takeover requested")}>Request takeover</Button>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-1 border-b border-border bg-muted/20 px-4 py-2">
        {SECTIONS.map((name) => (
          <button
            key={name}
            onClick={() => setSection(name)}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold ${section === name ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
          >
            {name}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-auto p-5">
        {section === "Profile" && (
          <div className="grid gap-3 md:grid-cols-2">
            <Info label="Customer" value={item.lead.wa_name || "Not captured"} />
            <Info label="Phone" value={item.lead.phone} />
            <Info label="Location" value={item.lead.location_text || "Not confirmed"} />
            <Info label="Move-in" value={item.lead.movein_date || "Not confirmed"} />
            <Info label="Priority" value={item.lead.priority || "Normal"} />
            <Info label="Opportunity score" value={String(item.lead.opportunity_score ?? item.lead.score ?? 0)} />
            <Info label="Current mission" value={item.lead.current_mission || primaryActionFor(item.lead.pipeline_stage)} wide />
            <Info label="Primary blocker" value={item.lead.primary_blocker || "Not identified"} wide />
          </div>
        )}

        {section === "WhatsApp Intelligence" && (
          <div className="space-y-4">
            <Card className="p-4">
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Latest visible message</div>
              <div className="text-base font-medium">{latestMessage ? `“${latestMessage}”` : "No message preview captured"}</div>
              <div className="mt-3"><ChatSignalStrip
                seenState={(item.latestObservation?.seen_state ?? item.lead.wa_seen_state) as any}
                unreadCount={item.latestObservation?.unread_count ?? item.lead.wa_unread_count}
                observedAt={item.latestObservation?.captured_at ?? item.lead.last_wa_seen_at}
                labelColour={item.latestObservation?.label_colour ?? item.lead.wa_label_colour}
                labelName={item.latestObservation?.label_name ?? item.lead.wa_label_name}
                currentHandlerName={currentHandler}
              /></div>
            </Card>

            <Card className="border-primary/20 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Last-message suggestion — not automatic truth</div>
                  <div className="mt-1 text-lg font-semibold">{formatStage(suggestion.suggestedStage)}</div>
                  <div className="text-sm">{suggestion.suggestedMission}</div>
                  <div className="mt-2 text-xs text-muted-foreground">Confidence {Math.round(suggestion.confidence * 100)}% · {suggestion.evidence.join(" · ")}</div>
                </div>
                {suggestion.suggestedStage !== "UNKNOWN" && suggestion.suggestedStage !== item.lead.pipeline_stage && claimOwnedByMe && (
                  <Button disabled={busy} onClick={() => run(
                    () => confirmSuggestedStage(item.lead.id, suggestion.suggestedStage, suggestion.suggestedMission),
                    `Stage confirmed as ${formatStage(suggestion.suggestedStage)}`,
                  )}>Confirm suggestion</Button>
                )}
              </div>
            </Card>

            <div className="grid gap-3 md:grid-cols-3">
              <Info label="Movement" value={item.latestObservation?.movement_signal || item.lead.sync_state || "No movement comparison yet"} />
              <Info label="Direction" value={item.latestObservation?.preview_direction || "Unknown"} />
              <Info label="Visible time" value={item.latestObservation?.visible_timestamp_raw || "Not captured"} />
            </div>
          </div>
        )}

        {section === "Properties" && (
          <StagePanel title="Property Match" stage={item.lead.pipeline_stage} description="Reuse the existing Gharpayy property matching capability here. The canonical mission decides when this section becomes primary; do not create a second lead state." primary="Open strongest two options" />
        )}
        {section === "Tour" && (
          <StagePanel title="Tour" stage={item.lead.pipeline_stage} description="Schedule, confirm, start, complete, no-show and reschedule should all write one canonical tour path. Existing Tour buttons should enter this same section." primary={primaryActionFor(item.lead.pipeline_stage)} />
        )}
        {section === "Booking" && (
          <StagePanel title="Quote / Booking / Payment" stage={item.lead.pipeline_stage} description="Quotation statuses are events (saved, copied, sent, accepted), not duplicate buttons. Record Payment is separate from Check-in readiness." primary={primaryActionFor(item.lead.pipeline_stage)} />
        )}
        {section === "Check-in" && (
          <StagePanel title="Check-in gates" stage={item.lead.pipeline_stage} description="Payment, room/bed, owner approval, KYC and agreement must be complete before Confirm Check-in can become the primary action." primary={primaryActionFor(item.lead.pipeline_stage)} />
        )}
        {section === "Timeline" && (
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>Every screenshot observation, claim, call, WhatsApp movement, stage confirmation, next action, tour, quote, payment and check-in event belongs to this lead's one timeline.</p>
            <p>Latest observation ID: {item.latestObservation?.id || "—"}</p>
            <p>Draft batch: {item.batchId} · Position {item.position}/30 · ROI {Math.round(item.roiScore)}</p>
          </div>
        )}
      </div>

      <div className="border-t border-border bg-background px-5 py-4">
        {message && <div className={`mb-3 rounded-md border px-3 py-2 text-sm ${/fail|required|error|already/i.test(message) ? "border-red-300 bg-red-50 text-red-800" : "border-emerald-300 bg-emerald-50 text-emerald-800"}`}>{message}</div>}

        {futureOpen && (
          <Card className="mb-3 p-4">
            <div className="mb-3 flex items-center gap-2 font-semibold"><CalendarClock className="h-4 w-4" />Move to Future</div>
            <div className="grid gap-3 md:grid-cols-2">
              <Input type="date" value={futureDate} onChange={(e) => setFutureDate(e.target.value)} aria-label="Move-in date" />
              <Input type="datetime-local" value={followUpAt} onChange={(e) => setFollowUpAt(e.target.value)} aria-label="Next contact date" />
              <Input value={futureReason} onChange={(e) => setFutureReason(e.target.value)} placeholder="Why future?" />
              <Input value={futureOutcome} onChange={(e) => setFutureOutcome(e.target.value)} placeholder="Desired next outcome" />
            </div>
            <div className="mt-3 flex gap-2">
              <Button disabled={busy || !followUpAt || !futureReason} onClick={() => run(async () => {
                await moveLeadToFuture({
                  leadId: item.lead.id,
                  itemId: item.itemId,
                  followUpAt: new Date(followUpAt).toISOString(),
                  moveInDate: futureDate || undefined,
                  reason: futureReason,
                  desiredOutcome: futureOutcome,
                });
                setFutureOpen(false);
              }, "Moved to Future with a dated next action")}>Save Future</Button>
              <Button variant="ghost" onClick={() => setFutureOpen(false)}>Cancel</Button>
            </div>
          </Card>
        )}

        {completeOpen && (
          <Card className="mb-3 p-4">
            <div className="mb-3 flex items-center gap-2 font-semibold"><CheckCircle2 className="h-4 w-4" />Complete & Next</div>
            <div className="grid gap-3 md:grid-cols-2">
              <Input value={disposition} onChange={(e) => setDisposition(e.target.value)} placeholder="Outcome / disposition" />
              <Input value={stage} onChange={(e) => setStage(e.target.value.toUpperCase())} placeholder="Canonical stage" />
              <Input value={nextAction} onChange={(e) => setNextAction(e.target.value)} placeholder="Next action" />
              <Input type="datetime-local" value={nextActionAt} onChange={(e) => setNextActionAt(e.target.value)} aria-label="Next action time" />
              <Input className="md:col-span-2" value={blocker} onChange={(e) => setBlocker(e.target.value)} placeholder="Primary blocker (optional)" />
            </div>
            <div className="mt-3 flex gap-2">
              <Button disabled={busy || !disposition} onClick={() => run(async () => {
                await completeAndNext({
                  leadId: item.lead.id,
                  itemId: item.itemId,
                  disposition,
                  stage,
                  nextAction,
                  nextActionAt: nextActionAt ? new Date(nextActionAt).toISOString() : undefined,
                  blocker: blocker || undefined,
                });
                setCompleteOpen(false);
                onClose?.();
              }, "Completed. Next lead is ready.")}>Complete & Next <ArrowRight className="ml-1.5 h-4 w-4" /></Button>
              <Button variant="ghost" onClick={() => setCompleteOpen(false)}>Cancel</Button>
            </div>
          </Card>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Current mission</div>
            <div className="font-semibold">{item.lead.current_mission || primaryActionFor(item.lead.pipeline_stage)}</div>
            {item.lead.primary_blocker && <div className="mt-0.5 flex items-center gap-1 text-xs text-amber-700"><AlertTriangle className="h-3.5 w-3.5" />{item.lead.primary_blocker}</div>}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" disabled={!claimOwnedByMe || busy} onClick={() => setFutureOpen(true)}>Move to Future</Button>
            <Button disabled={!claimOwnedByMe || busy} onClick={() => setCompleteOpen(true)}>{primaryActionFor(item.lead.pipeline_stage)} <ArrowRight className="ml-1.5 h-4 w-4" /></Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Info({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={`rounded-lg border border-border bg-card p-3 ${wide ? "md:col-span-2" : ""}`}>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-medium">{value}</div>
    </div>
  );
}

function StagePanel({ title, stage, description, primary }: { title: string; stage?: string | null; description: string; primary: string }) {
  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-lg font-semibold">{title}</div>
          <div className="mt-1 text-sm text-muted-foreground">{description}</div>
          <Badge variant="outline" className="mt-3">Current stage: {formatStage(stage)}</Badge>
        </div>
        <Button variant="outline" disabled>{primary}</Button>
      </div>
      <p className="mt-4 text-xs text-muted-foreground">This panel intentionally does not invent a second business record. Existing Gharpayy Tour / Quote / Booking implementations are the capability source; Flow OS owns identity, work claim, mission, blocker and next-action truth.</p>
    </Card>
  );
}
