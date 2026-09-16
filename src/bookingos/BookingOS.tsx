import { useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AllMovesBoard } from "@/mymoves/AllMovesBoard";
import { useMyMoves, type Role } from "@/mymoves/store";
import { controlTowerExceptions, redSignals, sla, universalGaps, batchComplete } from "@/mymoves/engine";
import type { Stage } from "@/mymoves/types";
import { StepRail } from "./StepRail";
import { StepDetail } from "./StepDetail";
import { buildSteps, stepNumber, TOTAL_STEPS, EXITS } from "./steps";

export function BookingOS() {
  const { leads, me, setMe, reset } = useMyMoves();
  const [leadId, setLeadId] = useState<string | undefined>(leads[0]?.id);
  const lead = leads.find((l) => l.id === leadId);
  const [openStage, setOpenStage] = useState<Stage | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const paneRef = useRef<HTMLDivElement>(null);

  const steps = useMemo(() => (lead ? buildSteps(lead) : []), [lead]);
  const now = steps.find((s) => s.status === "NOW");
  const selected = steps.find((s) => s.stage === openStage) ?? now ?? steps[0];

  const open = (id: string) => {
    setLeadId(id);
    setOpenStage(null);
    if (window.matchMedia("(max-width: 1023px)").matches) {
      paneRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <div className="mx-auto max-w-[1500px] space-y-4 p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Booking OS — decision engine</h1>
          <p className="text-sm text-muted-foreground">
            Click any journey step to see what is done, what is left, and exactly what must happen next.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {(["OPERATOR", "CLOSER", "MANAGER"] as Role[]).map((r) => (
            <Button key={r} size="sm" variant={me.role === r ? "default" : "outline"} onClick={() => setMe(me.name, r)}>
              {r}
            </Button>
          ))}
          <Button size="sm" variant="ghost" onClick={reset}>Reset demo</Button>
        </div>
      </div>

      {!ready ? (
        <Card className="p-6 text-sm text-muted-foreground">Loading the journey…</Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
          <div className="lg:max-h-[80vh] lg:overflow-y-auto lg:pr-1">
            <AllMovesBoard leads={leads} me={me.name} selectedId={leadId} onOpen={open} />
          </div>

          <div ref={paneRef} className="space-y-4 scroll-mt-4">
            {!lead || !selected ? (
              <Card className="p-6 text-sm text-muted-foreground">Pick a customer to open their journey.</Card>
            ) : (
              <>
                <LeadHeader leadId={lead.id} />
                <div className="grid gap-4 xl:grid-cols-[minmax(0,280px)_minmax(0,1fr)]">
                  <Card className="p-3 xl:max-h-[70vh] xl:overflow-y-auto">
                    <StepRail steps={steps} selected={selected.stage} onSelect={setOpenStage} />
                  </Card>
                  <StepDetail lead={lead} step={selected} now={now} />
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function LeadHeader({ leadId }: { leadId: string }) {
  const lead = useMyMoves((s) => s.leads.find((l) => l.id === leadId))!;
  const t = sla(lead);
  const gaps = universalGaps(lead);
  const signals = redSignals(lead);
  const exceptions = controlTowerExceptions(lead);
  const off = EXITS.includes(lead.stage);

  return (
    <Card className="space-y-2 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-semibold">{lead.name}</h2>
        <span className="text-sm text-muted-foreground">{lead.phone}</span>
        <Badge variant="outline">
          {off ? lead.stage.replace(/_/g, " ") : `STEP ${stepNumber(lead.stage)}/${TOTAL_STEPS} · ${lead.stage.replace(/_/g, " ")}`}
        </Badge>
        {lead.labels.timing && <Badge variant="secondary">{lead.labels.timing.replace(/_/g, " ")}</Badge>}
        <Badge variant={t.overdue ? "destructive" : t.severity === "WARNING" ? "secondary" : "outline"}>{t.label}</Badge>
      </div>
      <div className="grid gap-1 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <p><span className="text-muted-foreground">Owner: </span>{lead.owner ?? "UNOWNED"}</p>
        <p><span className="text-muted-foreground">Channel: </span>{lead.channel} · {lead.waPresence.replace(/_/g, " ")}</p>
        <p><span className="text-muted-foreground">Next action: </span>{lead.nextAction ?? "none set"}</p>
        <p><span className="text-muted-foreground">Blocker: </span>{lead.blocker ?? "none"}</p>
      </div>
      {(gaps.length > 0 || signals.length > 0 || exceptions.length > 0 || !batchComplete(lead)) && (
        <p className="text-xs text-destructive">
          {[
            ...signals.map((s) => s.label),
            ...gaps.map((g) => `${g} missing`),
            ...exceptions,
            ...(batchComplete(lead) ? [] : ["BATCH INCOMPLETE"]),
          ].slice(0, 5).join(" · ")}
        </p>
      )}
    </Card>
  );
}
