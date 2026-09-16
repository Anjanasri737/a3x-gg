import { useEffect, useState } from "react";
import { GraduationCap, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Capture } from "./Capture";
import { BatchBoard } from "./BatchBoard";
import { Guided } from "./Guided";
import { Expert } from "./Expert";
import { useBookingFlow } from "./store";

type Screen = "CAPTURE" | "BATCH" | "LEAD";

export function BookingFlow() {
  const { mode, setMode, leads, batches, me, round } = useBookingFlow();
  const [screen, setScreen] = useState<Screen>("CAPTURE");
  const [leadId, setLeadId] = useState<string | undefined>();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const lead = leads.find((l) => l.id === leadId);

  function openNextUnmarked() {
    const batch = batches.find((b) => b.handler === me && b.round === round);
    const next = batch?.leadIds.map((id) => leads.find((l) => l.id === id)).find((l) => l && !l.qualifiedAt);
    if (next) { setLeadId(next.id); setScreen("LEAD"); } else { setScreen("BATCH"); }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="mr-auto">
          <h1 className="text-xl font-semibold">Gharpayy Booking Flow</h1>
          <p className="text-xs text-muted-foreground">WhatsApp screenshot → CRM → your 30 for this round → qualified customer with a next step.</p>
        </div>
        <Button size="sm" variant={mode === "GUIDED" ? "default" : "outline"} onClick={() => setMode("GUIDED")}>
          <GraduationCap className="mr-1.5 h-4 w-4" />Understand mode
        </Button>
        <Button size="sm" variant={mode === "EXPERT" ? "default" : "outline"} onClick={() => setMode("EXPERT")}>
          <Zap className="mr-1.5 h-4 w-4" />Expert mode
        </Button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {(["CAPTURE", "BATCH", "LEAD"] as Screen[]).map((s, i) => (
          <Button key={s} size="sm" variant={screen === s ? "secondary" : "ghost"} className="h-7 px-2 text-[11px]"
            onClick={() => (s === "LEAD" ? openNextUnmarked() : setScreen(s))}>
            {i + 1}. {s === "CAPTURE" ? "Bring chats in" : s === "BATCH" ? "My 30 for this round" : "Work a customer"}
          </Button>
        ))}
        {mounted && <Badge variant="outline" className="ml-auto text-[10px]">{mode === "GUIDED" ? "one question at a time" : "everything editable at once"}</Badge>}
      </div>

      {screen === "CAPTURE" && <Capture onDone={() => setScreen("BATCH")} />}
      {screen === "BATCH" && <BatchBoard onOpenLead={(id) => { setLeadId(id); setScreen("LEAD"); }} />}
      {screen === "LEAD" && (lead
        ? mode === "GUIDED"
          ? <Guided lead={lead} onBack={() => setScreen("BATCH")} onNext={openNextUnmarked} />
          : <Expert lead={lead} onBack={() => setScreen("BATCH")} />
        : <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">Pick a customer from your batch first.</div>)}
    </div>
  );
}
