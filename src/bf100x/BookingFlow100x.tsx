// Booking Flow 100x — same buttons, same rules, fewer clicks, and the rest of the
// CRM (labels, closing, property matching) wired into the same customers.
import { useEffect, useState } from "react";
import { GraduationCap, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Capture } from "@/bookingflow/Capture";
import { BatchBoard } from "@/bookingflow/BatchBoard";
import { Board } from "@/bookingflow/Board";
import { useBookingFlow } from "@/bookingflow/store";
import { LeadPanel } from "./LeadPanel";
import { ClosingDesk } from "./ClosingDesk";
import { LabelConsole } from "./LabelConsole";

type Screen = "CAPTURE" | "BATCH" | "BOARD" | "LEAD" | "CLOSING" | "LABELS";

const NAMES: Record<Screen, string> = {
  CAPTURE: "Bring chats in",
  BATCH: "My 30 for this round",
  BOARD: "All customers",
  LEAD: "Work a customer",
  CLOSING: "Closing desk",
  LABELS: "Label console",
};

export function BookingFlow100x() {
  const { mode, setMode, leads, batches, me, round } = useBookingFlow();
  const [screen, setScreen] = useState<Screen>("BOARD");
  const [leadId, setLeadId] = useState<string | undefined>();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const lead = leads.find((l) => l.id === leadId);

  function open(id: string) {
    setLeadId(id);
    setScreen("LEAD");
  }

  function openNextUnmarked() {
    const batch = batches.find((b) => b.handler === me && b.round === round);
    const next = batch?.leadIds
      .map((id) => leads.find((l) => l.id === id))
      .find((l) => l && l.id !== leadId && (!l.nextAction || !l.owner));
    const fallback = leads.find((l) => l.id !== leadId && (!l.owner || !l.nextAction)) ?? leads[0];
    const pick = next ?? fallback;
    if (pick) open(pick.id);
    else setScreen("BOARD");
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="mr-auto">
          <h1 className="text-xl font-semibold">Gharpayy Booking Flow 100x</h1>
          <p className="text-xs text-muted-foreground">
            The same journey in a handful of screens — four or five questions at a time, with labels, closing and property matching on the same customer.
          </p>
        </div>
        <Button size="sm" variant={mode === "GUIDED" ? "default" : "outline"} onClick={() => setMode("GUIDED")}>
          <GraduationCap className="mr-1.5 h-4 w-4" />Understand mode
        </Button>
        <Button size="sm" variant={mode === "EXPERT" ? "default" : "outline"} onClick={() => setMode("EXPERT")}>
          <Zap className="mr-1.5 h-4 w-4" />Expert mode
        </Button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {(Object.keys(NAMES) as Screen[]).map((s, i) => (
          <Button key={s} size="sm" variant={screen === s ? "secondary" : "ghost"} className="h-7 px-2 text-[11px]"
            onClick={() => (s === "LEAD" && !lead ? openNextUnmarked() : setScreen(s))}>
            {i + 1}. {NAMES[s]}
          </Button>
        ))}
        {mounted && (
          <Badge variant="outline" className="ml-auto text-[10px]">
            {mode === "GUIDED" ? "step by step, nothing skipped" : "expert — every screen editable"}
          </Badge>
        )}
      </div>

      {screen === "CAPTURE" && <Capture onDone={() => setScreen("BATCH")} />}
      {screen === "BATCH" && <BatchBoard onOpenLead={open} />}
      {screen === "BOARD" && <Board onOpenLead={open} />}
      {screen === "CLOSING" && <ClosingDesk onOpenLead={open} />}
      {screen === "LABELS" && (lead
        ? <LabelConsole lead={lead} />
        : <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">Open a customer from the board, then label them here.</p>)}
      {screen === "LEAD" && (lead
        ? <LeadPanel lead={lead} onBack={() => setScreen("BOARD")} onNext={openNextUnmarked} />
        : <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">Pick a customer from the board first.</p>)}
    </div>
  );
}
