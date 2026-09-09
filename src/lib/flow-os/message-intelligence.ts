import type { PipelineStage } from "@/lib/pipeline/stage-config";

export type SeenState = "seen" | "unseen" | "unknown";
export type WorkBucket =
  | "NOW" | "TODAY" | "TOUR_READY" | "POST_TOUR" | "QUOTE_DUE"
  | "RECOVERY" | "FUTURE" | "WAITING_CUSTOMER" | "WAITING_SUPPLY"
  | "WAITING_OWNER" | "LOST";

export interface VisualCue {
  seenState: SeenState;
  colorHex?: string;
  colorName?: string;
  rawLabel?: string;
  handlerHint?: string;
}

export interface ColorLabelRule {
  color?: string;
  rawLabel?: string;
  semanticLabel: string;
  suggestedBucket?: WorkBucket;
  suggestedStage?: PipelineStage;
  priorityBoost?: number;
}

export interface MessageInference {
  suggestedIntent: string;
  suggestedPipelineStage?: PipelineStage;
  suggestedWorkBucket: WorkBucket;
  suggestedNextAction: string;
  confidence: number;
  reasons: string[];
  extractedFutureDateText?: string;
  semanticLabel?: string;
  handlerHint?: string;
}

const has = (text: string, patterns: RegExp[]) => patterns.some((p) => p.test(text));

export function semanticLabelForCue(cue: VisualCue, rules: ColorLabelRule[]): string | undefined {
  const color = (cue.colorHex ?? cue.colorName ?? "").toLowerCase();
  const label = (cue.rawLabel ?? "").toLowerCase();
  const match = rules.find((rule) => {
    const rc = (rule.color ?? "").toLowerCase();
    const rl = (rule.rawLabel ?? "").toLowerCase();
    const colorMatch = !rc || rc === color;
    const labelMatch = !rl || rl === label;
    return colorMatch && labelMatch && Boolean(rc || rl);
  });
  return match?.semanticLabel;
}

export function inferFromLastMessage(
  rawMessage: string,
  cue: VisualCue = { seenState: "unknown" },
  rules: ColorLabelRule[] = [],
): MessageInference {
  const text = rawMessage.trim().toLowerCase();
  const reasons: string[] = [];
  const semanticLabel = semanticLabelForCue(cue, rules);

  let stage: PipelineStage | undefined;
  let bucket: WorkBucket = cue.seenState === "unseen" ? "NOW" : "TODAY";
  let action = cue.seenState === "unseen" ? "Open latest WhatsApp reply" : "Review latest message";
  let intent = "follow-up";
  let confidence = text ? 0.55 : 0.25;

  const visitPatterns = [/\bvisit\b/, /can i come/, /come today/, /come tomorrow/, /share location/, /send location/, /schedule.*tour/, /see the (pg|room|property)/];
  const reachedPatterns = [/\breached\b/, /i.?m outside/, /i am outside/, /at the property/, /reached (the )?(pg|property|location)/, /waiting outside/];
  const positivePatterns = [/liked it/, /looks good/, /room is good/, /property is good/, /i like/, /shortlist/, /interested in this/];
  const negotiatePatterns = [/price.*high/, /too expensive/, /discount/, /best price/, /reduce/, /final price/, /budget.*less/];
  const payPatterns = [/payment link/, /how to book/, /booking amount/, /token/, /upi/, /pay now/, /send.*qr/, /advance payment/];
  const futurePatterns = [/next month/, /next week/, /after \d+ days?/, /joining on/, /move on/, /coming on/, /will come on/, /will move on/, /in october/, /in september/, /in november/, /in december/];
  const lostPatterns = [/not interested/, /booked elsewhere/, /found another/, /don.?t need/, /plan cancelled/, /not looking anymore/];
  const parentPatterns = [/ask my parents/, /parents? (will|need|said)/, /family approval/, /check with my father/, /check with my mother/];

  if (has(text, reachedPatterns)) {
    stage = "TOUR_IN_PROGRESS";
    bucket = "NOW";
    action = "Open tour and confirm arrival";
    intent = "tour-in-progress";
    confidence = 0.93;
    reasons.push("Last message indicates the customer has reached or is outside the property.");
  } else if (has(text, payPatterns)) {
    stage = "NEGOTIATION";
    bucket = "NOW";
    action = "Open booking/payment and send or verify payment path";
    intent = "booking-intent";
    confidence = 0.91;
    reasons.push("Last message shows payment or booking intent.");
  } else if (has(text, negotiatePatterns)) {
    stage = "NEGOTIATION";
    bucket = "QUOTE_DUE";
    action = "Resolve price objection / update final offer";
    intent = "price-objection";
    confidence = 0.9;
    reasons.push("Last message contains a price or discount objection.");
  } else if (has(text, positivePatterns)) {
    stage = "POST_VISIT";
    bucket = "POST_TOUR";
    action = "Confirm post-tour outcome and send quotation";
    intent = "positive-property-intent";
    confidence = 0.86;
    reasons.push("Last message expresses positive property intent.");
  } else if (has(text, visitPatterns)) {
    stage = "MATCHED";
    bucket = "TOUR_READY";
    action = "Schedule tour";
    intent = "visit-intent";
    confidence = 0.89;
    reasons.push("Last message asks to visit, see the property, or get the location.");
  } else if (has(text, futurePatterns)) {
    bucket = "FUTURE";
    action = "Set future date and dated follow-up";
    intent = "future-move";
    confidence = 0.84;
    reasons.push("Last message indicates a future move or arrival date.");
  } else if (has(text, lostPatterns)) {
    stage = "LOST";
    bucket = "LOST";
    action = "Confirm lost reason before marking Lost";
    intent = "likely-lost";
    confidence = 0.9;
    reasons.push("Last message indicates the customer may no longer be looking.");
  } else if (has(text, parentPatterns)) {
    stage = "NEGOTIATION";
    bucket = "WAITING_OWNER";
    action = "Set parent/decision-maker follow-up";
    intent = "decision-maker-pending";
    confidence = 0.8;
    reasons.push("Last message indicates a decision-maker dependency.");
  } else if (cue.seenState === "unseen") {
    reasons.push("Chat is visually unseen/unread, so it should be reviewed now.");
    confidence = Math.max(confidence, 0.72);
  } else if (text) {
    reasons.push("No strong commercial phrase matched; retain current canonical stage and review the message.");
  } else {
    reasons.push("No message preview was available.");
  }

  if (semanticLabel) {
    const rule = rules.find((r) => r.semanticLabel === semanticLabel);
    reasons.push(`Visual colour/label maps to ${semanticLabel}.`);
    if (!stage && rule?.suggestedStage) stage = rule.suggestedStage;
    if (rule?.suggestedBucket) bucket = rule.suggestedBucket;
    confidence = Math.min(0.98, confidence + (rule?.priorityBoost ?? 0) / 100);
  }

  return {
    suggestedIntent: intent,
    suggestedPipelineStage: stage,
    suggestedWorkBucket: bucket,
    suggestedNextAction: action,
    confidence,
    reasons,
    semanticLabel,
    handlerHint: cue.handlerHint,
  };
}

export function handlerMismatch(observedHandlerHint: string | undefined, crmHandler: string | null | undefined) {
  if (!observedHandlerHint || !crmHandler) return false;
  const clean = (v: string) => v.trim().toLowerCase().replace(/\s+/g, " ");
  return clean(observedHandlerHint) !== clean(crmHandler);
}
