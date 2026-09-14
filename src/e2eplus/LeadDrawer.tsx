// The execution drawer. Every lead answers the same five questions before the
// operator is allowed to do anything else.
import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  AlertTriangle, CheckCircle2, Circle, ClipboardList, Clock, ExternalLink, Flag, ShieldCheck, User,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { LeadStoryPanel } from "@/components/lead-os/LeadStoryPanel";
import type { LeadOpsRow, LibraryBucket } from "@/lib/lead-os/library";
import { humanAge, screenshotHeartbeat, type SlaVerdict } from "@/lib/lead-os/sla";
import {
  BOOKING_LADDER, CLOSE_PROBABILITY, MASTER_JOURNEY, RECONSTRUCTION_CHECKS, SITUATION, TOUR_GATE,
  URGENCY, VISIT_STATUSES, masterStageIndex, redSignals, suggestLabels,
} from "./journey";
import { CHANNEL_OPTIONS, WHEN_OPTIONS, WHERE_OPTIONS, useE2EPlus } from "./store";
import { BOOKING_STAGE, VISIT_STAGE, loadOperator, publishNextAction, publishStage } from "./bridge";

const pretty = (v?: string | null) => (v || "—").replaceAll("_", " ");

function Chips<T extends string>({
  options, value, onPick, tone = "default",
}: { options: readonly T[]; value?: string; onPick: (v: T) => void; tone?: "default" | "danger" }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          onClick={() => onPick(o)}
          className={cn(
            "rounded-full border px-2.5 py-1 text-[11px] transition-colors",
            value === o
              ? tone === "danger"
                ? "border-red-500 bg-red-500/15 text-red-600"
                : "border-primary bg-primary/15 text-primary"
              : "border-border text-muted-foreground hover:bg-muted",
          )}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

function Section({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border p-3">
      <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />{title}
      </h3>
      {children}
    </section>
  );
}

export function LeadDrawer({
  row, bucket, sla, open, onOpenChange,
}: {
  row: LeadOpsRow | null;
  bucket: LibraryBucket | null;
  sla: SlaVerdict | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const store = useE2EPlus();
  const exec = row ? store.leads[row.id] ?? { leadId: row.id, timeline: [] } : null;
  const [nextAction, setNextAction] = useState("");
  const [nextAt, setNextAt] = useState("");
  const [outcome, setOutcome] = useState("");

  const heartbeat = screenshotHeartbeat(
    row?.latest_whatsapp_observation_at ?? row?.updated_at,
    String(row?.status || "").toLowerCase() === "closed",
  );

  const claimed = Boolean(exec?.ownerId) || Boolean(row?.current_owner);
  const signals = useMemo(
    () => (row && sla ? redSignals({ row, bucket, sla, claimed, heartbeatState: heartbeat.state }) : []),
    [row, bucket, sla, claimed, heartbeat.state],
  );
  const suggested = row && sla ? suggestLabels(row, bucket, sla) : null;
  const stageIdx = row ? masterStageIndex(row, claimed) : 0;

  if (!row || !sla) return <Sheet open={open} onOpenChange={onOpenChange}><SheetContent /></Sheet>;

  const owner = exec?.ownerName || row.current_owner || null;
  const step = Number(row.journey_step_index || 1);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-3xl">
        <SheetHeader className="space-y-1 pb-2">
          <SheetTitle className="flex flex-wrap items-center gap-2">
            {row.wa_name || "Unnamed customer"}
            <Badge variant="outline">{row.phone || "no number"}</Badge>
          </SheetTitle>
        </SheetHeader>

        {/* ---------------------- the five questions ---------------------- */}
        <div className="grid gap-2 sm:grid-cols-5">
          {[
            { q: "Where", a: pretty(MASTER_JOURNEY[stageIdx]?.label) },
            { q: "Who owns it", a: owner ? String(owner) : "Nobody — Control Tower" },
            { q: "What happened", a: `${row.library_rows_count ?? 0} captured chat rows` },
            { q: "What next", a: exec?.nextAction || pretty(bucket?.default_next_action) },
            { q: "By when", a: exec?.nextActionAt ? new Date(exec.nextActionAt).toLocaleString() : bucket?.sla_min ? `within ${humanAge(bucket.sla_min)}` : "unset" },
          ].map((c) => (
            <div key={c.q} className="rounded-lg border bg-muted/30 p-2">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{c.q}</div>
              <div className="mt-0.5 text-xs font-medium leading-snug">{c.a}</div>
            </div>
          ))}
        </div>

        <div className={cn("mt-2 rounded-lg border px-3 py-2 text-xs font-medium",
          sla.tone === "danger" ? "border-red-500/60 bg-red-500/10 text-red-600"
            : sla.tone === "warn" ? "border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-400"
              : "border-border text-muted-foreground")}>
          <Clock className="mr-1.5 inline h-3.5 w-3.5" />{sla.label} · idle {humanAge(sla.ageMin)} · {heartbeat.label}
        </div>

        <div className="mt-3 space-y-3">
          {/* master journey ladder */}
          <Section title="Master journey" icon={Flag}>
            <div className="flex flex-wrap gap-1">
              {MASTER_JOURNEY.map((s, i) => (
                <span key={s.code} title={s.doneWhen}
                  className={cn("rounded-full border px-2 py-0.5 text-[10px]",
                    i < stageIdx ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                      : i === stageIdx ? "border-primary bg-primary/15 font-semibold text-primary"
                        : "border-border text-muted-foreground")}>
                  {s.label}
                </span>
              ))}
            </div>
          </Section>

          {/* admission gate */}
          <Section title="Lead admission gate" icon={ShieldCheck}>
            <div className="space-y-2">
              <div>
                <div className="mb-1 text-[11px] text-muted-foreground">Where is this customer currently?</div>
                <Chips options={WHERE_OPTIONS} value={exec?.where}
                  onPick={(v) => store.patch(row.id, { where: v }, `Admission — customer is: ${v}`)} />
              </div>
              <div>
                <div className="mb-1 text-[11px] text-muted-foreground">Primary communication channel</div>
                <Chips options={CHANNEL_OPTIONS} value={exec?.channel}
                  onPick={(v) => store.patch(row.id, { channel: v }, `Channel set to ${v}`)} />
              </div>
              <div>
                <div className="mb-1 text-[11px] text-muted-foreground">When should this customer be handled?</div>
                <Chips options={WHEN_OPTIONS} value={exec?.when}
                  onPick={(v) => {
                    if (v === "FOLLOW-UP" && !exec?.followUpAt) {
                      store.patch(row.id, { when: v });
                      toast.warning("Follow-up needs a date and time");
                      return;
                    }
                    store.patch(row.id, { when: v }, `Handling window: ${v}`);
                  }} />
                {exec?.when === "FOLLOW-UP" && (
                  <div className="mt-1.5 flex items-center gap-2">
                    <Input type="datetime-local" className="h-8 w-56 text-xs" value={exec?.followUpAt ?? ""}
                      onChange={(e) => store.patch(row.id, { followUpAt: e.target.value })} />
                    {!exec?.followUpAt && <span className="text-[11px] text-red-600">Date + time required</span>}
                  </div>
                )}
              </div>
              <Separator />
              <div>
                <div className="mb-1 text-[11px] text-muted-foreground">
                  Are you confident you can take ownership of this lead and move it forward?
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" disabled={exec?.ownershipMode === "OWNED"}
                    onClick={() => { store.claim(row.id, "OWNED"); toast.success("You own this lead — SLA started"); }}>
                    <User className="mr-1.5 h-3.5 w-3.5" />YES — I OWN THIS LEAD
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => store.claim(row.id, "NEED_HELP")}>NEED HELP</Button>
                  <Button size="sm" variant="outline" onClick={() => store.claim(row.id, "REASSIGN")}>REASSIGN</Button>
                  {exec?.ownerId && <Button size="sm" variant="ghost" onClick={() => store.release(row.id)}>Release</Button>}
                </div>
                {exec?.claimedAt && (
                  <div className="mt-1 text-[11px] text-muted-foreground">
                    Claimed by {exec.ownerName} at {new Date(exec.claimedAt).toLocaleString()} · opening is not ownership
                  </div>
                )}
              </div>
            </div>
          </Section>

          {/* reconstruction + red signals */}
          <div className="grid gap-3 lg:grid-cols-2">
            <Section title="WhatsApp reconstruction" icon={ClipboardList}>
              <div className="space-y-1">
                {RECONSTRUCTION_CHECKS.map((c) => {
                  const inferred = step >= c.step;
                  const done = exec?.verified?.[c.code] ?? inferred;
                  return (
                    <button key={c.code} type="button"
                      onClick={() => store.patch(row.id, { verified: { ...(exec?.verified ?? {}), [c.code]: !done } }, `${!done ? "Verified" : "Un-verified"}: ${c.label}`)}
                      className="flex w-full items-center gap-2 rounded px-1 py-0.5 text-left text-xs hover:bg-muted">
                      {done ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> : <Circle className="h-3.5 w-3.5 text-muted-foreground" />}
                      <span className={done ? "" : "text-muted-foreground"}>{c.label}</span>
                      {exec?.verified?.[c.code] === undefined && <span className="ml-auto text-[10px] text-muted-foreground">inferred</span>}
                    </button>
                  );
                })}
              </div>
            </Section>

            <Section title={`Red signals (${signals.length})`} icon={AlertTriangle}>
              {signals.length ? (
                <div className="space-y-1.5">
                  {signals.map((s) => (
                    <div key={s.code} className={cn("rounded border px-2 py-1 text-[11px]",
                      s.tone === "danger" ? "border-red-500/50 bg-red-500/10 text-red-600" : "border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-400")}>
                      <div className="flex items-center justify-between gap-2 font-medium">{s.label}<span>{s.timer}</span></div>
                      <div className="text-muted-foreground">{s.detail}</div>
                    </div>
                  ))}
                </div>
              ) : <div className="text-xs text-muted-foreground">No red signals — this conversation is on time.</div>}
            </Section>
          </div>

          {/* labels */}
          <Section title="Operating classification (WhatsApp = CRM)" icon={Flag}>
            <div className="space-y-2">
              <div>
                <div className="mb-1 text-[11px] text-muted-foreground">Urgency {suggested && !exec?.urgency && <span>· suggested {suggested.urgency}</span>}</div>
                <Chips options={URGENCY} value={exec?.urgency ?? suggested?.urgency} onPick={(v) => store.patch(row.id, { urgency: v }, `Urgency ${v}`)} />
              </div>
              <div>
                <div className="mb-1 text-[11px] text-muted-foreground">Close probability</div>
                <Chips options={CLOSE_PROBABILITY} value={exec?.probability ?? suggested?.probability} onPick={(v) => store.patch(row.id, { probability: v }, `Close probability ${v}`)} />
              </div>
              <div>
                <div className="mb-1 text-[11px] text-muted-foreground">Current situation</div>
                <Chips options={SITUATION} value={exec?.situation ?? suggested?.situation} onPick={(v) => store.patch(row.id, { situation: v }, `Situation ${v}`)} />
              </div>
            </div>
          </Section>

          {/* execution: outcome → stage → next action → due */}
          <Section title="Execution — outcome, next action, due time" icon={Clock}>
            <div className="grid gap-2 sm:grid-cols-3">
              <Input className="h-8 text-xs" placeholder="Outcome (e.g. customer interested)" value={outcome} onChange={(e) => setOutcome(e.target.value)} />
              <Input className="h-8 text-xs" placeholder="Next action (e.g. call back)" value={nextAction} onChange={(e) => setNextAction(e.target.value)} />
              <Input className="h-8 text-xs" type="datetime-local" value={nextAt} onChange={(e) => setNextAt(e.target.value)} />
            </div>
            <Button size="sm" className="mt-2"
              onClick={() => {
                if (!outcome.trim() || !nextAction.trim() || !nextAt) { toast.error("Outcome, next action and due time are all required"); return; }
                store.patch(row.id, { lastOutcome: outcome.trim(), nextAction: nextAction.trim(), nextActionAt: nextAt },
                  `${outcome.trim()} → next: ${nextAction.trim()} at ${new Date(nextAt).toLocaleString()}`);
                setOutcome(""); setNextAction(""); setNextAt("");
                toast.success("Outcome logged — one next action, one deadline");
              }}>
              Save outcome
            </Button>
          </Section>

          {/* tour gate + visit room + booking ladder */}
          <div className="grid gap-3 lg:grid-cols-3">
            <Section title="Tour readiness gate" icon={CheckCircle2}>
              <div className="space-y-1">
                {TOUR_GATE.map((g) => {
                  const done = exec?.tourGate?.[g] ?? false;
                  return (
                    <button key={g} type="button"
                      onClick={() => store.patch(row.id, { tourGate: { ...(exec?.tourGate ?? {}), [g]: !done } })}
                      className="flex w-full items-center gap-2 rounded px-1 py-0.5 text-left text-[11px] hover:bg-muted">
                      {done ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> : <Circle className="h-3.5 w-3.5 text-muted-foreground" />}
                      {g}
                    </button>
                  );
                })}
                <Button size="sm" className="mt-1 w-full" disabled={TOUR_GATE.some((g) => !exec?.tourGate?.[g])}
                  onClick={() => store.patch(row.id, { visitStatus: "UPCOMING" }, "Tour confirmed — commercially ready")}>
                  CONFIRM TOUR
                </Button>
              </div>
            </Section>

            <Section title="Live visit room" icon={Flag}>
              <Chips options={VISIT_STATUSES} value={exec?.visitStatus}
                onPick={(v) => store.patch(row.id, { visitStatus: v }, `Visit status → ${v}`)} />
              <div className="mt-2 rounded border border-amber-500/50 bg-amber-500/10 p-2 text-[10px] text-amber-700 dark:text-amber-400">
                One active visit POC only. Property team message: DO NOT DISCLOSE OR NEGOTIATE PRICE.
              </div>
            </Section>

            <Section title="Booking ladder" icon={ShieldCheck}>
              <Chips options={BOOKING_LADDER} value={exec?.bookingStatus}
                onPick={(v) => store.patch(row.id, { bookingStatus: v }, `Booking → ${v}`)} />
              <div className="mt-2 text-[10px] text-muted-foreground">
                Inventory approval first, then payment / reservation. The commercial snapshot never changes silently.
              </div>
            </Section>
          </div>

          {/* timeline */}
          <Section title="Immutable timeline" icon={Clock}>
            {exec?.timeline?.length ? (
              <ol className="space-y-1 text-[11px]">
                {[...exec.timeline].reverse().map((t, i) => (
                  <li key={`${t.ts}-${i}`} className="flex gap-2">
                    <span className="w-32 shrink-0 text-muted-foreground">{new Date(t.ts).toLocaleString()}</span>
                    <span className="font-medium">{t.actor}</span>
                    <span>{t.text}</span>
                  </li>
                ))}
              </ol>
            ) : <div className="text-xs text-muted-foreground">Nothing recorded yet — the first action starts the story.</div>}
          </Section>

          {/* full evidence story */}
          <LeadStoryPanel
            leadId={row.id}
            name={row.wa_name}
            stepIndex={row.journey_step_index}
            bucketCode={row.conversation_bucket}
            owned={claimed}
            closed={String(row.status || "").toLowerCase() === "closed"}
            lastActivityAt={row.last_operator_action_at || row.latest_whatsapp_observation_at || row.updated_at}
          />

          <Button asChild variant="outline" size="sm" className="mb-6">
            <Link to="/flow-os"><ExternalLink className="mr-1.5 h-3.5 w-3.5" />Open in Lead OS</Link>
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
