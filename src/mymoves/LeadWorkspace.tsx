// The one screen. Same layout for all 30 stages — only the content changes,
// because everything is driven by the workflow config and the rules engine.
import { useState } from "react";
import { AlertTriangle, Clock, MessageSquare, Phone, ShieldAlert, User } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import type { Lead } from "./types";
import { REQUIREMENT_FIELDS } from "./types";
import { ACTIONS, MORE_ACTIONS, WORKFLOW } from "./workflow";
import {
  controlTowerExceptions, missingQualification, redSignals, requirementCompletion, sla, universalGaps,
} from "./engine";
import { useMyMoves } from "./store";
import { ActionDialog } from "./ActionDialog";

const money = (n?: number) => (n ? `₹${n.toLocaleString("en-IN")}` : "—");
const when = (iso?: string) => (iso ? new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");

export function LeadWorkspace({ lead }: { lead: Lead }) {
  const cfg = WORKFLOW[lead.stage];
  const t = sla(lead);
  const signals = redSignals(lead);
  const gaps = universalGaps(lead);
  const exceptions = controlTowerExceptions(lead);
  const missingQ = missingQualification(lead);
  const captureRequirement = useMyMoves((s) => s.captureRequirement);
  const [open, setOpen] = useState<string | null>(null);
  const [qValue, setQValue] = useState("");
  const property = lead.matches.find((m) => m.id === lead.selectedPropertyId);
  const paid = lead.payments.filter((p) => p.verified).reduce((s, p) => s + p.amount, 0);

  const btn = (id: string, variant: "default" | "outline" = "default") => {
    const a = ACTIONS[id];
    if (!a) return null;
    const blocked = (a.blockedBy?.(lead) ?? []).length > 0;
    return (
      <Button key={id} size="sm" variant={variant} onClick={() => setOpen(id)}
        className={blocked ? "border-destructive/50 text-destructive" : ""}>
        {blocked && <ShieldAlert className="mr-1 size-3.5" />}{a.label}
      </Button>
    );
  };

  return (
    <div className="space-y-4">
      {/* control bar — five questions, always answered */}
      <Card className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold">{lead.name}</h2>
              <Badge variant="outline">{lead.stage.replace(/_/g, " ")}</Badge>
              {lead.labels.timing && <Badge>{lead.labels.timing.replace(/_/g, " ")}</Badge>}
              {lead.labels.likelihood && <Badge variant="secondary">{lead.labels.likelihood.replace(/_/g, " ")}</Badge>}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {lead.phone || "number unresolved"} · {lead.waAccount} · {lead.waPresence.replace(/_/g, " ").toLowerCase()}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">Use case — {lead.useCase}</p>
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
            <Field icon={<User className="size-3.5" />} label="Owner" value={lead.owner ?? "UNOWNED"} bad={!lead.owner} />
            <Field icon={<Clock className="size-3.5" />} label="Next action" value={lead.nextAction ?? "MISSING"} bad={!lead.nextAction} />
            <Field icon={<Clock className="size-3.5" />} label="Deadline" value={t.label} bad={t.severity === "CRITICAL"} />
            <Field icon={<MessageSquare className="size-3.5" />} label="Last customer msg" value={when(lead.lastCustomerMsgAt)} />
            <Field icon={<Phone className="size-3.5" />} label="Channel" value={lead.channel} />
            <Field icon={<AlertTriangle className="size-3.5" />} label="Blocker" value={lead.blocker ?? "none"} bad={!!lead.blocker} />
          </div>
        </div>
      </Card>

      {/* what must happen now */}
      <Card className="border-primary/40 p-4">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">What must happen now</p>
        <h3 className="mt-1 text-base font-semibold">{cfg.headline(lead)}</h3>
        {cfg.sub && <p className="text-sm text-muted-foreground">{cfg.sub(lead)}</p>}
        <div className="mt-3 flex flex-wrap gap-2">{cfg.primary.map((id) => btn(id))}</div>
        <div className="mt-2 flex flex-wrap gap-2">{cfg.secondary.map((id) => btn(id, "outline"))}</div>
        <div className="mt-3 border-t pt-2">
          <p className="mb-1.5 text-xs uppercase tracking-wide text-muted-foreground">More</p>
          <div className="flex flex-wrap gap-2">{MORE_ACTIONS.map((id) => btn(id, "outline"))}</div>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Mandatory for this stage: {cfg.requiredFields.join(" · ") || "none"} · can move to {cfg.nextStages.join(", ") || "nothing (closed)"}
        </p>
      </Card>

      {(signals.length > 0 || gaps.length > 0 || exceptions.length > 0) && (
        <Card className="border-destructive/40 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-destructive">Red signals & exceptions</p>
          <div className="mt-2 space-y-1.5 text-sm">
            {signals.map((s) => (
              <div key={s.code} className="flex items-center justify-between gap-3">
                <span className={s.severity === "CRITICAL" ? "text-destructive" : "text-amber-600"}>• {s.label}</span>
                {s.action && ACTIONS[s.action] && (
                  <Button size="sm" variant="outline" onClick={() => setOpen(s.action!)}>{ACTIONS[s.action]!.label}</Button>
                )}
              </div>
            ))}
            {gaps.length > 0 && <p className="text-destructive">• Universal rules missing: {gaps.join(", ")}</p>}
            {exceptions.length > 0 && <p className="text-muted-foreground">Control Tower sees: {exceptions.join(" · ")}</p>}
          </div>
        </Card>
      )}

      <Tabs defaultValue="requirement">
        <TabsList className="flex-wrap">
          <TabsTrigger value="requirement">Requirement</TabsTrigger>
          <TabsTrigger value="properties">Properties</TabsTrigger>
          <TabsTrigger value="tour">Tour</TabsTrigger>
          <TabsTrigger value="money">Quote & booking</TabsTrigger>
          <TabsTrigger value="checkin">Check-in</TabsTrigger>
          <TabsTrigger value="chat">Conversation</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="requirement" className="space-y-3">
          <Card className="p-4">
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="font-medium">Requirement completeness</span>
              <span className="text-muted-foreground">{requirementCompletion(lead)}%</span>
            </div>
            <Progress value={requirementCompletion(lead)} />
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {REQUIREMENT_FIELDS.map(({ key, label }) => {
                const v = lead.requirement[key];
                const text = Array.isArray(v) ? v.join(", ") : v === undefined || v === "" ? "" : String(v);
                return (
                  <div key={key} className="flex justify-between gap-2 text-sm">
                    <span className="text-muted-foreground">{label}</span>
                    <span className={text ? "" : "text-destructive"}>{text || "missing"}</span>
                  </div>
                );
              })}
            </div>
          </Card>
          {missingQ.length > 0 && (
            <Card className="p-4">
              <p className="text-sm font-medium">Next question to ask — {missingQ.length} still missing</p>
              <p className="mt-1 text-sm text-muted-foreground">{missingQ[0]!.q}</p>
              {missingQ[0]!.kind === "choice" ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {missingQ[0]!.options?.map((o) => (
                    <Button key={o} size="sm" variant="outline"
                      onClick={() => captureRequirement(lead.id, missingQ[0]!.id, o)}>{o}</Button>
                  ))}
                </div>
              ) : (
                <div className="mt-2 flex gap-2">
                  <Input value={qValue} onChange={(e) => setQValue(e.target.value)}
                    type={missingQ[0]!.kind === "date" ? "date" : missingQ[0]!.kind === "number" ? "number" : "text"}
                    placeholder={missingQ[0]!.placeholder} />
                  <Button disabled={!qValue} onClick={() => { captureRequirement(lead.id, missingQ[0]!.id, qValue); setQValue(""); }}>Capture</Button>
                </div>
              )}
            </Card>
          )}
        </TabsContent>

        <TabsContent value="properties">
          <Card className="p-4">
            <p className="text-sm">Feasibility: <span className="font-medium">{lead.feasibility ?? "not assessed"}</span></p>
            {lead.matches.length === 0 && <p className="mt-2 text-sm text-muted-foreground">No matches generated yet.</p>}
            <div className="mt-3 space-y-2">
              {lead.matches.map((m) => (
                <div key={m.id} className={`rounded-md border p-3 text-sm ${m.id === lead.selectedPropertyId ? "border-primary" : ""}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">{m.name} · {m.roomType} {m.room}</span>
                    <Badge variant="secondary">{m.matchPct}% match</Badge>
                  </div>
                  <p className="mt-1 text-muted-foreground">
                    Rent {money(m.rent)} · deposit {money(m.deposit)} · maintenance {money(m.maintenance)} · token {money(m.bookingAmount)} · {m.distanceKm} km
                  </p>
                  <p className="mt-1 text-muted-foreground">Why: {m.why.join(", ")}{m.concern ? ` · concern: ${m.concern}` : ""}</p>
                </div>
              ))}
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="tour">
          <Card className="p-4 text-sm">
            {!lead.tour ? <p className="text-muted-foreground">No tour yet.</p> : (
              <div className="grid gap-1.5 sm:grid-cols-2">
                <Row k="Property" v={`${lead.tour.propertyName} · ${lead.tour.room}`} />
                <Row k="When" v={lead.tour.at} />
                <Row k="Handled by" v={`${lead.tour.handledBy} — ${lead.tour.tourOwner}`} />
                <Row k="Handover accepted" v={lead.tour.handoverAccepted ? "YES" : "NO"} bad={!lead.tour.handoverAccepted} />
                <Row k="Property informed" v={lead.tour.propertyInformed ? "YES" : "NO"} bad={!lead.tour.propertyInformed} />
                <Row k="Property acknowledged" v={lead.tour.propertyAcknowledged ? "YES" : "NO"} bad={!lead.tour.propertyAcknowledged} />
                <Row k="Customer confirmation" v={lead.tour.customerConfirmed ?? "pending"} bad={!lead.tour.customerConfirmed} />
                <Row k="Reaction" v={lead.tour.reaction?.replace(/_/g, " ") ?? "—"} />
                <Row k="Preferred room" v={lead.tour.preferredRoom ?? "—"} />
                <Row k="Blocker" v={lead.tour.blocker ?? "none"} bad={!!lead.tour.blocker && lead.tour.blocker !== "NONE"} />
              </div>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="money">
          <Card className="space-y-3 p-4 text-sm">
            {lead.quote ? (
              <div className="grid gap-1.5 sm:grid-cols-2">
                <Row k="Quote" v={lead.quote.id} />
                <Row k="Room" v={`${lead.quote.roomType} ${lead.quote.room}`} />
                <Row k="Actual rent" v={money(lead.quote.actualRent)} />
                <Row k="Offered rent" v={money(lead.quote.offerRent)} />
                <Row k="Deposit" v={money(lead.quote.deposit)} />
                <Row k="Maintenance" v={money(lead.quote.maintenance)} />
                <Row k="Token" v={money(lead.quote.bookingAmount)} />
                <Row k="Lock-in / notice" v={`${lead.quote.lockIn} / ${lead.quote.notice}`} />
                <Row k="Valid until" v={lead.quote.validUntil} />
                <Row k="Outcome" v={lead.quote.outcome ?? "awaiting response"} />
              </div>
            ) : <p className="text-muted-foreground">No quotation yet.</p>}
            {lead.booking && (
              <div className="grid gap-1.5 border-t pt-3 sm:grid-cols-2">
                <Row k="Booking" v={lead.booking.id} />
                <Row k="Property" v={`${lead.booking.propertyName} · ${lead.booking.room}`} />
                <Row k="Rent (frozen)" v={money(lead.booking.rent)} />
                <Row k="Discount" v={money(lead.booking.discount)} />
                <Row k="Inventory approval" v={lead.booking.inventoryApproval} bad={lead.booking.inventoryApproval !== "YES"} />
                <Row k="Commercial approval" v={lead.booking.commercialApproval} bad={lead.booking.commercialApproval !== "YES"} />
                <Row k="Room hold" v={when(lead.booking.roomHeldUntil)} />
                <Row k="Final room lock" v={lead.booking.finalRoomLock ? "YES" : "NO"} bad={!lead.booking.finalRoomLock} />
                <Row k="Move-in" v={lead.booking.moveIn} />
                <Row k="Verified received" v={`${money(paid)} of ${money(lead.booking.bookingAmount)}`} bad={paid < lead.booking.bookingAmount} />
              </div>
            )}
            {lead.payments.length > 0 && (
              <div className="border-t pt-3">
                {lead.payments.map((p) => (
                  <p key={p.id} className={p.verified ? "" : "text-destructive"}>
                    {money(p.amount)} {p.mode} → {p.paidTo} · proof {p.proof ? "yes" : "no"} · verified {p.verified ? "yes" : "no"} · {when(p.at)}
                  </p>
                ))}
              </div>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="checkin">
          <Card className="p-4 text-sm">
            {!lead.checkin ? <p className="text-muted-foreground">Check-in readiness not started.</p> : (
              <div className="grid gap-1.5 sm:grid-cols-2">
                {Object.entries(lead.checkin).map(([k, v]) => (
                  <Row key={k} k={k.replace(/([A-Z])/g, " $1")} v={typeof v === "boolean" ? (v ? "YES" : "NO") : String(v ?? "—")} bad={v === false} />
                ))}
              </div>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="chat">
          <Card className="space-y-2 p-4 text-sm">
            <p className="text-muted-foreground">
              Last screenshot {when(lead.lastScreenshotAt)} · last customer {when(lead.lastCustomerMsgAt)} · last team {when(lead.lastTeamMsgAt)}
            </p>
            {lead.chat.length === 0 ? <p className="text-muted-foreground">No reconstructed messages.</p> : lead.chat.map((c, i) => (
              <div key={i} className={c.from === "CUSTOMER" ? "" : "text-right"}>
                <span className="inline-block rounded-md bg-muted px-2 py-1">{c.text}</span>
                <span className="ml-2 text-xs text-muted-foreground">{when(c.at)}</span>
              </div>
            ))}
            <p className="pt-2 text-xs text-muted-foreground">
              Reconstruction verified: {lead.reconstructionVerified ? "yes" : "no — read before asking anything"}
            </p>
          </Card>
        </TabsContent>

        <TabsContent value="history">
          <Card className="space-y-2 p-4 text-sm">
            {[...lead.events].reverse().map((e) => (
              <div key={e.id} className="border-l-2 pl-3">
                <p>{e.label}</p>
                <p className="text-xs text-muted-foreground">{when(e.at)} · {e.actor} · {e.kind}{e.detail ? ` · override: ${e.detail}` : ""}</p>
              </div>
            ))}
          </Card>
        </TabsContent>
      </Tabs>

      {open && <ActionDialog lead={lead} actionId={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function Field({ icon, label, value, bad }: { icon: React.ReactNode; label: string; value: string; bad?: boolean }) {
  return (
    <div>
      <p className="flex items-center gap-1 text-xs text-muted-foreground">{icon}{label}</p>
      <p className={`text-sm font-medium ${bad ? "text-destructive" : ""}`}>{value}</p>
    </div>
  );
}

function Row({ k, v, bad }: { k: string; v: string; bad?: boolean }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="capitalize text-muted-foreground">{k}</span>
      <span className={bad ? "text-destructive" : ""}>{v}</span>
    </div>
  );
}
