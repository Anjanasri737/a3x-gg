// Rules engine: red signals, SLA timers, universal-rule gaps, control tower
// exceptions, the next missing qualification question, and batch completeness.
import type { Lead, Stage } from "./types";
import { REQUIREMENT_FIELDS } from "./types";
import { WORKFLOW, resolveWhen, type Prompt } from "./workflow";

export const TIMERS = {
  NEW_INBOUND: 5, CUSTOMER_WAITING: 10, IMMEDIATE_LEAD: 10, OBJECTION_OPEN: 15,
  TOUR_CONFIRMATION: 15, CUSTOMER_ARRIVED: 5, TOUR_NO_FOLLOWUP: 10, TOUR_NO_QUOTE: 10,
  SCREENSHOT_STALE: 24 * 60,
};

export type Severity = "CRITICAL" | "WARNING" | "OK";

export interface Signal { code: string; label: string; severity: Severity; detail?: string; action?: string }

const minsSince = (iso?: string) => (iso ? (Date.now() - Date.parse(iso)) / 60000 : Infinity);

export function redSignals(l: Lead): Signal[] {
  const s: Signal[] = [];
  const customerNewer = l.lastCustomerMsgAt && (!l.lastTeamMsgAt || Date.parse(l.lastCustomerMsgAt) > Date.parse(l.lastTeamMsgAt));
  const teamNewer = l.lastTeamMsgAt && (!l.lastCustomerMsgAt || Date.parse(l.lastTeamMsgAt) > Date.parse(l.lastCustomerMsgAt));

  if (customerNewer && minsSince(l.lastCustomerMsgAt) > TIMERS.CUSTOMER_WAITING)
    s.push({ code: "CUSTOMER_WAITING", label: `Customer waiting ${Math.round(minsSince(l.lastCustomerMsgAt))}m`, severity: "CRITICAL", action: "WHATSAPP" });
  if (teamNewer && minsSince(l.lastTeamMsgAt) > 120 && !["CHECKED_IN", "SETTLED", "LOST", "INVALID", "FUTURE"].includes(l.stage))
    s.push({ code: "NO_CUSTOMER_RESPONSE", label: "No customer response", severity: "WARNING", action: "CALL" });
  if (l.openQuestion)
    s.push({ code: "UNANSWERED_QUESTION", label: `Unanswered question: ${l.openQuestion}`, severity: "CRITICAL", action: "ANSWER_QUESTION" });
  if (l.openObjection)
    s.push({ code: "OBJECTION_OPEN", label: `${l.openObjection} objection open`, severity: "CRITICAL", action: "RESOLVE_OBJECTION" });
  if (l.engagement.tourDiscussed && !l.engagement.tourScheduled)
    s.push({ code: "TOUR_NOT_CAPTURED", label: "Tour opportunity not captured", severity: "CRITICAL", action: "SCHEDULE_TOUR" });
  if (l.engagement.tourCompleted && !l.nextAction)
    s.push({ code: "POST_TOUR_MISSING", label: "CRITICAL: post-tour follow-up missing", severity: "CRITICAL" });
  if (l.engagement.tourCompleted && !l.engagement.quotationSent && l.tour?.reaction !== "DID_NOT_LIKE")
    s.push({ code: "QUOTE_MISSING", label: "CRITICAL: quotation missing", severity: "CRITICAL", action: "SEND_QUOTE" });
  if (minsSince(l.lastScreenshotAt) > TIMERS.SCREENSHOT_STALE && !["CHECKED_IN", "SETTLED", "LOST", "INVALID"].includes(l.stage))
    s.push({ code: "SCREENSHOT_STALE", label: "Screenshot not received in 24h", severity: "WARNING", action: "UPLOAD_SCREENSHOT" });
  if (l.payments.some((p) => p.proof && !p.verified))
    s.push({ code: "PAYMENT_UNVERIFIED", label: "Payment verification pending", severity: "CRITICAL", action: "VERIFY_PAYMENT" });
  return s;
}

/** Stage 0 — universal rules. Anything listed here means the lead is not under control. */
export function universalGaps(l: Lead): string[] {
  const closed = ["CHECKED_IN", "SETTLED", "LOST", "INVALID"].includes(l.stage);
  const gaps: string[] = [];
  if (!l.name || !l.phone) gaps.push("Customer identity");
  if (!l.waAccount) gaps.push("WhatsApp / account source");
  if (closed) return gaps;
  if (!l.owner) gaps.push("Current owner");
  if (!l.stage) gaps.push("Current stage");
  if (!l.events.length) gaps.push("Last activity");
  if (!l.nextAction) gaps.push("Next action");
  if (!l.nextActionAt) gaps.push("Next-action deadline");
  if (!l.channel) gaps.push("Communication channel");
  if (l.stage !== "CAPTURED" && l.stage !== "UNOWNED" && !l.requirement.intent) gaps.push("Customer intent");
  if (l.engagement.callDone && !l.requirement.moveIn) gaps.push("Move-in date");
  return gaps;
}

export interface Sla { seconds: number; overdue: boolean; label: string; severity: Severity }

export function sla(l: Lead): Sla {
  if (!l.nextActionAt) return { seconds: 0, overdue: false, label: "NO DEADLINE", severity: "CRITICAL" };
  const diff = Math.round((Date.parse(l.nextActionAt) - Date.now()) / 1000);
  const fmt = (t: number) => `${String(Math.floor(Math.abs(t) / 60)).padStart(2, "0")}:${String(Math.abs(t) % 60).padStart(2, "0")}`;
  if (diff < 0) return { seconds: diff, overdue: true, label: `OVERDUE +${fmt(diff)}`, severity: "CRITICAL" };
  return { seconds: diff, overdue: false, label: `${fmt(diff)} LEFT`, severity: diff < 300 ? "WARNING" : "OK" };
}

