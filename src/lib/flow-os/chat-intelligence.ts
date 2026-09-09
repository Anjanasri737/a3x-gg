export type SeenState = "seen" | "unseen" | "unknown";

export type SuggestedCommercialStage =
  | "NEW"
  | "DOSSIER"
  | "MATCHED"
  | "TOUR_SCHEDULED"
  | "TOUR_CONFIRMED"
  | "TOUR_IN_PROGRESS"
  | "POST_VISIT"
  | "QUOTED"
  | "NEGOTIATION"
  | "BOOKED"
  | "CHECKED_IN"
  | "FUTURE"
  | "UNKNOWN";

export interface StageSuggestion {
  suggestedStage: SuggestedCommercialStage;
  suggestedMission: string;
  confidence: number; // 0..1
  evidence: string[];
  futureDateText?: string;
  shouldInterrupt: boolean;
}

export interface ChatVisualSignal {
  seenState: SeenState;
  unreadCount: number;
  rowColour?: string;
  labelColour?: string;
  labelName?: string;
  mappedLabel?: string;
}

export interface LabelColourRule {
  colourKey: string;
  label: string;
  suggestedStage?: SuggestedCommercialStage;
  suggestedMission?: string;
}

/**
 * Conservative defaults only. The database mapping is authoritative and can be
 * changed by Admin/Control Tower. Unknown colours must remain unknown.
 */
export const DEFAULT_LABEL_RULES: LabelColourRule[] = [
  { colourKey: "green", label: "New inbound / unseen", suggestedStage: "NEW", suggestedMission: "Call / reply now" },
  { colourKey: "blue", label: "Tour", suggestedStage: "TOUR_SCHEDULED", suggestedMission: "Confirm or execute tour" },
  { colourKey: "yellow", label: "Follow-up", suggestedStage: "DOSSIER", suggestedMission: "Complete next action" },
  { colourKey: "purple", label: "Booking", suggestedStage: "NEGOTIATION", suggestedMission: "Close booking" },
  { colourKey: "grey", label: "Future", suggestedStage: "FUTURE", suggestedMission: "Wait until dated follow-up" },
];

export function normalizeColourKey(value?: string | null) {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, "-");
}

export function resolveLabelRule(
  colour?: string | null,
  rules: LabelColourRule[] = DEFAULT_LABEL_RULES,
): LabelColourRule | null {
  const key = normalizeColourKey(colour);
  if (!key) return null;
  return rules.find((r) => normalizeColourKey(r.colourKey) === key) ?? null;
}

