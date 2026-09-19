import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, CheckCircle2, ClipboardCopy, Clock3, Flag, Goal,
  Building2, MessageCircle, Phone, PhoneCall, PhoneOff, ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useMovementSync } from "@/movement/bridge";
import { seedMovement } from "@/movement/seed";
import { useMovement } from "@/movement/store";
import { DraftChip, JourneyTimeline, WorkPanel } from "@/movement/components";
import { totals } from "@/movement/metrics";
import { NEXT_ACTION_LABEL, OPERATORS, type CallResult, type NextActionKind } from "@/movement/types";
import { toast } from "sonner";
import { CARE_PLAYBOOKS, GOAL_TITLE, ROUND_COPY, type CareGoal, type CareRole, type CareRound } from "./playbooks";
import { actualForGoal, callStats, queueForGoal, resultStatus } from "./results";
import { optionById, propertyOptions, propertyProgress, rankedForCustomer } from "./properties";
import { todaysCommitment, useMovementCare } from "./store";
import { debriefMessage } from "./debrief";

const GOAL_TONE: Record<CareGoal, string> = {
  FIND: "border-info/40 bg-info/10 text-info",
  SCHEDULE: "border-warning/40 bg-warning/10 text-warning",
  COMPLETE: "border-success/40 bg-success/10 text-success",
  CLOSE: "border-primary/40 bg-primary/10 text-primary",
};

const GOAL_NEXT: Record<CareGoal, NextActionKind> = {
  FIND: "call",
  SCHEDULE: "confirm-tour",
  COMPLETE: "post-tour-call",
  CLOSE: "collect-payment",
};

