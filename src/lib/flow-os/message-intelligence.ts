import type { PipelineStage } from "@/lib/pipeline/stage-config";
import type { WorkBucket } from "./work-concurrency";

export type MessageIntent =
  | "NEW_ENQUIRY"
  | "QUALIFICATION"
  | "OPTIONS_REQUEST"
  | "TOUR_INTENT"
  | "TOUR_LIVE"
  | "POST_TOUR_POSITIVE"
  | "POST_TOUR_BLOCKER"
  | "QUOTE_REQUEST"
  | "PAYMENT_SIGNAL"
  | "FUTURE"
  | "LOST_SIGNAL"
  | "FOLLOW_UP"
  | "UNKNOWN";

export interface MessageIntelligenceInput {
  lastMessage?: string | null;
  direction?: "incoming" | "outgoing" | "unknown" | null;
  unreadVisible?: boolean | null;
  seenState?: "seen" | "unseen" | "unknown" | null;
  savedStage?: PipelineStage | string | null;
  moveInDate?: string | null;
  colorHint?: string | null;
  detectedLabel?: string | null;
}

export interface MessageIntelligenceResult {
  inferredIntent: MessageIntent;
  inferredPipelineHint: PipelineStage | null;
  inferredWorkBucket: WorkBucket;
  primaryMission: string;
  primaryAction: string;
  blockerHint: string | null;
  confidence: number;
  reasons: string[];
  futureDateHint?: string | null;
  isPriorityInterrupt: boolean;
}

const has = (text: string, patterns: RegExp[]) => patterns.some((p) => p.test(text));