const DATE_PATTERNS = [
  /\b(today|tonight|tomorrow|day after tomorrow)\b/i,
  /\b(?:on\s+)?(\d{1,2}(?:st|nd|rd|th)?\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*)\b/i,
  /\b(?:on\s+)?((?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+\d{1,2}(?:st|nd|rd|th)?)\b/i,
  /\b(\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?)\b/,
  /\b(next\s+(?:week|month|monday|tuesday|wednesday|thursday|friday|saturday|sunday))\b/i,
];

function findDateText(message: string) {
  for (const pattern of DATE_PATTERNS) {
    const match = message.match(pattern);
    if (match) return match[1] ?? match[0];
  }
  return undefined;
}

function containsAny(text: string, patterns: RegExp[]) {
  return patterns.some((p) => p.test(text));
}

/**
 * This classifier suggests work. It NEVER proves a commercial stage.
 * Trusted CRM commands/events remain the only source that may advance stage.
 */
export function classifyLastMessage(message?: string | null): StageSuggestion {
  const raw = (message ?? "").trim();
  if (!raw) {
    return {
      suggestedStage: "UNKNOWN",
      suggestedMission: "Review customer context",
      confidence: 0,
      evidence: ["No last message available"],
      shouldInterrupt: false,
    };
  }

  const text = raw.toLowerCase();
  const evidence: string[] = [];
  const futureDateText = findDateText(raw);

  const reached = containsAny(text, [
    /\b(outside|reached|arrived|at the property|at pg|downstairs|near gate|at gate)\b/i,
  ]);
  if (reached) {
    evidence.push(`Arrival/tour-progress language: “${raw.slice(0, 120)}”`);
    return { suggestedStage: "TOUR_IN_PROGRESS", suggestedMission: "Support / complete tour now", confidence: 0.9, evidence, shouldInterrupt: true };
  }

  const payment = containsAny(text, [
    /\b(payment link|pay now|token|upi|qr|booking amount|advance payment|send link|how to pay)\b/i,
  ]);
  if (payment) {
    evidence.push(`Payment/booking language: “${raw.slice(0, 120)}”`);
    return { suggestedStage: "NEGOTIATION", suggestedMission: "Record booking intent / send payment path", confidence: 0.88, evidence, shouldInterrupt: true };
  }

  const moveInReady = containsAny(text, [
    /\b(moving today|moving tomorrow|check.?in|key|keys|luggage|shift today|shift tomorrow)\b/i,
  ]);
  if (moveInReady) {
    evidence.push(`Move-in/check-in language: “${raw.slice(0, 120)}”`);
    return { suggestedStage: "BOOKED", suggestedMission: "Verify check-in readiness", confidence: 0.82, evidence, futureDateText, shouldInterrupt: true };
  }

  const quote = containsAny(text, [
    /\b(final price|best price|discount|final rent|deal|quotation|quote|how much final|can you reduce|last price)\b/i,
    /\b(liked|i like|looks good|good property|want this|take this)\b/i,
  ]);
  if (quote) {
    evidence.push(`Post-tour / price-decision language: “${raw.slice(0, 120)}”`);
    return { suggestedStage: "POST_VISIT", suggestedMission: "Resolve blocker and send quotation", confidence: 0.8, evidence, shouldInterrupt: true };
  }

  const tour = containsAny(text, [
    /\b(can i visit|can we visit|visit today|visit tomorrow|schedule.*visit|come today|coming today|coming tomorrow|see the property|see pg|tour|visit time|location please)\b/i,
  ]);
  if (tour) {
    evidence.push(`Visit-intent language: “${raw.slice(0, 120)}”`);
    return { suggestedStage: "MATCHED", suggestedMission: "Schedule exact-property tour", confidence: 0.9, evidence, futureDateText, shouldInterrupt: true };
  }

  const options = containsAny(text, [
    /\b(share options|send options|share photos|send photos|share video|send video|any rooms|available rooms|which pg|show me|property options)\b/i,
  ]);
  if (options) {
    evidence.push(`Property-option request: “${raw.slice(0, 120)}”`);
    return { suggestedStage: "DOSSIER", suggestedMission: "Match and send the two strongest properties", confidence: 0.82, evidence, shouldInterrupt: true };
  }

  const qualify = containsAny(text, [
    /\b(price|rent|budget|deposit|maintenance|food|sharing|single room|double sharing|triple sharing|office|college|location|area|move.?in)\b/i,
  ]);
  if (qualify) {
    evidence.push(`Requirement/qualification language: “${raw.slice(0, 120)}”`);
    return { suggestedStage: "DOSSIER", suggestedMission: "Complete feasibility / qualification", confidence: 0.74, evidence, futureDateText, shouldInterrupt: true };
  }

  if (futureDateText && containsAny(text, [/\b(next|later|after|joining|move|coming|shift|oct|nov|dec|jan|feb|mar|apr|may|jun|jul|aug|sep)\b/i])) {
    evidence.push(`Future-date language: ${futureDateText}`);
    return { suggestedStage: "FUTURE", suggestedMission: "Confirm future date and set dated follow-up", confidence: 0.72, evidence, futureDateText, shouldInterrupt: false };
  }

  if (containsAny(text, [/\b(hi|hello|hey|interested|need pg|looking for pg|looking for room|room required)\b/i])) {
    evidence.push(`New-enquiry language: “${raw.slice(0, 120)}”`);
    return { suggestedStage: "NEW", suggestedMission: "Call / acknowledge and qualify", confidence: 0.68, evidence, shouldInterrupt: true };
  }

  evidence.push(`No strong commercial pattern; review message: “${raw.slice(0, 120)}”`);
  return { suggestedStage: "UNKNOWN", suggestedMission: "Review and choose next action", confidence: 0.35, evidence, futureDateText, shouldInterrupt: false };
}

export function deriveSeenState(input: { unreadCount?: number; explicit?: SeenState; rowColour?: string }): SeenState {
  if (input.explicit && input.explicit !== "unknown") return input.explicit;
  if ((input.unreadCount ?? 0) > 0) return "unseen";
  const colour = normalizeColourKey(input.rowColour);
  // Green is commonly used in the user's current WhatsApp workflow, but colour
  // is not treated as authoritative. It only helps when unread metadata agrees.
  if (colour === "green" && (input.unreadCount ?? 0) > 0) return "unseen";
  return "unknown";
}

export function movementSummary(previous?: { lastMessage?: string | null; unreadCount?: number; seenState?: SeenState }, current?: { lastMessage?: string | null; unreadCount?: number; seenState?: SeenState }) {
  if (!current) return "NO_CURRENT_OBSERVATION";
  if (!previous) return "FIRST_SEEN";
  const changes: string[] = [];
  if ((previous.lastMessage ?? "").trim() !== (current.lastMessage ?? "").trim()) changes.push("MESSAGE_CHANGED");
  if ((previous.unreadCount ?? 0) !== (current.unreadCount ?? 0)) changes.push("UNREAD_CHANGED");
  if ((previous.seenState ?? "unknown") !== (current.seenState ?? "unknown")) changes.push("SEEN_STATE_CHANGED");
  return changes.length === 0 ? "NO_CHANGE" : changes.join("+");
}