function dueForGoal(goal: CareGoal) {
  const minutes = goal === "CLOSE" ? 60 : goal === "COMPLETE" ? 90 : goal === "SCHEDULE" ? 120 : 180;
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

export function MovementCare() {
  useEffect(() => { seedMovement(); }, []);
  const { list, nameOf, me } = useMovementSync();
  const events = useMovement((state) => state.events);
  const setActor = useMovement((state) => state.setActor);
  const mv = useMovement();
  const storedCommitment = useMovementCare((state) => state.commitment);
  const commitment = todaysCommitment(storedCommitment);
  const reports = useMovementCare((state) => state.reports);
  const commit = useMovementCare((state) => state.commit);
  const report = useMovementCare((state) => state.report);
  const clearCommitment = useMovementCare((state) => state.clearCommitment);
  const saveDebrief = useMovementCare((state) => state.saveDebrief);
  const markDebriefSent = useMovementCare((state) => state.markDebriefSent);
  const debriefs = useMovementCare((state) => state.debriefs);
  const [role, setRole] = useState<CareRole>(commitment?.role ?? "flow-ops");
  const [goal, setGoal] = useState<CareGoal>(commitment?.goal ?? "FIND");
  const [commitCount, setCommitCount] = useState(commitment?.commitCount ?? CARE_PLAYBOOKS[role].stages[0].dayCount);
  const [support, setSupport] = useState(commitment?.supportNeeded ?? "");
  const [selected, setSelected] = useState<string | null>(null);
  const [round, setRound] = useState<CareRound>("BUILD");
  const [moved, setMoved] = useState("");
  const [stuck, setStuck] = useState("");
  const [need, setNeed] = useState("");
  const [showPlaybook, setShowPlaybook] = useState(false);
  const [aimProperties, setAimProperties] = useState<string[]>([]);
  const [propertyQuery, setPropertyQuery] = useState("");
  const [debriefFor, setDebriefFor] = useState<{ ulid: string; code: string } | null>(null);

  const activeRole = commitment?.role ?? role;
  const activeGoal = commitment?.goal ?? goal;
  const playbook = CARE_PLAYBOOKS[activeRole];
  const stage = playbook.stages.find((item) => item.goal === activeGoal) ?? playbook.stages[0];
  const queue = useMemo(() => queueForGoal(activeGoal, list), [activeGoal, list]);
  const actual = useMemo(() => actualForGoal(activeGoal, list, events), [activeGoal, list, events]);
  const total = useMemo(() => totals(list, events), [list, events]);
  const calls = useMemo(() => callStats(events), [events]);
  const aimed = commitment?.closingPropertyIds ?? aimProperties;
  const aimProgress = useMemo(() => propertyProgress(aimed, list), [aimed, list]);
  const progress = commitment ? Math.min(100, Math.round((actual / Math.max(commitment.commitCount, 1)) * 100)) : 0;
  const selectedState = selected ? list.find((item) => item.ulid === selected) : undefined;
  const selectedResult = selectedState ? resultStatus(selectedState) : null;
  const today = new Date().toISOString().slice(0, 10);
  const todaysReports = reports.filter((item) => item.date === today);
  const weakRounds = todaysReports.filter((item) => item.actual < item.committed * 0.65).length;
  const todaysDebriefs = debriefs.filter((item) => item.date === today);

  useEffect(() => {
    const roleOperator = activeRole === "tcm" ? OPERATORS.find((operator) => operator.role === "tcm") : undefined;
    setActor(roleOperator ?? { id: me.id, name: me.name, role: "flow-ops", zone: "KORA CORE" });
  }, [activeRole, me.id, me.name, setActor]);

  useEffect(() => {
    if (!selected && queue.length) setSelected(queue[0].ulid);
  }, [queue, selected]);

  const chooseRole = (nextRole: CareRole) => {
    setRole(nextRole);
    const first = CARE_PLAYBOOKS[nextRole].stages[0];
    setGoal(first.goal);
    setCommitCount(first.dayCount);
  };

  const chooseGoal = (nextGoal: CareGoal) => {
    setGoal(nextGoal);
    const nextStage = CARE_PLAYBOOKS[role].stages.find((item) => item.goal === nextGoal);
    if (nextStage) setCommitCount(nextStage.dayCount);
  };

  const startDay = () => {
    commit({ role, goal, commitCount: Math.max(1, commitCount), supportNeeded: support.trim(), closingPropertyIds: aimProperties });
    toast.success(`${goal} result committed for today`);
  };

  const acceptDraft = () => {
    if (!commitment || !selectedState) return;
    const code = selectedState.waDraft ?? (activeGoal === "CLOSE" ? "D1" : activeGoal === "SCHEDULE" ? "D2" : "D3");
    mv.draft(selectedState.ulid, code);
    mv.attemptClaim(selectedState.ulid, activeGoal === "SCHEDULE" || activeGoal === "COMPLETE" ? "tour" : activeGoal === "CLOSE" ? "closing" : "work", stage.outcome);
    mv.setNextAction(selectedState.ulid, {
      kind: GOAL_NEXT[activeGoal],
      dueAt: dueForGoal(activeGoal),
      ownerId: selectedState.primaryOwnerId || mv.actor.id,
      ownerName: selectedState.primaryOwnerId ? selectedState.primaryOwnerName : mv.actor.name,
      note: `${activeGoal}: ${stage.outcome}`,
    });
    setDebriefFor({ ulid: selectedState.ulid, code });
    toast.success(`${code} done — write the wrap-up and send it on WhatsApp`);
  };

  const finishDebrief = (input: { done: string; wentWell: string; wentBadly: string; problems: string }) => {
    if (!commitment || !selectedState || !debriefFor) return;
    const message = debriefMessage({
      ...input,
      customerName: nameOf.get(selectedState.ulid)?.name ?? selectedState.ulid,
      draftCode: debriefFor.code,
      goal: activeGoal,
      operatorName: mv.actor.name,
      resultNow: actual,
      commitCount: commitment.commitCount,
      property: selectedState.tourProperty ?? undefined,
      nextStep: selectedState.nextAction ? NEXT_ACTION_LABEL[selectedState.nextAction.kind] : undefined,
      dueAt: selectedState.nextAction?.dueAt,
    });
    const saved = saveDebrief({
      ulid: selectedState.ulid,
      customerName: nameOf.get(selectedState.ulid)?.name ?? selectedState.ulid,
      draftCode: debriefFor.code,
      goal: activeGoal,
      message,
      ...input,
    });
    mv.log(selectedState.ulid, "note", `${debriefFor.code} wrap-up · done: ${input.done || "—"} · well: ${input.wentWell || "—"} · badly: ${input.wentBadly || "—"} · problem: ${input.problems || "none"}`);
    return saved;
  };

  const copyMessage = async (id: string, message: string) => {
    try {
      await navigator.clipboard.writeText(message);
      markDebriefSent(id);
      toast.success("Copied — paste it in the team WhatsApp group");
    } catch {
      toast.error("Could not copy. Select the text and copy it manually.");
    }
  };

  const dial = () => {
    if (!selectedState) return;
    mv.startCall(selectedState.ulid);
    toast.info("Call started — log the outcome when it ends");
  };

  const endCall = (result: CallResult) => {
    if (!selectedState) return;
    mv.logCall(selectedState.ulid, result);
    if (result !== "connected" && result !== "wrong-number") {
      mv.setNextAction(selectedState.ulid, {
        kind: "call",
        dueAt: new Date(Date.now() + 45 * 60_000).toISOString(),
        ownerId: selectedState.primaryOwnerId || mv.actor.id,
        ownerName: selectedState.primaryOwnerName || mv.actor.name,
        note: `Retry call — ${result}`,
      });
    }
    toast.success(result === "connected" ? "Connected call logged" : `Call logged as ${result}`);
  };

  const aimProperty = (propertyId: string) => {
    if (!selectedState) return;
    const option = optionById(propertyId);
    if (!option) return;
    mv.patch(selectedState.ulid, { tourProperty: option.name });
    mv.log(selectedState.ulid, "note", `Property to close: ${option.name} · ${option.area} · from ₹${option.fromPrice.toLocaleString("en-IN")}`);
    mv.setNextAction(selectedState.ulid, {
      kind: "send-property",
      dueAt: dueForGoal(activeGoal),
      ownerId: selectedState.primaryOwnerId || mv.actor.id,
      ownerName: selectedState.primaryOwnerName || mv.actor.name,
      note: `Send ${option.name} and lock the tour`,
    });
    toast.success(`${option.name} locked as the property to close`);
  };

  const saveReport = () => {
    if (!commitment) return;
    report({
      round,
      role: commitment.role,
      goal: commitment.goal,
      actual,
      committed: commitment.commitCount,
      moved: moved.trim(),
      stuck: stuck.trim(),
      need: need.trim(),
    });
    mv.snapshot({
      label: round === "BUILD" ? "1PM" : round === "MOVE" ? "5PM" : "EOD",
      operatorId: mv.actor.id,
      totals: total as unknown as Record<string, number>,
      required: { [commitment.goal.toLowerCase()]: commitment.commitCount },
      status: actual >= commitment.commitCount ? "ON TRACK" : "BEHIND",
      mainLeak: stuck.trim() || "No blocker reported",
      inference: `${commitment.goal} ${actual}/${commitment.commitCount} · ${moved.trim() || "movement pending"}`,
    });
    setMoved("");
    setStuck("");
    setNeed("");
    toast.success(`${ROUND_COPY[round].label} progress reported`);
  };

  return (
    <div className="flex h-[calc(100vh-4rem)] min-h-[560px] flex-col overflow-hidden bg-background">
      <header className="shrink-0 border-b bg-card px-3 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/15 text-primary"><Goal className="h-4 w-4" /></div>
          <div className="min-w-0">
            <h1 className="text-sm font-semibold">Movement CARE</h1>
            <p className="text-[10px] text-muted-foreground">Draft Vision signal → accountable movement → accepted result</p>
          </div>
          <div className="ml-auto flex items-center gap-1 rounded-md border p-0.5">
            {(["flow-ops", "tcm"] as CareRole[]).map((item) => (
              <Button key={item} size="sm" variant={activeRole === item ? "default" : "ghost"} className="h-7 px-2 text-[10px]"
                disabled={Boolean(commitment)} onClick={() => chooseRole(item)}>
                {CARE_PLAYBOOKS[item].label}
              </Button>
            ))}
          </div>
          <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => setShowPlaybook((value) => !value)}>
            <ShieldCheck className="h-3 w-3" /> Playbook
          </Button>
        </div>

        {commitment && (
          <div className="mt-2 grid grid-cols-[minmax(180px,1fr)_repeat(6,minmax(70px,auto))] gap-1.5 overflow-x-auto">
            <div className="min-w-[180px] rounded-md border bg-background px-2 py-1.5">
              <div className="flex items-center justify-between gap-2 text-[10px] font-semibold">
                <span>MY RESULT · {activeGoal}</span><span>{actual}/{commitment.commitCount}</span>
              </div>
              <Progress value={progress} className="mt-1 h-1.5" />
            </div>
            <Stat label="Calls" value={calls.dialled} />
            <Stat label="Connected" value={calls.connected} />
            <Stat label="Connect %" value={calls.rate} />
            <Stat label="Drafted" value={total.drafted} />
            <Stat label="Good leads" value={total.goodLeads} />
            <Stat label="Tours set" value={total.toursScheduled} />
            <Stat label="Tours done" value={total.toursDone} />
            <Stat label="Bookings" value={total.booked} />
            <Stat label="Wrap-ups sent" value={todaysDebriefs.filter((item) => item.sentOnWhatsapp).length} />
            <Stat label="At risk" value={total.breached + total.p0} danger={total.breached + total.p0 > 0} />
          </div>
        )}
      </header>

      {!commitment ? (
        <CommitmentGate role={role} goal={goal} commitCount={commitCount} support={support}
          aimProperties={aimProperties} onAimProperties={setAimProperties}
          query={propertyQuery} onQuery={setPropertyQuery}
          onRole={chooseRole} onGoal={chooseGoal} onCommitCount={setCommitCount} onSupport={setSupport} onStart={startDay} />
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[320px_minmax(420px,1fr)_330px]">
          <section className="min-h-0 overflow-hidden border-r bg-card">
            <div className="border-b px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-[10px] font-semibold uppercase text-muted-foreground">Result queue</p>
                  <p className="text-xs font-medium">{stage.meaning} · {queue.length} open</p>
                </div>
                <Badge className={cn("border text-[9px]", GOAL_TONE[activeGoal])}>{activeGoal}</Badge>
              </div>
            </div>
            <div className="h-[calc(100%-53px)] divide-y overflow-y-auto">
              {queue.map((item, index) => {
                const info = nameOf.get(item.ulid);
                const status = resultStatus(item.state);
                return (
                  <Button key={item.ulid} variant="ghost" onClick={() => setSelected(item.ulid)}
                    className={cn("h-auto w-full justify-start rounded-none px-3 py-2 text-left", selected === item.ulid && "bg-primary/10")}>
                    <span className="w-5 shrink-0 font-mono text-[10px] text-muted-foreground">{index + 1}</span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate text-xs font-semibold">{info?.name ?? item.ulid}</span>
                        <DraftChip code={item.state.crmDraft} />
                      </span>
                      <span className="block truncate text-[10px] font-normal text-muted-foreground">
                        {item.state.waAccount} · {item.reason}
                      </span>
                      <span className={cn("block truncate text-[10px] font-medium", status.accountable ? "text-success" : "text-destructive")}>
                        {status.result}{status.missing.length ? ` · missing ${status.missing.join(", ")}` : " · accountable"}
                      </span>
                    </span>
                    <Badge variant={item.bucket === "P0" ? "destructive" : "outline"} className="text-[9px]">{item.bucket}</Badge>
                  </Button>
                );
              })}
            </div>
          </section>

          <main className="min-h-0 overflow-y-auto p-2">
            {selectedState && selectedResult ? (
              <div className="space-y-2">
                <div className="border bg-card p-3">
                  <div className="flex flex-wrap items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-semibold uppercase text-muted-foreground">Result contract</p>
                      <h2 className="truncate text-base font-semibold">{nameOf.get(selectedState.ulid)?.name ?? selectedState.ulid}</h2>
                      <p className="text-xs text-muted-foreground">{selectedState.lastCustomerMsg ?? "Latest WhatsApp message is waiting to be captured."}</p>
                    </div>
                    <Button size="sm" onClick={acceptDraft}><CheckCircle2 className="h-3.5 w-3.5" /> Draft done · write wrap-up</Button>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                    <ContractCell label="Expected result" value={stage.outcome} />
                    <ContractCell label="Accountable owner" value={selectedState.primaryOwnerName || mv.actor.name} good={Boolean(selectedState.primaryOwnerId)} />
                    <ContractCell label="Deadline" value={selectedState.nextAction ? new Date(selectedState.nextAction.dueAt).toLocaleString() : "Set when draft is accepted"} good={Boolean(selectedState.nextAction)} />
                    <ContractCell label="Proof required" value={stage.proof} />
                    <ContractCell label="Receiver" value={stage.receiver} />
                    <ContractCell label="Acceptance" value={selectedResult.accepted ? "Accepted" : "Not accepted yet"} good={selectedResult.accepted} />
                  </div>
                  {selectedResult.missing.length > 0 && (
                    <div className="mt-2 flex items-center gap-1.5 border-l-2 border-destructive bg-destructive/10 px-2 py-1.5 text-[11px] text-destructive">
                      <AlertTriangle className="h-3.5 w-3.5" /> Not under control: add {selectedResult.missing.join(", ")}.
                    </div>
                  )}
                  <div className="mt-2 border-t pt-2">
                    <p className="text-[10px] font-semibold uppercase text-muted-foreground">How this result is produced</p>
                    <ol className="mt-1 grid gap-0.5 sm:grid-cols-2">
                      {stage.steps.map((step, index) => (
                        <li key={step} className="flex gap-1.5 text-[11px] leading-snug">
                          <span className="font-mono text-[10px] text-muted-foreground">{index + 1}.</span>{step}
                        </li>
                      ))}
                    </ol>
                    <p className="mt-1 text-[10px] text-destructive">Does not count: {stage.doesNotCount}</p>
                  </div>
                </div>
                <div className="border bg-card p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <PhoneCall className="h-3.5 w-3.5 text-primary" />
                    <p className="text-[10px] font-semibold uppercase text-muted-foreground">Connected call — the result only counts when the customer talks</p>
                    <span className="ml-auto text-[10px] text-muted-foreground">Today {calls.connected} connected of {calls.dialled} dialled · {calls.rate}%</span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <Button size="sm" onClick={dial}><Phone className="h-3.5 w-3.5" /> Start call {selectedState.phone ? `· ${selectedState.phone}` : ""}</Button>
                    <Button size="sm" variant="outline" className="border-success/50 text-success" onClick={() => endCall("connected")}><CheckCircle2 className="h-3.5 w-3.5" /> Connected</Button>
                    {(["no-answer", "busy", "rejected", "wrong-number"] as CallResult[]).map((result) => (
                      <Button key={result} size="sm" variant="outline" onClick={() => endCall(result)}>
                        <PhoneOff className="h-3.5 w-3.5" /> {result.replace("-", " ")}
                      </Button>
                    ))}
                  </div>
                  <p className="mt-1.5 text-[10px] text-muted-foreground">
                    Work state: {selectedState.work} · last outbound {selectedState.lastOutboundAt ? new Date(selectedState.lastOutboundAt).toLocaleTimeString() : "none today"}
                  </p>
                </div>

                <div className="border bg-card p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Building2 className="h-3.5 w-3.5 text-primary" />
                    <p className="text-[10px] font-semibold uppercase text-muted-foreground">Property I am aiming to close for this customer</p>
                    <span className="ml-auto text-[10px] font-medium">{selectedState.tourProperty ?? "No property locked yet"}</span>
                  </div>
                  <div className="mt-2 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                    {rankedForCustomer(selectedState, aimed).slice(0, 6).map((option) => (
                      <Button key={option.id} variant="outline" onClick={() => aimProperty(option.id)}
                        className={cn("h-auto justify-start whitespace-normal p-2 text-left", selectedState.tourProperty === option.name && "border-primary bg-primary/10")}>
                        <span>
                          <span className="block text-[11px] font-semibold">{option.name}</span>
                          <span className="block text-[10px] font-normal text-muted-foreground">
                            {option.area} · {option.bedsFree} beds free · from ₹{option.fromPrice.toLocaleString("en-IN")}
                          </span>
                          {aimed.includes(option.id) && <span className="mt-0.5 block text-[9px] font-semibold text-primary">On today’s closing list</span>}
                        </span>
                      </Button>
                    ))}
                  </div>
                </div>

                {debriefFor?.ulid === selectedState.ulid && (
                  <DebriefCard code={debriefFor.code} customer={nameOf.get(selectedState.ulid)?.name ?? selectedState.ulid}
                    onSave={finishDebrief} onCopy={copyMessage} onClose={() => setDebriefFor(null)} />
                )}

                <WorkPanel ulid={selected} meta={nameOf} />
              </div>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Choose a customer to own a result.</div>
            )}
          </main>

          <aside className="min-h-0 overflow-y-auto border-l bg-card p-2">
            <ProgressReporter round={round} onRound={setRound} actual={actual} committed={commitment.commitCount}
              moved={moved} stuck={stuck} need={need} onMoved={setMoved} onStuck={setStuck} onNeed={setNeed} onSave={saveReport} />

            {weakRounds >= 2 && (
              <div className="mt-2 border border-destructive/40 bg-destructive/10 p-2 text-xs">
                <p className="font-semibold text-destructive">Manager support required now</p>
                <p className="mt-0.5 text-muted-foreground">Two rounds are weak. Remove or re-route one blocker before continuing.</p>
              </div>
            )}

            <div className="mt-2 border p-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] font-semibold uppercase text-muted-foreground">Today’s promise</p>
                <Button size="sm" variant="ghost" className="h-6 px-1.5 text-[9px]" onClick={clearCommitment}>Reset</Button>
              </div>
              <p className="mt-1 text-xs font-semibold">I will deliver {commitment.commitCount} {stage.unit} today.</p>
              <p className="mt-1 text-[10px] text-muted-foreground">{stage.outcome}</p>
              {commitment.supportNeeded && <p className="mt-1 text-[10px]"><strong>Support:</strong> {commitment.supportNeeded}</p>}
            </div>

            <div className="mt-2 border p-2">
              <div className="flex items-center gap-1.5"><Building2 className="h-3.5 w-3.5 text-primary" /><p className="text-[10px] font-semibold uppercase text-muted-foreground">Properties I am closing today</p></div>
              {aimProgress.length === 0 ? (
                <p className="mt-1 text-[10px] text-muted-foreground">No property picked for today. Choose one on any customer to start the closing list.</p>
              ) : (
                <div className="mt-1.5 space-y-1.5">
                  {aimProgress.map((row) => (
                    <div key={row.id} className="border px-2 py-1.5">
                      <p className="text-[11px] font-semibold">{row.name}</p>
                      <p className="text-[9px] text-muted-foreground">{row.area} · {row.bedsFree} beds free</p>
                      <p className="mt-0.5 text-[10px]">Aimed {row.aimed} · tours {row.toursSet} · done {row.toursDone} · booked <strong className={cn(row.booked > 0 && "text-success")}>{row.booked}</strong></p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-2 border p-2">
              <div className="flex items-center gap-1.5"><MessageCircle className="h-3.5 w-3.5 text-primary" /><p className="text-[10px] font-semibold uppercase text-muted-foreground">Wrap-ups sent today</p></div>
              {todaysDebriefs.length === 0 ? (
                <p className="mt-1 text-[10px] text-muted-foreground">After each draft, write the wrap-up and paste it in the team group.</p>
              ) : (
                <div className="mt-1.5 space-y-1.5">
                  {todaysDebriefs.slice(0, 6).map((item) => (
                    <div key={item.id} className="border px-2 py-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-[11px] font-semibold">{item.draftCode} · {item.customerName}</p>
                        <Button size="sm" variant="ghost" className="h-6 px-1 text-[9px]" onClick={() => copyMessage(item.id, item.message)}>
                          <ClipboardCopy className="h-3 w-3" /> Copy
                        </Button>
                      </div>
                      <p className="text-[9px] text-muted-foreground">{item.sentOnWhatsapp ? "Copied for WhatsApp" : "Not sent yet"} · {new Date(item.createdAt).toLocaleTimeString()}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-2"><JourneyTimeline ulid={selected} /></div>
          </aside>
        </div>
      )}

      {showPlaybook && <PlaybookDrawer playbook={playbook} onClose={() => setShowPlaybook(false)} />}
    </div>
  );
}

function CommitmentGate({ role, goal, commitCount, support, aimProperties, onAimProperties, query, onQuery, onRole, onGoal, onCommitCount, onSupport, onStart }: {
  role: CareRole; goal: CareGoal; commitCount: number; support: string;
  aimProperties: string[]; onAimProperties: (ids: string[]) => void;
  query: string; onQuery: (value: string) => void;
  onRole: (role: CareRole) => void; onGoal: (goal: CareGoal) => void;
  onCommitCount: (value: number) => void; onSupport: (support: string) => void; onStart: () => void;
}) {
  const toggleProperty = (id: string) =>
    onAimProperties(aimProperties.includes(id) ? aimProperties.filter((item) => item !== id) : [...aimProperties, id]);
  const shown = propertyOptions.filter((option) =>
    `${option.name} ${option.area}`.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 12);
  const playbook = CARE_PLAYBOOKS[role];
  const active = playbook.stages.find((item) => item.goal === goal) ?? playbook.stages[0];
  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-3">
      <div className="mx-auto max-w-5xl border bg-card">
        <div className="border-b px-4 py-3">
          <div className="flex items-center gap-2"><Flag className="h-4 w-4 text-primary" /><h2 className="text-base font-semibold">Set today’s expected result before drafting</h2></div>
          <p className="mt-1 text-xs text-muted-foreground">“This is my expectation from today. This is what I will achieve.” Calls and messages are work; the selected result is the commitment.</p>
        </div>
        <div className="grid gap-4 p-4 lg:grid-cols-[1fr_280px]">
          <div className="space-y-4">
            <div>
              <p className="mb-2 text-[10px] font-semibold uppercase text-muted-foreground">I am working today as</p>
              <div className="flex gap-2">
                {(["flow-ops", "tcm"] as CareRole[]).map((item) => (
                  <Button key={item} variant={role === item ? "default" : "outline"} onClick={() => onRole(item)}>{CARE_PLAYBOOKS[item].label}</Button>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-2 text-[10px] font-semibold uppercase text-muted-foreground">The result I will aim for</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {playbook.stages.map((item) => (
                  <Button key={item.goal} variant="outline" onClick={() => onGoal(item.goal)}
                    className={cn("h-auto min-h-20 justify-start whitespace-normal p-3 text-left", goal === item.goal && GOAL_TONE[item.goal])}>
                    <span>
                      <span className="block text-xs font-bold">{GOAL_TITLE[item.goal]}</span>
                      <span className="mt-1 block text-[10px] font-normal">{item.outcome}</span>
                      <span className="mt-1 block text-[10px] font-semibold">Usual day: {item.dayCount} {item.unit}</span>
                    </span>
                  </Button>
                ))}
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-[200px_1fr]">
              <label className="text-xs font-medium">How many {active.unit} today<Input type="number" min={1} value={commitCount} onChange={(event) => onCommitCount(Number(event.target.value) || 1)} className="mt-1" /></label>
              <label className="text-xs font-medium">Support needed today<Input value={support} onChange={(event) => onSupport(event.target.value)} placeholder="Inventory check, manager help, pricing approval…" className="mt-1" /></label>
            </div>
            <div>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <p className="text-[10px] font-semibold uppercase text-muted-foreground">Properties I am aiming to close</p>
                <span className="text-[10px] text-muted-foreground">{aimProperties.length} selected</span>
                <Input value={query} onChange={(event) => onQuery(event.target.value)} placeholder="Search property or area" className="ml-auto h-8 w-48 text-xs" />
              </div>
              <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                {shown.map((option) => (
                  <Button key={option.id} variant="outline" onClick={() => toggleProperty(option.id)}
                    className={cn("h-auto justify-start whitespace-normal p-2 text-left", aimProperties.includes(option.id) && "border-primary bg-primary/10")}>
                    <span>
                      <span className="block text-[11px] font-semibold">{option.name}</span>
                      <span className="block text-[10px] font-normal text-muted-foreground">{option.area} · {option.bedsFree} beds free · from ₹{option.fromPrice.toLocaleString("en-IN")}</span>
                    </span>
                  </Button>
                ))}
              </div>
            </div>
            <Button onClick={onStart} className="w-full sm:w-auto"><Flag className="h-4 w-4" /> Commit this result and open drafts</Button>
          </div>
          <div className="border bg-muted/30 p-3">
            <p className="text-[10px] font-semibold uppercase text-muted-foreground">Your contract</p>
            <p className="mt-2 text-sm font-semibold">I will deliver {commitCount} {active.unit} today.</p>
            <p className="mt-2 text-xs text-muted-foreground">{active.outcome}</p>
            <ol className="mt-3 space-y-1 text-[11px]">
              {active.steps.map((step, index) => (
                <li key={step} className="flex gap-1.5"><span className="font-mono text-muted-foreground">{index + 1}.</span>{step}</li>
              ))}
            </ol>
            <dl className="mt-3 space-y-2 text-xs">
              <div><dt className="text-muted-foreground">Proof</dt><dd>{active.proof}</dd></div>
              <div><dt className="text-muted-foreground">Does not count</dt><dd className="text-destructive">{active.doesNotCount}</dd></div>
              <div><dt className="text-muted-foreground">Accepted by</dt><dd>{active.receiver}</dd></div>
              <div><dt className="text-muted-foreground">Required when</dt><dd>{active.requireWhen}</dd></div>
              <div><dt className="text-muted-foreground">Closing these properties</dt><dd>{aimProperties.length ? aimProperties.map((id) => propertyOptions.find((option) => option.id === id)?.name).join(", ") : "Not chosen yet"}</dd></div>
            </dl>
          </div>
        </div>
      </div>
    </div>
  );
}

function ProgressReporter({ round, onRound, actual, committed, moved, stuck, need, onMoved, onStuck, onNeed, onSave }: {
  round: CareRound; onRound: (round: CareRound) => void; actual: number; committed: number;
  moved: string; stuck: string; need: string; onMoved: (value: string) => void;
  onStuck: (value: string) => void; onNeed: (value: string) => void; onSave: () => void;
}) {
  return (
    <div className="border p-2">
      <div className="flex items-center gap-1.5"><Clock3 className="h-3.5 w-3.5 text-primary" /><p className="text-[10px] font-semibold uppercase text-muted-foreground">Periodic progress</p></div>
      <div className="mt-2 grid grid-cols-3 gap-1">
        {(Object.keys(ROUND_COPY) as CareRound[]).map((item) => (
          <Button key={item} size="sm" variant={round === item ? "default" : "outline"} className="h-7 px-1 text-[9px]" onClick={() => onRound(item)}>{ROUND_COPY[item].label}</Button>
        ))}
      </div>
      <p className="mt-2 text-xs font-semibold">{ROUND_COPY[round].question}</p>
      <div className="mt-2 flex items-center justify-between text-[10px]"><span>Counted by the system</span><strong>{actual}/{committed}</strong></div>
      <Progress value={Math.min(100, Math.round((actual / Math.max(committed, 1)) * 100))} className="mt-1" />
      <div className="mt-2 space-y-1.5">
        <Textarea value={moved} onChange={(event) => onMoved(event.target.value)} placeholder="Moved — what result changed?" className="min-h-14 text-xs" />
        <Textarea value={stuck} onChange={(event) => onStuck(event.target.value)} placeholder="Stuck — what is blocking the result?" className="min-h-14 text-xs" />
        <Input value={need} onChange={(event) => onNeed(event.target.value)} placeholder="Need — who should help with what?" className="h-8 text-xs" />
      </div>
      <Button size="sm" className="mt-2 w-full" onClick={onSave}>Report progress</Button>
      <p className="mt-1 text-[9px] text-muted-foreground">{ROUND_COPY[round].accepted}</p>
    </div>
  );
}

function PlaybookDrawer({ playbook, onClose }: { playbook: (typeof CARE_PLAYBOOKS)[CareRole]; onClose: () => void }) {
  return (
    <div className="absolute inset-y-0 right-0 z-40 w-full max-w-md overflow-y-auto border-l bg-card shadow-xl">
      <div className="sticky top-0 flex items-center justify-between border-b bg-card px-4 py-3">
        <div><p className="text-[10px] uppercase text-muted-foreground">CARE V5 playbook</p><h2 className="font-semibold">{playbook.label}</h2></div>
        <Button size="sm" variant="outline" onClick={onClose}>Close</Button>
      </div>
      <div className="space-y-3 p-4">
        <div className="border p-3"><p className="text-[10px] font-semibold uppercase text-muted-foreground">Role promise</p><p className="mt-1 text-sm">{playbook.promise}</p></div>
        {playbook.stages.map((item) => (
          <div key={item.goal} className="border p-3">
            <div className="flex items-center justify-between gap-2">
              <Badge className={cn("border", GOAL_TONE[item.goal])}>{item.goal}</Badge>
              <span className="text-xs font-semibold">A usual day: {item.dayCount} {item.unit}</span>
            </div>
            <p className="mt-2 text-sm font-semibold">{GOAL_TITLE[item.goal]}</p>
            <p className="mt-1 text-xs text-muted-foreground">{item.outcome}</p>
            <p className="mt-2 text-[10px] font-semibold uppercase text-muted-foreground">Step by step</p>
            <ol className="mt-1 space-y-1 text-xs">
              {item.steps.map((step, index) => (
                <li key={step} className="flex gap-1.5"><span className="font-mono text-muted-foreground">{index + 1}.</span>{step}</li>
              ))}
            </ol>
            <div className="mt-2 grid gap-1.5 text-xs">
              <p><strong>It counts when:</strong> {item.proof}</p>
              <p className="text-destructive"><strong>It does not count when:</strong> {item.doesNotCount}</p>
              <p><strong>Handed to:</strong> {item.receiver}</p>
              <p><strong>Choose this day when:</strong> {item.recommendWhen}</p>
              <p><strong>You must choose it when:</strong> {item.requireWhen}</p>
            </div>
          </div>
        ))}
        <div className="border p-3"><p className="text-[10px] font-semibold uppercase text-muted-foreground">Acceptance gate</p><p className="mt-1 text-xs">{playbook.acceptanceGate}</p></div>
        <div className="border p-3"><p className="text-[10px] font-semibold uppercase text-muted-foreground">Non-negotiable safeguards</p>{playbook.safeguards.map((item) => <p key={item} className="mt-2 flex gap-2 text-xs"><ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />{item}</p>)}</div>
      </div>
    </div>
  );
}

function DebriefCard({ code, customer, onSave, onCopy, onClose }: {
  code: string; customer: string;
  onSave: (input: { done: string; wentWell: string; wentBadly: string; problems: string }) => { id: string; message: string } | undefined;
  onCopy: (id: string, message: string) => void;
  onClose: () => void;
}) {
  const [done, setDone] = useState("");
  const [wentWell, setWentWell] = useState("");
  const [wentBadly, setWentBadly] = useState("");
  const [problems, setProblems] = useState("");
  const [saved, setSaved] = useState<{ id: string; message: string } | null>(null);

  const build = () => {
    const result = onSave({ done, wentWell, wentBadly, problems });
    if (result) setSaved({ id: result.id, message: result.message });
  };

  return (
    <div className="border-2 border-primary bg-card p-3">
      <div className="flex flex-wrap items-center gap-2">
        <MessageCircle className="h-4 w-4 text-primary" />
        <p className="text-xs font-semibold">{code} is done for {customer} — wrap it up before you move on</p>
        <Button size="sm" variant="ghost" className="ml-auto h-6 px-2 text-[10px]" onClick={onClose}>Close</Button>
      </div>
      <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
        <label className="text-[10px] font-semibold uppercase text-muted-foreground">What is done?
          <Textarea value={done} onChange={(event) => setDone(event.target.value)} placeholder="Called, qualified, shared 2 properties…" className="mt-1 min-h-14 text-xs" />
        </label>
        <label className="text-[10px] font-semibold uppercase text-muted-foreground">What went well?
          <Textarea value={wentWell} onChange={(event) => setWentWell(event.target.value)} placeholder="Customer picked a date straight away…" className="mt-1 min-h-14 text-xs" />
        </label>
        <label className="text-[10px] font-semibold uppercase text-muted-foreground">What went badly?
          <Textarea value={wentBadly} onChange={(event) => setWentBadly(event.target.value)} placeholder="Budget below our price, went cold on rent…" className="mt-1 min-h-14 text-xs" />
        </label>
        <label className="text-[10px] font-semibold uppercase text-muted-foreground">Any other problem or help needed?
          <Textarea value={problems} onChange={(event) => setProblems(event.target.value)} placeholder="Need inventory truth for Salarpuria, need pricing approval…" className="mt-1 min-h-14 text-xs" />
        </label>
      </div>
      <Button size="sm" className="mt-2" onClick={build}><CheckCircle2 className="h-3.5 w-3.5" /> Make the WhatsApp update</Button>
      {saved && (
        <div className="mt-2 border bg-muted/30 p-2">
          <p className="text-[10px] font-semibold uppercase text-muted-foreground">Copy this and paste it in the team WhatsApp group</p>
          <pre className="mt-1 whitespace-pre-wrap break-words text-[11px] leading-snug">{saved.message}</pre>
          <Button size="sm" className="mt-2" onClick={() => onCopy(saved.id, saved.message)}>
            <ClipboardCopy className="h-3.5 w-3.5" /> Copy for WhatsApp
          </Button>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, danger }: { label: string; value: number; danger?: boolean }) {
  return <div className="min-w-[70px] rounded-md border bg-background px-2 py-1"><p className="text-[9px] text-muted-foreground">{label}</p><p className={cn("text-sm font-semibold", danger && "text-destructive")}>{value}</p></div>;
}

function ContractCell({ label, value, good }: { label: string; value: string; good?: boolean }) {
  return <div className="min-h-14 border px-2 py-1.5"><p className="text-[9px] font-semibold uppercase text-muted-foreground">{label}</p><p className={cn("mt-0.5 text-[11px] leading-snug", good === true && "text-success", good === false && "text-destructive")}>{value}</p></div>;
}