const P = {
  lost: [/(not interested|no longer interested|booked elsewhere|already booked|don't need|do not need|cancel)/i],
  payment: [/(paid|payment done|utr|transaction id|token paid|sent.*money|payment link|upi)/i],
  quote: [/(quotation|quote|final price|best price|final rent|offer|discount|negotiate)/i],
  tourLive: [/(reached|outside|at the property|at property|on the way|coming now|nearby|downstairs)/i],
  tour: [/(can i visit|can we visit|visit today|visit tomorrow|schedule.*visit|property visit|come.*see|see the room|tour|6 ?pm|5 ?pm|4 ?pm)/i],
  postPositive: [/(liked|love(d)? it|good property|room is good|interested in this|want this room|ready to book)/i],
  postBlocker: [/(parents|family approval|too expensive|price high|distance|far|food|deposit|need time|thinking|compare|another property)/i],
  options: [/(send.*option|share.*option|photos|photo|video|location|property details|rooms available|availability)/i],
  qualification: [/(budget|office|college|move.?in|joining|single sharing|double sharing|private room|coed|boys|girls|working|student)/i],
  future: [/(next month|next week|after .*days|joining on|move.*on|coming on|from \d{1,2}(st|nd|rd|th)?)/i],
  newEnquiry: [/(hi|hello|looking for|need pg|pg near|room near|accommodation|stay near)/i],
};

const stageRank: Record<string, number> = {
  NEW: 0,
  DOSSIER: 1,
  MATCHED: 2,
  TOUR_SCHEDULED: 3,
  TOUR_CONFIRMED: 4,
  TOUR_IN_PROGRESS: 5,
  POST_VISIT: 6,
  QUOTED: 7,
  NEGOTIATION: 8,
  BOOKED: 9,
  CHECKED_IN: 10,
  LOST: 11,
};

function avoidAbsurdBackwardJump(saved: string | null | undefined, hint: PipelineStage | null) {
  if (!saved || !hint) return hint;
  const a = stageRank[saved];
  const b = stageRank[hint];
  if (a === undefined || b === undefined) return hint;
  if (saved === "CHECKED_IN" || saved === "LOST") return saved as PipelineStage;
  if (b + 2 < a) return saved as PipelineStage;
  return hint;
}

function futureDateHint(text: string): string | null {
  const iso = text.match(/\b(20\d{2})[-\/.](\d{1,2})[-\/.](\d{1,2})\b/);
  if (iso) return `${iso[1]}-${String(iso[2]).padStart(2, "0")}-${String(iso[3]).padStart(2, "0")}`;
  return null;
}

export function inferMessageIntelligence(input: MessageIntelligenceInput): MessageIntelligenceResult {
  const text = (input.lastMessage ?? "").trim();
  const reasons: string[] = [];
  const inbound = input.direction === "incoming" || input.unreadVisible === true || input.seenState === "unseen";
  if (inbound) reasons.push("fresh/inbound WhatsApp evidence");
  if (input.detectedLabel) reasons.push(`WhatsApp label evidence: ${input.detectedLabel}`);
  if (input.colorHint) reasons.push(`row colour evidence: ${input.colorHint}`);

  let inferredIntent: MessageIntent = "UNKNOWN";
  let inferredPipelineHint: PipelineStage | null = null;
  let inferredWorkBucket: WorkBucket = "TODAY";
  let primaryMission = "Understand the customer and set the next action";
  let primaryAction = "Open / Resume";
  let blockerHint: string | null = null;
  let confidence = text ? 45 : 20;

  if (has(text, P.lost)) {
    inferredIntent = "LOST_SIGNAL";
    inferredPipelineHint = "LOST";
    inferredWorkBucket = "TODAY";
    primaryMission = "Confirm the loss reason before closing the lead";
    primaryAction = "Confirm Lost";
    blockerHint = "Customer may have exited";
    confidence = 92;
    reasons.push("last message contains a strong loss signal");
  } else if (has(text, P.payment)) {
    inferredIntent = "PAYMENT_SIGNAL";
    inferredPipelineHint = input.savedStage === "BOOKED" ? "BOOKED" : "NEGOTIATION";
    inferredWorkBucket = "QUOTE_DUE";
    primaryMission = "Verify payment evidence and lock the booking";
    primaryAction = "Verify Payment";
    blockerHint = "Payment must be verified; message text is not proof of booking";
    confidence = 94;
    reasons.push("payment/UTR/token language detected");
  } else if (has(text, P.tourLive)) {
    inferredIntent = "TOUR_LIVE";
    inferredPipelineHint = "TOUR_IN_PROGRESS";
    inferredWorkBucket = "TOUR_READY";
    primaryMission = "Protect the live property visit";
    primaryAction = "Open Tour";
    confidence = 91;
    reasons.push("arrival/on-the-way language detected");
  } else if (has(text, P.tour)) {
    inferredIntent = "TOUR_INTENT";
    inferredPipelineHint = "TOUR_SCHEDULED";
    inferredWorkBucket = "TOUR_READY";
    primaryMission = "Convert visit intent into an exact property + time";
    primaryAction = "Schedule Tour";
    confidence = 90;
    reasons.push("visit/tour intent detected");
  } else if (has(text, P.postPositive)) {
    inferredIntent = "POST_TOUR_POSITIVE";
    inferredPipelineHint = "POST_VISIT";
    inferredWorkBucket = "POST_TOUR";
    primaryMission = "Convert positive property intent into a quotation/booking path";
    primaryAction = "Send Quote";
    confidence = 86;
    reasons.push("positive property/booking language detected");
  } else if (has(text, P.quote)) {
    inferredIntent = "QUOTE_REQUEST";
    inferredPipelineHint = "QUOTED";
    inferredWorkBucket = "QUOTE_DUE";
    primaryMission = "Give the customer one clear commercial offer";
    primaryAction = "Create / Send Quote";
    blockerHint = has(text, P.postBlocker) ? "Price / decision blocker" : null;
    confidence = 86;
    reasons.push("quotation/final-price language detected");
  } else if (has(text, P.postBlocker)) {
    inferredIntent = "POST_TOUR_BLOCKER";
    inferredPipelineHint = "NEGOTIATION";
    inferredWorkBucket = "RECOVERY";
    primaryMission = "Resolve the customer's primary blocker";
    primaryAction = "Resolve Blocker";
    blockerHint = "Decision / price / family / comparison blocker";
    confidence = 78;
    reasons.push("common objection language detected");
  } else if (has(text, P.options)) {
    inferredIntent = "OPTIONS_REQUEST";
    inferredPipelineHint = "MATCHED";
    inferredWorkBucket = "TODAY";
    primaryMission = "Send the two strongest feasible property options";
    primaryAction = "Show Properties";
    confidence = 84;
    reasons.push("property-option/photo/location request detected");
  } else if (has(text, P.future)) {
    inferredIntent = "FUTURE";
    inferredPipelineHint = input.savedStage ? (input.savedStage as PipelineStage) : "DOSSIER";
    inferredWorkBucket = "FUTURE";
    primaryMission = "Park with an exact follow-up date and requirement snapshot";
    primaryAction = "Move to Future";
    confidence = 80;
    reasons.push("future timing language detected");
  } else if (has(text, P.qualification)) {
    inferredIntent = "QUALIFICATION";
    inferredPipelineHint = "DOSSIER";
    inferredWorkBucket = "TODAY";
    primaryMission = "Complete feasibility: location, budget, date and inventory";
    primaryAction = "Qualify";
    confidence = 76;
    reasons.push("requirement/feasibility details detected");
  } else if (has(text, P.newEnquiry)) {
    inferredIntent = "NEW_ENQUIRY";
    inferredPipelineHint = "DOSSIER";
    inferredWorkBucket = "NOW";
    primaryMission = "Contact and qualify the new enquiry";
    primaryAction = "Call / Qualify";
    confidence = 72;
    reasons.push("new enquiry language detected");
  } else if (text) {
    inferredIntent = "FOLLOW_UP";
    inferredPipelineHint = input.savedStage ? (input.savedStage as PipelineStage) : null;
    inferredWorkBucket = inbound ? "NOW" : "TODAY";
    primaryMission = inbound ? "Respond to the latest customer message" : "Continue the current next action";
    primaryAction = inbound ? "Open Reply" : "Resume";
    confidence = inbound ? 62 : 48;
    reasons.push("message changed but no high-confidence commercial pattern matched");
  }

  inferredPipelineHint = avoidAbsurdBackwardJump(input.savedStage, inferredPipelineHint);
  const interrupt = inbound && !["CHECKED_IN", "LOST"].includes(String(input.savedStage ?? ""));
  if (interrupt) {
    inferredWorkBucket = inferredWorkBucket === "FUTURE" ? "NOW" : inferredWorkBucket;
    reasons.push("fresh inbound should interrupt the current owner's queue");
    confidence = Math.min(100, confidence + 5);
  }

  return {
    inferredIntent,
    inferredPipelineHint,
    inferredWorkBucket,
    primaryMission,
    primaryAction,
    blockerHint,
    confidence,
    reasons,
    futureDateHint: futureDateHint(text),
    isPriorityInterrupt: interrupt,
  };
}

export function stageMismatch(savedStage: string | null | undefined, inferred: PipelineStage | null) {
  if (!savedStage || !inferred) return false;
  return savedStage !== inferred;
}
