// Final E2E Plus — the master execution journey, the red-signal engine and the
// three label dimensions. Evidence stays evidence; this layer only decides
// where the conversation is, who owns it, what must happen next and by when.
import type { LibraryBucket, LeadOpsRow } from "@/lib/lead-os/library";
import type { SlaVerdict } from "@/lib/lead-os/sla";
import { humanAge } from "@/lib/lead-os/sla";

export interface MasterStage {
  code: string;
  label: string;
  doneWhen: string;
}

/** WhatsApp → … → Confirmed Booking. One ladder for every lead. */
export const MASTER_JOURNEY: MasterStage[] = [
  { code: "WHATSAPP", label: "WhatsApp", doneWhen: "Conversation exists on a Gharpayy WhatsApp account" },
  { code: "CRM_CAPTURE", label: "CRM Capture", doneWhen: "Screenshot / chat captured into CRM as evidence" },
  { code: "ADMISSION", label: "Lead Admission", doneWhen: "Where-is-customer, channel, when and ownership answered" },
  { code: "RECONSTRUCTION", label: "WhatsApp Reconstruction", doneWhen: "What already happened is verified by the owner" },
  { code: "QUALIFICATION", label: "Qualification", doneWhen: "Move-in, location, budget, room type and decision maker known" },
  { code: "EXECUTION", label: "Execution", doneWhen: "Call / WhatsApp done with outcome, stage and next action" },
  { code: "TOUR", label: "Tour", doneWhen: "Visit confirmed with a single active tour POC" },
  { code: "LIVE_CLOSING", label: "Live Closing", doneWhen: "Post-tour feedback captured in the same session" },
  { code: "QUOTATION", label: "Quotation", doneWhen: "Exact offer generated and sent" },
  { code: "BOOKING_REQUEST", label: "Booking Request", doneWhen: "Commercial snapshot frozen with a Booking ID" },
  { code: "PROPERTY_APPROVAL", label: "Property Approval", doneWhen: "Property manager approved the room / inventory" },
  { code: "PAYMENT", label: "Payment / Reservation", doneWhen: "Token reconciled against the approved booking" },
  { code: "CONFIRMED", label: "Confirmed Booking", doneWhen: "Room reserved and customer confirmed" },
];

/** S1..S9 journey index → master stage index. */
const STEP_TO_STAGE: Record<number, number> = {
  1: 1, 2: 4, 3: 5, 4: 5, 5: 6, 6: 7, 7: 8, 8: 9, 9: 12,
};

export function masterStageIndex(row: LeadOpsRow, claimed: boolean): number {
  const stage = String(row.current_pipeline_stage || "").toUpperCase();
  if (stage === "CHECKED_IN") return 12;
  if (stage === "BOOKED") return 11;
  if (stage === "NEGOTIATION" || stage === "QUOTED") return 8;
  const idx = STEP_TO_STAGE[Number(row.journey_step_index || 1)] ?? 1;
  if (idx <= 2 && claimed) return Math.max(idx, 3);
  return idx;
}

/* ---------------------------- label dimensions --------------------------- */

export const URGENCY = ["IMMEDIATE", "THIS WEEK", "FUTURE"] as const;
export const CLOSE_PROBABILITY = ["VERY HIGH", "HIGH", "MEDIUM", "LOW"] as const;
export const SITUATION = [
  "QUALIFYING", "PROPERTY OPTIONS", "CALL REQUIRED", "TOUR READY", "TOUR SCHEDULED",
  "NEGOTIATING", "TOKEN PENDING", "TRY NEARBY", "STUCK", "BOOKED", "LOST",
] as const;

export type Urgency = (typeof URGENCY)[number];
export type CloseProbability = (typeof CLOSE_PROBABILITY)[number];
export type Situation = (typeof SITUATION)[number];

/** Suggested classification when the operator has not set one yet. */
export function suggestLabels(row: LeadOpsRow, bucket: LibraryBucket | null, sla: SlaVerdict) {
  const stage = String(row.current_pipeline_stage || "").toUpperCase();
  const step = Number(row.journey_step_index || 1);

  const urgency: Urgency =
    sla.state === "CRITICAL" || sla.state === "BREACH" ? "IMMEDIATE" : step >= 5 ? "IMMEDIATE" : step >= 3 ? "THIS WEEK" : "FUTURE";

  const probability: CloseProbability =
    step >= 8 ? "VERY HIGH" : step >= 6 ? "HIGH" : step >= 3 ? "MEDIUM" : "LOW";

  let situation: Situation = "QUALIFYING";
  if (stage === "BOOKED" || stage === "CHECKED_IN") situation = "BOOKED";
  else if (stage === "NEGOTIATION" || stage === "QUOTED") situation = "NEGOTIATING";
  else if (step >= 6) situation = "TOUR SCHEDULED";
  else if (step === 5) situation = "TOUR READY";
  else if (String(bucket?.family || "").toLowerCase().includes("property")) situation = "PROPERTY OPTIONS";
  else if (String(bucket?.family || "").toLowerCase().includes("call")) situation = "CALL REQUIRED";
  else if (String(bucket?.bucket || "").includes("SUPPLY_GAP")) situation = "TRY NEARBY";
  else if (sla.state === "CRITICAL") situation = "STUCK";

  return { urgency, probability, situation };
}