/** Control tower sees abnormalities only. */
export function controlTowerExceptions(l: Lead): string[] {
  const out: string[] = [];
  const signals = redSignals(l);
  const t = sla(l);
  const closed = ["CHECKED_IN", "SETTLED", "LOST", "INVALID"].includes(l.stage);
  if (closed) return out;
  if (!l.owner) out.push("No owner");
  if (signals.some((s) => s.code === "CUSTOMER_WAITING")) out.push("Customer waiting too long");
  if (l.labels.timing === "IMMEDIATE" && !l.events.some((e) => e.kind !== "CAPTURED")) out.push("Immediate lead untouched");
  if (t.overdue) out.push("Follow-up overdue");
  if (signals.some((s) => s.code === "SCREENSHOT_STALE")) out.push("Screenshot missing");
  if (l.stage === "TOUR_SCHEDULED" && !l.tour?.customerConfirmed) out.push("Tour starting soon without confirmation");
  if (l.stage === "TOUR_LIVE" && l.tour?.startedAt && minsSince(l.tour.startedAt) > 90) out.push("Tour live too long");
  if (l.engagement.tourCompleted && !l.tour?.reaction) out.push("Tour done without feedback");
  if (signals.some((s) => s.code === "QUOTE_MISSING")) out.push("Tour done without quotation");
  if (l.quote?.outcome === "ACCEPTED" && !l.booking) out.push("Quotation accepted but no booking");
  if (l.stage === "APPROVAL_PENDING") out.push("Booking awaiting property approval");
  if (l.stage === "APPROVAL_PENDING" && t.overdue) out.push("Property approval overdue");
  if (l.stage === "TOKEN_PENDING" && t.overdue) out.push("Payment promised but overdue");
  if (l.handoverTo) out.push("Multiple operators contacting customer");
  if (l.booking?.inventoryApproval === "NO") out.push("Room conflict");
  if (l.stage === "CHECKIN_READY" && l.checkin && !l.checkin.roomReady) out.push("Check-in readiness failure");
  return out;
}

/** Stage 7 — ask one missing question at a time; skip anything WhatsApp already gave us. */
export const QUALIFICATION_PROMPTS: Prompt[] = [
  { id: "area", q: "Where are you looking to stay?", kind: "text", placeholder: "Locality" },
  { id: "officeOrCollege", q: "Where is your office / college / main daily destination?", kind: "text" },
  { id: "moveIn", q: "When are you planning to move in?", kind: "date" },
  { id: "roomType", q: "What type of room are you looking for?", kind: "choice", options: ["PRIVATE", "DOUBLE", "TRIPLE", "ANY", "FLAT", "PG"] },
  { id: "budget", q: "What rent range are you comfortable with?", kind: "number" },
  { id: "whoIsStaying", q: "Who will be staying?", kind: "choice", options: ["SELF", "COUPLE", "FRIENDS", "FAMILY", "OTHER"] },
  { id: "duration", q: "How long are you planning to stay?", kind: "choice", options: ["3 MONTHS", "6 MONTHS", "1 YEAR", "LONGER", "UNSURE"] },
  { id: "nonNegotiables", q: "Anything that is non-negotiable for you?", kind: "choice", options: ["FOOD", "PARKING", "KITCHEN", "AC", "ATTACHED BATHROOM", "GYM", "DISTANCE", "GENDER-SPECIFIC", "NONE"] },
  { id: "decisionMaker", q: "Are you deciding yourself or does someone else approve?", kind: "choice", options: ["SELF", "PARENT", "PARTNER", "COMPANY", "OTHER"] },
  { id: "intent", q: "Ready to move once you find the right property, or still exploring?", kind: "choice", options: ["READY_TO_BOOK", "READY_TO_VISIT", "COMPARING", "JUST_EXPLORING"] },
];

export function missingQualification(l: Lead): Prompt[] {
  return QUALIFICATION_PROMPTS.filter((p) => {
    const v = l.requirement[p.id as keyof Lead["requirement"]];
    return Array.isArray(v) ? v.length === 0 : v === undefined || v === "";
  });
}

export function requirementCompletion(l: Lead): number {
  const total = REQUIREMENT_FIELDS.length;
  const done = REQUIREMENT_FIELDS.filter(({ key }) => {
    const v = l.requirement[key];
    return Array.isArray(v) ? v.length > 0 : v !== undefined && v !== "";
  }).length;
  return Math.round((done / total) * 100);
}

/** Timing label from the move-in date, per the decision tree. */
export function timingFromMoveIn(moveIn?: string): Lead["labels"]["timing"] {
  if (!moveIn) return undefined;
  const days = (Date.parse(moveIn) - Date.now()) / 86_400_000;
  if (Number.isNaN(days)) return undefined;
  if (days <= 7) return "IMMEDIATE";
  if (days <= 30) return "THIS_WEEK";
  return "FUTURE";
}

/** A batch is only complete when every lead ends in one of these. */
export function batchComplete(l: Lead): boolean {
  if (["BOOKED", "CHECKED_IN", "SETTLED", "LOST", "INVALID"].includes(l.stage)) return true;
  if (l.stage === "FUTURE") return !!l.followUpAt;
  if (l.handoverTo) return true;
  return !!(l.nextAction && l.nextActionAt);
}

export function stageGroup(stage: Stage) {
  return WORKFLOW[stage].group;
}

export { resolveWhen };
