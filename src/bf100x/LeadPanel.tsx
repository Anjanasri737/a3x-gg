// One customer, everything in one place: the five answers, the whole journey on
// few screens, labels, property matching, money and the full story.
import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, ArrowLeft, Clock, ExternalLink, ShieldAlert, UserCheck } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { health, fmtMins, whatHappened } from "@/bookingflow/engine";
import { NEXT_ACTIONS } from "@/bookingflow/journey";
import { HANDLERS } from "@/bookingflow/types";
import type { FlowLead } from "@/bookingflow/types";
import { useBookingFlow } from "@/bookingflow/store";
import { SCREENS, currentScreen, screenIndex, screenProgress } from "./screens";
import { ScreenPanel } from "./ScreenPanel";
import { LabelConsole } from "./LabelConsole";
import { PropertyMatch } from "./PropertyMatch";
import { CapturedPanel } from "./CapturedPanel";
import { CloseCommitButton } from "@/components/commitments/CloseCommitButton";

type Tab = "JOURNEY" | "LABELS" | "PROPERTY" | "MONEY" | "STORY";

const TABS: { key: Tab; label: string }[] = [
  { key: "JOURNEY", label: "Journey" },
  { key: "LABELS", label: "Labels" },
  { key: "PROPERTY", label: "Property match" },
  { key: "MONEY", label: "Money" },
  { key: "STORY", label: "Story & proof" },
];

const dueIn = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString().slice(0, 16);
const money = (v?: string) => (v ? `₹${Number(v).toLocaleString("en-IN")}` : "—");