/* ---------------------------- red signal engine --------------------------- */

export interface RedSignal {
  code: string;
  label: string;
  detail: string;
  timer: string;
  tone: "danger" | "warn";
}

export function redSignals(input: {
  row: LeadOpsRow;
  bucket: LibraryBucket | null;
  sla: SlaVerdict;
  claimed: boolean;
  heartbeatState: string;
}): RedSignal[] {
  const out: RedSignal[] = [];
  const { row, bucket, sla, claimed } = input;
  const waiting = String(bucket?.waiting_on || "REVIEW").toUpperCase();
  const age = humanAge(sla.ageMin);

  if (waiting === "GHARPAYY") {
    out.push({ code: "CUSTOMER_WAITING", label: "Customer waiting for our reply", detail: "The last move belongs to Gharpayy.", timer: age, tone: "danger" });
  }
  if (waiting === "CUSTOMER") {
    out.push({ code: "CUSTOMER_SILENT", label: "Team message sent — customer silent", detail: "We replied; the customer has not.", timer: age, tone: "warn" });
  }
  if (sla.state === "BREACH" || sla.state === "CRITICAL") {
    out.push({ code: "FOLLOW_UP_OVERDUE", label: "Follow-up overdue", detail: sla.label, timer: humanAge(sla.overdueMin), tone: "danger" });
  }
  if (sla.ageMin > 1440) {
    out.push({ code: "NO_MOVEMENT", label: "No movement", detail: "State unchanged for more than a day.", timer: age, tone: "danger" });
  }
  if (!claimed && !row.current_owner) {
    out.push({ code: "UNOWNED", label: "Nobody owns this lead", detail: "Goes to the Control Tower until claimed.", timer: age, tone: "danger" });
  }
  if (input.heartbeatState === "SCREENSHOT_NOT_RECEIVED") {
    out.push({ code: "NO_SCREENSHOT", label: "No screenshot / conversation update", detail: "State is unknown until fresh evidence arrives.", timer: age, tone: "warn" });
  }
  if (waiting === "OTHER_TEAM") {
    out.push({ code: "HANDOFF_PENDING", label: "Handoff not accepted", detail: "Multiple people may be talking to this customer.", timer: age, tone: "danger" });
  }
  const step = Number(row.journey_step_index || 1);
  if (step === 5) out.push({ code: "TOUR_NOT_SCHEDULED", label: "Tour discussed — not scheduled", detail: "Fix the slot before the interest cools.", timer: age, tone: "warn" });
  if (step === 6) out.push({ code: "TOUR_NO_QUOTE", label: "Tour done — no quote", detail: "Quotation must go out in the same session.", timer: age, tone: "danger" });
  if (step === 7) out.push({ code: "QUOTE_NO_FOLLOWUP", label: "Quote sent — no follow-up", detail: "Close or record the objection.", timer: age, tone: "warn" });
  if (String(bucket?.bucket || "").includes("UNKNOWN")) {
    out.push({ code: "CONTEXT_MISSING", label: "Objection / question unresolved", detail: "Conversation state could not be read safely.", timer: age, tone: "warn" });
  }
  return out;
}

/* ------------------------ WhatsApp reconstruction ------------------------ */

export const RECONSTRUCTION_CHECKS = [
  { code: "contacted", label: "Customer contacted", step: 1 },
  { code: "location", label: "Location captured", step: 2 },
  { code: "movein", label: "Move-in captured", step: 2 },
  { code: "budget", label: "Budget captured", step: 2 },
  { code: "room", label: "Room preference captured", step: 2 },
  { code: "property", label: "Property shared", step: 3 },
  { code: "call", label: "Call completed", step: 4 },
  { code: "tour_discussed", label: "Tour discussed", step: 5 },
  { code: "tour_scheduled", label: "Tour scheduled", step: 6 },
  { code: "quotation", label: "Quotation", step: 7 },
] as const;

/* ------------------------------ tour gate -------------------------------- */

export const TOUR_GATE = [
  "Property selected",
  "Room / bed availability known",
  "Customer requirement matched",
  "Price available",
  "Deposit available",
  "Quotation can be generated",
  "Tour owner selected",
] as const;

export const VISIT_STATUSES = [
  "UPCOMING", "EN ROUTE", "ARRIVED", "TOUR LIVE", "CLOSING NOW",
  "TOKEN PENDING", "ALTERNATIVE REQUIRED", "FOLLOW-UP TODAY", "BOOKED", "LOST",
] as const;

export const BOOKING_LADDER = [
  "APPROVAL PENDING", "APPROVED", "PAYMENT/TOKEN PENDING", "PAYMENT RECEIVED", "RESERVED", "BOOKED",
] as const;

/** Heartbeat state as a plain string, safe for the list view. */
export function screenshotSafe(lastObservationAt?: string | null, closed?: boolean): string {
  if (closed) return "STOPPED";
  if (!lastObservationAt) return "SCREENSHOT_NOT_RECEIVED";
  const age = (Date.now() - Date.parse(lastObservationAt)) / 60000;
  if (!Number.isFinite(age)) return "SCREENSHOT_NOT_RECEIVED";
  if (age >= 1440) return "SCREENSHOT_NOT_RECEIVED";
  if (age >= 1200) return "DUE";
  return "FRESH";
}
