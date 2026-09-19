// The 100x funnel squeezed into 40% of the screen, so WhatsApp can live in the
// other 60%. One screen, nothing to scroll except the questions themselves.
import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, ListChecks, Menu, PhoneCall, ShieldAlert, UserCheck } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { health, fmtMins } from "@/bookingflow/engine";
import { NEXT_ACTIONS } from "@/bookingflow/journey";
import { useBookingFlow } from "@/bookingflow/store";
import { SCREENS, currentScreen, screenIndex, screenProgress } from "./screens";
import { ScreenPanel } from "./ScreenPanel";
import { CapturedPanel } from "./CapturedPanel";
import { LabelConsole } from "./LabelConsole";
import { PropertyMatch } from "./PropertyMatch";
import { ClosingDesk } from "./ClosingDesk";
import { ContactActions } from "@/components/common/ContactActions";
import { CloseCommitButton } from "@/components/commitments/CloseCommitButton";

type Pane = "WORK" | "CAPTURED" | "MATCH" | "LABELS" | "CLOSING" | "QUEUE";

const PANES: { id: Pane; label: string }[] = [
  { id: "WORK", label: "Questions" },
  { id: "CAPTURED", label: "Captured" },
  { id: "MATCH", label: "Property match" },
  { id: "LABELS", label: "Labels" },
  { id: "CLOSING", label: "Closing" },
  { id: "QUEUE", label: "All customers" },
];

const startOfDay = () => new Date(new Date().toDateString()).getTime();

// Everywhere you can jump without leaving the split screen.
const MENU: { to: string; label: string; group: string }[] = [
  { group: "This funnel", to: "/booking-flow", label: "Booking Flow — full screen" },
  { group: "This funnel", to: "/booking-flow-100x", label: "Booking Flow 100x" },
  { group: "This funnel", to: "/closing", label: "Closing desk" },
  { group: "This funnel", to: "/final-moment", label: "Draft Vision (screenshots)" },
  { group: "Lead OS", to: "/flow-os", label: "Flow OS — Lead OS" },
  { group: "Lead OS", to: "/final-e2e-plus", label: "Final E2E Plus" },
  { group: "Lead OS", to: "/mymoves", label: "My Moves" },
  { group: "Lead OS", to: "/booking-os", label: "Booking OS" },
  { group: "Lead OS", to: "/ways", label: "10 Ways" },
  { group: "Lead OS", to: "/conversation-library", label: "Conversation Library" },
  { group: "Everyday CRM", to: "/", label: "Dashboard" },
  { group: "Everyday CRM", to: "/today", label: "Today" },
  { group: "Everyday CRM", to: "/leads", label: "Leads" },
  { group: "Everyday CRM", to: "/tours", label: "Tours" },
  { group: "Everyday CRM", to: "/follow-ups", label: "Follow-ups" },
  { group: "Everyday CRM", to: "/inventory", label: "Inventory" },
  { group: "Everyday CRM", to: "/control-tower-team", label: "Control Tower" },
  { group: "Everyday CRM", to: "/admin", label: "Admin" },
];