export function LeadPanel({ lead, onBack, onNext }: { lead: FlowLead; onBack: () => void; onNext: () => void }) {
  const { mode, me, setNext, claim, escalate, reassign, setTemp } = useBookingFlow();
  const expert = mode === "EXPERT";
  const [tab, setTab] = useState<Tab>("JOURNEY");
  const [screenId, setScreenId] = useState<string>("");
  const [nextAction, setNextAction] = useState(NEXT_ACTIONS[0]!);
  const [due, setDue] = useState(dueIn(2));
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const f = lead.f ?? {};
  const h = useMemo(() => (mounted ? health(lead) : undefined), [lead, mounted]);
  const nowScreen = currentScreen(f);

  // Land on the screen to work, then respect wherever the operator navigates.
  useEffect(() => setScreenId(currentScreen(lead.f ?? {}).id), [lead.id]);
  const screen = SCREENS.find((s) => s.id === screenId) ?? nowScreen;

  return (
    <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="ghost" onClick={onBack}><ArrowLeft className="mr-1 h-4 w-4" />Back to the board</Button>
        <Button size="sm" variant="outline" onClick={onNext}>Next customer</Button>
        <Button asChild size="sm" variant="ghost" className="ml-auto">
          <Link to="/tower/leads/$id" params={{ id: lead.id }}>Control Tower record<ExternalLink className="ml-1 h-3 w-3" /></Link>
        </Button>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">{lead.name}</h2>
            <p className="text-xs text-muted-foreground">{lead.phone} · {lead.waAccount}</p>
            <ContactActions className="mt-1.5" phone={lead.phone} name={lead.name} />
            <p className="mt-1 max-w-lg text-xs text-muted-foreground">Last message: “{lead.lastMessage}”</p>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {lead.labels.map((l) => <Badge key={l} variant="outline" className="text-[10px]">{l}</Badge>)}
            </div>
          </div>
          {mounted && h && (
            <div className="grid gap-1 text-xs">
              <Row label="Where is it" value={h.complete ? "Checked in" : h.step?.title ?? "—"} />
              <Row label="Who owns it" value={lead.owner ?? "NOBODY"} bad={!lead.owner} />
              <Row label="Waiting on" value={h.waitingOn} />
              <Row label="What next" value={lead.nextAction ?? "NOT SET"} bad={!lead.nextAction} />
              <Row label="By when" value={lead.nextActionAt ? new Date(lead.nextActionAt).toLocaleString() : "NO DEADLINE"} bad={!lead.nextActionAt || h.sla === "LATE"} />
            </div>
          )}
        </div>

        {mounted && h && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <Badge variant="outline" className="text-[10px]">{h.done} of {h.total} steps done</Badge>
            {h.sla === "LATE" && <Badge variant="destructive" className="text-[10px]"><Clock className="mr-1 h-3 w-3" />Late by {fmtMins(h.minutesLate)}</Badge>}
            {h.sla === "DUE" && <Badge className="bg-amber-500 text-[10px] hover:bg-amber-500">Due within the hour</Badge>}
            {h.toTower && <Badge variant="destructive" className="text-[10px]"><ShieldAlert className="mr-1 h-3 w-3" />Control Tower</Badge>}
            {h.signals.map((s) => (
              <Badge key={s} variant="outline" className="border-destructive/40 text-[10px] text-destructive"><AlertTriangle className="mr-1 h-3 w-3" />{s}</Badge>
            ))}
          </div>
        )}

        <div className="mt-3 flex flex-wrap items-end gap-2 border-t pt-3">
          {!lead.owner && (
            <Button size="sm" onClick={() => { claim(lead.id); toast.success(`${lead.name} is yours, ${me}`); }}>
              <UserCheck className="mr-1.5 h-4 w-4" />I own this lead
            </Button>
          )}
          <div>
            <p className="mb-1 text-[10px] uppercase text-muted-foreground">Next step</p>
            <div className="flex flex-wrap gap-1">
              {NEXT_ACTIONS.map((a) => (
                <Button key={a} size="sm" variant={a === nextAction ? "default" : "outline"} className="h-7 px-2 text-[11px]" onClick={() => setNextAction(a)}>{a}</Button>
              ))}
            </div>
          </div>
          <label className="text-xs">
            <span className="text-muted-foreground">By when</span>
            <Input type="datetime-local" className="mt-1 h-8 w-[13rem]" value={due} onChange={(e) => setDue(e.target.value)} />
          </label>
          <Button size="sm" variant="secondary" onClick={() => { setNext(lead.id, nextAction, new Date(due).toISOString()); toast.success("Next step and deadline locked"); }}>Lock it</Button>
          <Button size="sm" variant="outline" onClick={() => { escalate(lead.id, "Operator asked for help"); toast.success("Control Tower notified"); }}>Send to Control Tower</Button>
          {/* The same closing promise as the Closing board, on this customer. */}
          <CloseCommitButton leadId={lead.id} leadName={lead.name} leadPhone={lead.phone} actorName={me} size="sm" />
          {expert && (
            <>
              <select className="h-8 rounded-md border bg-background px-2 text-xs" value={lead.owner ?? ""}
                onChange={(e) => { reassign(lead.id, e.target.value); toast.success(`Handed to ${e.target.value}`); }}>
                <option value="">Reassign to…</option>
                {HANDLERS.map((x) => <option key={x} value={x}>{x}</option>)}
              </select>
              <Button size="sm" variant="outline" className="h-8" onClick={() => setTemp(lead.id, "HOT", "Expert override")}>Mark hot</Button>
              <Button size="sm" variant="outline" className="h-8" onClick={() => setTemp(lead.id, "COLD", "Expert override")}>Mark cold</Button>
            </>
          )}
        </div>
      </Card>

      <div className="flex flex-wrap gap-1.5">
        {TABS.map((t) => (
          <Button key={t.key} size="sm" variant={tab === t.key ? "default" : "outline"} className="h-7 px-2 text-[11px]" onClick={() => setTab(t.key)}>{t.label}</Button>
        ))}
      </div>

      {tab === "JOURNEY" && (
        <>
          <Card className="p-3">
            <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
              {SCREENS.length} screens instead of 30 questions — click any screen
            </p>
            <div className="flex flex-wrap gap-1.5">
              {SCREENS.map((s, i) => {
                const p = screenProgress(f, s);
                const done = p.done === p.total;
                const isNow = s.id === nowScreen.id;
                return (
                  <button key={s.id} type="button" onClick={() => setScreenId(s.id)}
                    className={cn("rounded-md border px-2 py-1 text-[11px] transition hover:border-primary",
                      s.id === screen.id && "ring-1 ring-primary",
                      done ? "bg-primary/10 text-primary" : isNow ? "bg-accent font-medium" : "text-muted-foreground")}>
                    {i + 1}. {s.title} · {p.done}/{p.total}
                  </button>
                );
              })}
            </div>
          </Card>
          <ScreenPanel
            lead={lead}
            screen={screen}
            expert={expert}
            canPrev={screenIndex(screen.id) > 0}
            canNext={screenIndex(screen.id) < SCREENS.length - 1}
            onPrev={() => { const i = screenIndex(screen.id); if (i > 0) setScreenId(SCREENS[i - 1]!.id); }}
            onNext={() => { const i = screenIndex(screen.id); if (i < SCREENS.length - 1) setScreenId(SCREENS[i + 1]!.id); }}
          />
        </>
      )}

      {tab === "LABELS" && <LabelConsole lead={lead} />}
      {tab === "PROPERTY" && <PropertyMatch lead={lead} />}

      {tab === "MONEY" && (
        <Card className="p-4 text-xs">
          <p className="text-sm font-medium">Frozen commercials</p>
          <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
            <Row label="Property" value={f["property"] || "—"} />
            <Row label="Room / bed" value={f["lockedRoom"] || f["propertyRoom"] || "—"} />
            <Row label="Rent" value={money(f["rent"])} />
            <Row label="Deposit" value={money(f["deposit"])} />
            <Row label="Maintenance" value={money(f["maintenance"])} />
            <Row label="Booking amount" value={money(f["bookingAmount"])} />
            <Row label="Received" value={money(f["paymentAmount"])} />
            <Row label="Decision" value={f["decision"] || "—"} />
            <Row label="Approval" value={f["approval"] || "—"} bad={Boolean(f["approval"]) && f["approval"] !== "APPROVED"} />
            <Row label="Payment" value={f["payment"] || "—"} bad={f["payment"] === "PENDING"} />
            <Row label="Confirmed move-in" value={f["bookingMoveIn"] || f["moveIn"] || "—"} />
          </div>
          <p className="mt-3 text-muted-foreground">
            Change money on the Journey tab — every correction is logged in the story below it.
          </p>
        </Card>
      )}

      {tab === "STORY" && (
        <div className="space-y-3">
          <Card className="p-4">
            <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">What is already done ({whatHappened(lead).length})</p>
            <div className="flex flex-wrap gap-1">
              {whatHappened(lead).map((t) => <Badge key={t} variant="outline" className="text-[10px]">{t}</Badge>)}
            </div>
          </Card>
          <Card className="p-4">
            <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">The full story ({lead.events.length})</p>
            <ol className="space-y-1.5 text-xs">
              {[...lead.events].reverse().map((e, i) => (
                <li key={i} className="flex flex-wrap gap-1.5 border-b pb-1.5 last:border-0">
                  <span className="text-muted-foreground">{mounted ? new Date(e.at).toLocaleString() : ""}</span>
                  <span className="font-medium">{e.label}</span>
                  {e.detail && <span className="text-muted-foreground">— {e.detail}</span>}
                  <span className="ml-auto text-muted-foreground">{e.actor}</span>
                </li>
              ))}
            </ol>
          </Card>
        </div>
      )}
      </div>

      <CapturedPanel lead={lead} />
    </div>
  );
}

function Row({ label, value, bad }: { label: string; value: string; bad?: boolean }) {
  return (
    <div className="flex gap-2">
      <span className="w-28 shrink-0 text-muted-foreground">{label}</span>
      <span className={bad ? "font-medium text-destructive" : "font-medium"}>{value}</span>
    </div>
  );
}
