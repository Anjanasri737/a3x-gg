// Red signals, clocks and Control Tower rules. Nothing here writes — it only reads
// a lead and says what is wrong, who is waiting and how late we are.
import type { FlowLead } from "./types";
import { JOURNEY, currentStep, isStepDone, progress } from "./journey";

const MIN = 60_000;
const DAY = 86_400_000;

export type Sla = "OK" | "DUE" | "LATE" | "MISSING";

export interface LeadHealth {
  step: ReturnType<typeof currentStep>;
  stepNo: number;
  total: number;
  done: number;
  waitingOn: string;
  sla: Sla;
  minutesLate: number;
  signals: string[];
  toTower: boolean;
  closed: boolean;
  complete: boolean;
}

export function health(l: FlowLead, nowMs = Date.now()): LeadHealth {
  const f = l.f ?? {};
  const step = currentStep(f);
  const p = progress(f);
  const closed = l.stage === "CLOSED" || Boolean(l.closedReason);
  const complete = !step;
  const signals: string[] = [];

  if (!l.owner) signals.push("No owner");
  if (!l.nextAction) signals.push("No next step");
  if (!l.nextActionAt) signals.push("No deadline");

  let sla: Sla = "OK";
  let minutesLate = 0;
  if (!l.nextActionAt) {
    sla = l.owner ? "MISSING" : "MISSING";
  } else {
    const diff = +new Date(l.nextActionAt) - nowMs;
    minutesLate = Math.round(-diff / MIN);
    sla = diff < 0 ? "LATE" : diff < 60 * MIN ? "DUE" : "OK";
  }
  if (sla === "LATE") signals.push(`Deadline missed by ${fmtMins(minutesLate)}`);

  const stuckDays = Math.floor((nowMs - +new Date(l.lastActivityAt)) / DAY);
  if (stuckDays > 7 && !complete && !closed) signals.push(`No movement for ${stuckDays} days`);

  const evidenceHrs = l.lastEvidenceAt ? Math.floor((nowMs - +new Date(l.lastEvidenceAt)) / 3_600_000) : undefined;
  if (!complete && !closed && evidenceHrs !== undefined && evidenceHrs > 24) signals.push("No fresh screenshot in 24h");

  if (l.f?.["approval"] && l.f["approval"] !== "APPROVED") signals.push("Property rejected the booking");
  if (l.f?.["payment"] === "PENDING") signals.push("Payment pending");

  const waitingOn = closed ? "Nobody" : complete ? "Nobody" : step?.waitingOn ?? "Gharpayy";
  const toTower = Boolean(l.escalated) || (!closed && !complete && (!l.owner || sla === "LATE" || stuckDays > 7));

  return {
    step,
    stepNo: step ? JOURNEY.findIndex((s) => s.key === step.key) + 1 : JOURNEY.length,
    total: p.total,
    done: p.done,
    waitingOn,
    sla,
    minutesLate,
    signals,
    toTower,
    closed,
    complete,
  };
}

export function fmtMins(m: number) {
  if (m < 60) return `${m} min`;
  if (m < 1440) return `${Math.round(m / 60)} h`;
  return `${Math.round(m / 1440)} d`;
}

export function whatHappened(l: FlowLead): string[] {
  const f = l.f ?? {};
  return JOURNEY.filter((s) => isStepDone(f, s)).map((s) => s.title);
}

export function slaTone(sla: Sla) {
  if (sla === "LATE" || sla === "MISSING") return "text-destructive";
  if (sla === "DUE") return "text-amber-600";
  return "text-muted-foreground";
}
