// Booking OS — the journey as a clickable decision ladder.
// Every step knows: is it done, what proof exists, what is still missing,
// which buttons belong to it, and which step comes next.
import type { Lead, Stage } from "@/mymoves/types";
import { STAGE_ORDER, WORKFLOW, ACTIONS } from "@/mymoves/workflow";

export const EXITS: Stage[] = ["FUTURE", "LOST", "INVALID"];
export const LADDER: Stage[] = STAGE_ORDER.filter((s) => !EXITS.includes(s));
export const TOTAL_STEPS = LADDER.length;

export const GROUP_LABELS: Record<string, string> = {
  capture: "Capture & identity",
  work: "Work the lead",
  tour: "Tour",
  close: "Closing",
  booking: "Booking",
  checkin: "Check-in & stay",
  closed: "Closed",
};

export const stepNumber = (stage: Stage) => LADDER.indexOf(stage) + 1;

export function stepRange(group: string) {
  const idx = LADDER.map((s, i) => ({ s, i })).filter(({ s }) => WORKFLOW[s].group === group).map(({ i }) => i + 1);
  return idx.length ? `${idx[0]}–${idx[idx.length - 1]}` : "—";
}

export type StepStatus = "DONE" | "NOW" | "LOCKED" | "SKIPPED";

/** Every required-field label in WORKFLOW mapped to a real check on the lead. */
const CHECKS: Record<string, (l: Lead) => boolean> = {
  identity: (l) => Boolean(l.name && l.phone),
  "whatsapp source": (l) => Boolean(l.waAccount),
  "duplicate decision": (l) => (l.duplicateOf?.length ?? 0) === 0,
  phone: (l) => Boolean(l.phone),
  name: (l) => Boolean(l.name),
  "manual verification": (l) => !l.identityNote,
  "whatsapp presence": (l) => Boolean(l.waPresence),
  owner: (l) => Boolean(l.owner),
  "next action": (l) => Boolean(l.nextAction),
  deadline: (l) => Boolean(l.nextActionAt),
  area: (l) => Boolean(l.requirement.area),
  "move-in": (l) => Boolean(l.requirement.moveIn),
  "room type": (l) => Boolean(l.requirement.roomType),
  budget: (l) => Boolean(l.requirement.budget),
  intent: (l) => Boolean(l.requirement.intent),
  feasibility: (l) => Boolean(l.feasibility),
  "matched property": (l) => l.matches.length > 0,
  "customer response": (l) => Boolean(l.engagement.propertyShared),
  "call outcome": (l) => Boolean(l.engagement.callDone),
  "tour readiness": (l) => Boolean(l.selectedPropertyId),
  "property informed": (l) => Boolean(l.tour?.propertyInformed),
  "property acknowledged": (l) => Boolean(l.tour?.propertyAcknowledged),
  "customer confirmation": (l) => Boolean(l.tour?.customerConfirmed ?? l.booking?.customerConfirmed),
  arrival: (l) => Boolean(l.tour?.metRepresentative ?? l.tour?.eta),
  "met representative": (l) => Boolean(l.tour?.metRepresentative),
  "tour outcome": (l) => Boolean(l.tour?.completedAt),
  "tour feedback": (l) => Boolean(l.tour?.reaction),
  blocker: (l) => Boolean(l.tour?.blocker ?? l.blocker),
  quotation: (l) => Boolean(l.quote?.sentAt),
  "quote outcome": (l) => Boolean(l.quote?.outcome),
  "expected price or decision date": (l) => Boolean(l.followUpAt ?? l.nextActionAt),
  "booking decision": (l) => Boolean(l.booking?.id),
  "property approval": (l) => l.booking?.inventoryApproval === "YES",
  "inventory approval": (l) => l.booking?.inventoryApproval === "YES",
  "commercial approval": (l) => l.booking?.commercialApproval === "YES",
  "booking amount": (l) => Boolean(l.booking?.bookingAmount),
  "verified booking amount": (l) =>
    l.payments.filter((p) => p.verified).reduce((s, p) => s + p.amount, 0) >= (l.booking?.bookingAmount ?? 0),
  "final room lock": (l) => Boolean(l.booking?.finalRoomLock),
  "room ready": (l) => Boolean(l.checkin?.roomReady),
  keys: (l) => Boolean(l.checkin?.keys),
  balance: (l) => Boolean(l.checkin?.balanceKnown),
  "decision date": (l) => Boolean(l.futureDecisionAt),
  "follow-up date": (l) => Boolean(l.followUpAt),
  reason: (l) => Boolean(l.lostReason ?? l.blocker),
};

export interface StepView {
  stage: Stage;
  n: number;
  group: string;
  status: StepStatus;
  headline: string;
  sub?: string;
  /** requiredFields with their live satisfaction. */
  checklist: { label: string; done: boolean }[];
  /** what already happened on this step, from the append-only history. */
  proof: { at: string; actor: string; label: string }[];
  actions: { primary: string[]; secondary: string[] };
  nextStage?: Stage;
  slaSeconds: number;
}

/** All actions that belong to a step — used to attach history to that step. */
function stepActionIds(stage: Stage) {
  const cfg = WORKFLOW[stage];
  return [...cfg.primary, ...cfg.secondary].filter((id) => ACTIONS[id]);
}

export function buildSteps(lead: Lead): StepView[] {
  const exited = EXITS.includes(lead.stage);
  const currentIndex = exited ? LADDER.length : LADDER.indexOf(lead.stage);

  return LADDER.map((stage, i) => {
    const cfg = WORKFLOW[stage];
    const ids = stepActionIds(stage);
    const proof = lead.events
      .filter((e) => ids.includes(e.kind))
      .map((e) => ({ at: e.at, actor: e.actor, label: e.label }));
    const status: StepStatus =
      i < currentIndex ? (proof.length > 0 ? "DONE" : "SKIPPED") : i === currentIndex ? "NOW" : "LOCKED";
    const checklist = cfg.requiredFields.map((label) => ({
      label,
      done: status === "DONE" ? true : (CHECKS[label]?.(lead) ?? status !== "NOW"),
    }));
    return {
      stage,
      n: i + 1,
      group: cfg.group,
      status,
      headline: cfg.headline(lead),
      sub: cfg.sub?.(lead),
      checklist,
      proof,
      actions: { primary: cfg.primary, secondary: cfg.secondary },
      nextStage: LADDER[i + 1],
      slaSeconds: cfg.slaSeconds,
    };
  });
}

export function currentStep(lead: Lead): StepView | undefined {
  return buildSteps(lead).find((s) => s.status === "NOW");
}