export function SplitFlow() {
  const { leads, me, mode, setMode, claim, setNext, escalate } = useBookingFlow();
  const [leadId, setLeadId] = useState<string>("");
  const [screenId, setScreenId] = useState<string>("");
  const [pane, setPane] = useState<Pane>("WORK");
  const [nextAction, setNextAction] = useState(NEXT_ACTIONS[0]!);
  const [due, setDue] = useState(() => new Date(Date.now() + 2 * 3_600_000).toISOString().slice(0, 16));
  const [mounted, setMounted] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => setMounted(true), []);

  // the queue: everyone who still needs a decision, worst first
  const queue = useMemo(() => {
    if (!mounted) return [];
    return leads
      .filter((l) => l.stage !== "CLOSED" && l.f?.["checkinDay"] !== "CHECKED_IN")
      .map((l) => ({ l, h: health(l) }))
      .sort((a, b) => Number(b.h.sla === "LATE") - Number(a.h.sla === "LATE") || b.h.signals.length - a.h.signals.length)
      .map(({ l }) => l);
  }, [leads, mounted]);

  const lead = leads.find((l) => l.id === leadId) ?? queue[0];

  useEffect(() => {
    if (lead) setScreenId(currentScreen(lead.f ?? {}).id);
  }, [lead?.id]);

  const screen = SCREENS.find((s) => s.id === screenId) ?? (lead ? currentScreen(lead.f ?? {}) : SCREENS[0]!);
  const idx = screenIndex(screen.id);
  const h = mounted && lead ? health(lead) : undefined;

  // header result line — what this shift has actually produced
  const stats = useMemo(() => {
    if (!mounted) return { calls: 0, saved: 0, left: 0, tower: 0, late: 0 };
    const from = startOfDay();
    let calls = 0;
    let saved = 0;
    leads.forEach((l) =>
      l.events.forEach((e) => {
        if (+new Date(e.at) < from) return;
        saved += 1;
        if (/call|talk|spoke|phone/i.test(`${e.label} ${e.detail ?? ""}`)) calls += 1;
      }),
    );
    const left = leads.filter((l) => l.stage !== "CLOSED" && (!l.owner || !l.nextAction || !l.nextActionAt)).length;
    const hs = leads.map((l) => health(l));
    return { calls, saved, left, tower: hs.filter((x) => x.toTower).length, late: hs.filter((x) => x.sla === "LATE").length };
  }, [leads, mounted]);

  function step(dir: -1 | 1) {
    const n = idx + dir;
    if (n >= 0 && n < SCREENS.length) setScreenId(SCREENS[n]!.id);
  }

  function nextCustomer() {
    const i = queue.findIndex((l) => l.id === lead?.id);
    const pick = queue[i + 1] ?? queue[0];
    if (pick) setLeadId(pick.id);
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      {/* Result header — never scrolls away */}
      <header className="shrink-0 border-b px-3 py-2">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold">Booking Flow 100x — split screen</h1>
            <p className="truncate text-[10px] text-muted-foreground">Keep WhatsApp on 60%, work this on 40%.</p>
          </div>
          <div className="flex shrink-0 gap-1">
            <Button size="sm" variant={mode === "GUIDED" ? "default" : "outline"} className="h-6 px-2 text-[10px]" onClick={() => setMode("GUIDED")}>Understand</Button>
            <Button size="sm" variant={mode === "EXPERT" ? "default" : "outline"} className="h-6 px-2 text-[10px]" onClick={() => setMode("EXPERT")}>Expert</Button>
            <div className="relative">
              <Button size="sm" variant="outline" className="h-6 px-2 text-[10px]" onClick={() => setMenuOpen((v) => !v)} aria-expanded={menuOpen} aria-label="Open app menu">
                <Menu className="h-3 w-3" />
              </Button>
              {menuOpen && (
                <>
                  <button type="button" aria-label="Close menu" className="fixed inset-0 z-40 cursor-default" onClick={() => setMenuOpen(false)} />
                  <div className="absolute right-0 z-50 mt-1 max-h-[70vh] w-56 overflow-y-auto rounded-md border bg-popover p-1 shadow-md">
                    {(() => {
                      let lastGroup = "";
                      return MENU.map((m) => (
                        <div key={m.to}>
                          {m.group !== lastGroup && ((lastGroup = m.group), (<p className="px-2 pb-0.5 pt-1.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">{m.group}</p>))}
                          <Link to={m.to} onClick={() => setMenuOpen(false)}
                            className="block rounded-sm px-2 py-1 text-[11px] hover:bg-accent hover:text-accent-foreground">
                            {m.label}
                          </Link>
                        </div>
                      ));
                    })()}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
        {mounted && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            <Badge variant="outline" className="text-[10px]"><PhoneCall className="mr-1 h-3 w-3" />{stats.calls} calls done today</Badge>
            <Badge variant="outline" className="text-[10px]"><ListChecks className="mr-1 h-3 w-3" />{stats.saved} answers captured</Badge>
            <Badge variant={stats.left ? "destructive" : "outline"} className="text-[10px]">{stats.left} customers left to fix</Badge>
            {stats.late > 0 && <Badge variant="destructive" className="text-[10px]">{stats.late} late</Badge>}
            {stats.tower > 0 && <Badge variant="destructive" className="text-[10px]"><ShieldAlert className="mr-1 h-3 w-3" />{stats.tower} tower</Badge>}
          </div>
        )}
      </header>

      {/* Customer line + the five answers, compact */}
      {lead && (
        <div className="shrink-0 border-b px-3 py-2">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{lead.name} <span className="text-[11px] font-normal text-muted-foreground">{lead.phone}</span></p>
              <p className="truncate text-[10px] text-muted-foreground">“{lead.lastMessage}”</p>
            </div>
            <div className="flex shrink-0 gap-1">
              <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px]" onClick={nextCustomer}>Next customer<ArrowRight className="ml-1 h-3 w-3" /></Button>
            </div>
          </div>
          {mounted && h && (
            <div className="mt-1 flex flex-wrap gap-1 text-[10px]">
              <Badge variant="outline" className="text-[10px]">{h.stepNo}. {h.complete ? "Checked in" : h.step?.title}</Badge>
              <Badge variant={lead.owner ? "secondary" : "destructive"} className="text-[10px]">{lead.owner ?? "no owner"}</Badge>
              <Badge variant="outline" className="text-[10px]">waiting on {h.waitingOn}</Badge>
              <Badge variant={lead.nextAction ? "outline" : "destructive"} className="text-[10px]">{lead.nextAction ?? "no next step"}</Badge>
              <Badge variant={lead.nextActionAt && h.sla !== "LATE" ? "outline" : "destructive"} className="text-[10px]">
                {lead.nextActionAt ? (h.sla === "LATE" ? `late ${fmtMins(h.minutesLate)}` : new Date(lead.nextActionAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })) : "no deadline"}
              </Badge>
            </div>
          )}
        </div>
      )}

      {/* Screen rail — one row, horizontally scrollable, never wraps the layout */}
      {lead && (
        <div className="shrink-0 overflow-x-auto border-b px-3 py-1.5">
          <div className="flex gap-1">
            {SCREENS.map((s, i) => {
              const p = screenProgress(lead.f ?? {}, s);
              return (
                <button key={s.id} type="button" onClick={() => setScreenId(s.id)}
                  className={cn("shrink-0 rounded-md border px-1.5 py-0.5 text-[10px]",
                    s.id === screen.id ? "border-primary bg-primary/10 text-primary" : p.done === p.total ? "text-primary/70" : "text-muted-foreground")}>
                  {i + 1}. {s.title} {p.done}/{p.total}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* The only scrolling area */}
      <main className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        {!lead ? (
          <p className="pt-10 text-center text-sm text-muted-foreground">Nothing left in the queue — every customer is closed or checked in.</p>
        ) : pane === "WORK" ? (
          <ScreenPanel
            lead={lead}
            screen={screen}
            expert={mode === "EXPERT"}
            canPrev={idx > 0}
            canNext={idx < SCREENS.length - 1}
            onPrev={() => step(-1)}
            onNext={() => step(1)}
          />
        ) : (
          <CapturedPanel lead={lead} />
        )}
      </main>

      {/* Action bar — always on screen */}
      {lead && (
        <footer className="shrink-0 space-y-1.5 border-t px-3 py-2">
          <div className="flex flex-wrap items-center gap-1">
            <Button size="sm" variant="outline" className="h-7 px-2 text-[10px]" disabled={idx === 0} onClick={() => step(-1)}><ArrowLeft className="h-3 w-3" /></Button>
            <Button size="sm" variant="outline" className="h-7 px-2 text-[10px]" disabled={idx >= SCREENS.length - 1} onClick={() => step(1)}><ArrowRight className="h-3 w-3" /></Button>
            {!lead.owner && (
              <Button size="sm" className="h-7 px-2 text-[10px]" onClick={() => { claim(lead.id); toast.success(`${lead.name} is yours, ${me}`); }}>
                <UserCheck className="mr-1 h-3 w-3" />Own it
              </Button>
            )}
            <CloseCommitButton leadId={lead.id} leadName={lead.name} leadPhone={lead.phone} actorName={me} size="xs" />
            <Button size="sm" variant="outline" className="h-7 px-2 text-[10px]" onClick={() => { escalate(lead.id, "Operator asked for help"); toast.success("Control Tower notified"); }}>Tower</Button>
            <Button size="sm" variant={pane === "CAPTURED" ? "default" : "ghost"} className="ml-auto h-7 px-2 text-[10px]" onClick={() => setPane(pane === "WORK" ? "CAPTURED" : "WORK")}>
              {pane === "WORK" ? "Everything captured" : "Back to questions"}
            </Button>
          </div>
          <div className="flex items-center gap-1">
            <select className="h-7 min-w-0 flex-1 rounded-md border bg-background px-1 text-[10px]" value={nextAction} onChange={(e) => setNextAction(e.target.value)}>
              {NEXT_ACTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
            <Input type="datetime-local" className="h-7 w-[9.5rem] shrink-0 text-[10px]" value={due} onChange={(e) => setDue(e.target.value)} />
            <Button size="sm" variant="secondary" className="h-7 shrink-0 px-2 text-[10px]"
              onClick={() => { setNext(lead.id, nextAction, new Date(due).toISOString()); toast.success("Next step and deadline locked"); }}>
              Lock
            </Button>
          </div>
        </footer>
      )}
    </div>
  );
}
