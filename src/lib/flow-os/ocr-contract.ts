import { normalizePhoneIN } from "@/lib/lead-identity/normalize";
import type { ParsedLeadDraft } from "@/lib/lead-identity/types";

export type OcrConfidence = "high" | "medium" | "low";
export type PreviewDirection = "incoming" | "outgoing" | "unknown";

export interface OcrMessageFragment {
  text: string;
  direction?: PreviewDirection;
  timestampText?: string;
}

/**
 * One immutable observation of one visible WhatsApp list row in one screenshot.
 *
 * Important: a row is evidence, not a lead. Re-uploading the same chat creates
 * another observation so the CRM can learn what changed without duplicating the
 * customer identity.
 */
export interface OcrConversationCandidate {
  screenshotId: string;
  screenshotHash?: string;
  sourceId?: string;
  whatsappAccount?: string;
  capturedAt?: string;

  // Preserve visual position so row coverage can be reconciled 1:1.
  rowIndex?: number;
  rowTopPx?: number;
  rowBottomPx?: number;

  // Identity evidence. Never invent a phone when it is not visible/resolved.
  contactName?: string;
  phoneRaw?: string;
  normalizedIdentityHint?: string;

  // WhatsApp left-list evidence. Preserve raw text even when parsing succeeds.
  lastMessagePreview?: string;
  previewDirection?: PreviewDirection;
  visibleTimestampRaw?: string;
  unreadCount?: number;
  unreadVisible?: boolean;
  pinnedVisible?: boolean;
  mutedVisible?: boolean;

  // Optional richer extraction when the screenshot contains the open chat/body.
  firstVisibleMessage?: string;
  lastVisibleMessage?: string;
  messages?: OcrMessageFragment[];

  // Optional business signals when visible in the screenshot or extracted from
  // a richer chat capture. These remain evidence, not authoritative CRM truth.
  locationText?: string;
  budgetText?: string;
  moveInText?: string;
  roomPreference?: string;
  need?: string;

  confidence: OcrConfidence;
  rawText: string;
  warnings?: string[];
}

export interface OcrScreenshotResult {
  screenshotId: string;
  screenshotHash?: string;
  sourceId?: string;
  whatsappAccount?: string;
  capturedAt: string;
  uploadedAt: string;
  visibleRowCount?: number;
  candidates: OcrConversationCandidate[];
  warnings: string[];
}

export interface CanonicalOcrConversation {
  key: string;
  phoneE164: string;
  contactName: string;
  sourceIds: string[];
  screenshotIds: string[];
  candidates: OcrConversationCandidate[];
  needsHumanReview: boolean;
  possibleIdentityKey?: string;
}

/**
 * Name/context key is a review hint only. It must never silently merge two
 * phone-less people. It lets the review UI show repeated appearances together.
 */
export function possibleIdentityKey(candidate: OcrConversationCandidate) {
  const account = candidate.whatsappAccount?.trim().toLowerCase() || "unknown-account";
  const name = candidate.contactName?.trim().toLowerCase() || "unknown-contact";
  return `${account}:${name}`;
}

/**
 * Same normalized phone = same customer candidate, even if that customer is
 * visible in many screenshots over three days. Candidates without a phone stay
 * separate observations and require identity review; we expose a possible
 * identity key but do not auto-merge them.
 */
export function groupOcrCandidates(
  results: OcrScreenshotResult[],
): CanonicalOcrConversation[] {
  const grouped = new Map<string, CanonicalOcrConversation>();

  for (const result of results) {
    for (let index = 0; index < result.candidates.length; index += 1) {
      const candidate = result.candidates[index];
      const phoneE164 = candidate.phoneRaw ? normalizePhoneIN(candidate.phoneRaw) : "";
      const fallbackKey = [
        "unresolved",
        candidate.whatsappAccount ?? result.whatsappAccount ?? "unknown-account",
        candidate.contactName?.trim().toLowerCase() ?? "unknown-contact",
        candidate.screenshotId,
        String(candidate.rowIndex ?? index),
      ].join(":");
      const key = phoneE164 || fallbackKey;

      const existing = grouped.get(key);
      if (!existing) {
        grouped.set(key, {
          key,
          phoneE164,
          contactName: candidate.contactName?.trim() ?? "",
          sourceIds: candidate.sourceId ? [candidate.sourceId] : result.sourceId ? [result.sourceId] : [],
          screenshotIds: [candidate.screenshotId],
          candidates: [candidate],
          needsHumanReview: !phoneE164 || candidate.confidence !== "high",
          possibleIdentityKey: !phoneE164 ? possibleIdentityKey(candidate) : undefined,
        });
        continue;
      }

      existing.candidates.push(candidate);
      const sourceId = candidate.sourceId ?? result.sourceId;
      if (sourceId && !existing.sourceIds.includes(sourceId)) {
        existing.sourceIds.push(sourceId);
      }
      if (!existing.screenshotIds.includes(candidate.screenshotId)) {
        existing.screenshotIds.push(candidate.screenshotId);
      }
      if (!existing.contactName && candidate.contactName) {
        existing.contactName = candidate.contactName.trim();
      }
      if (candidate.confidence !== "high") existing.needsHumanReview = true;
    }
  }

  return [...grouped.values()];
}

/**
 * Sort observations chronologically without relying on WhatsApp's visible
 * timestamp parser. capturedAt is system-controlled and therefore safer.
 */
export function sortCandidatesByCapture(candidates: OcrConversationCandidate[]) {
  return [...candidates].sort((a, b) => {
    const ta = a.capturedAt ? Date.parse(a.capturedAt) : 0;
    const tb = b.capturedAt ? Date.parse(b.capturedAt) : 0;
    return ta - tb;
  });
}

export type OcrMovementSignal =
  | "FIRST_SEEN"
  | "NO_CHANGE"
  | "PREVIEW_CHANGED"
  | "VISIBLE_TIME_CHANGED"
  | "UNREAD_CHANGED"
  | "MULTIPLE_FIELDS_CHANGED";

/**
 * Conservative movement detector. It describes what the screenshot proves;
 * higher-level logic may later infer customer/operator reply when evidence is
 * strong enough. It never advances the commercial pipeline by itself.
 */
export function compareOcrObservation(
  previous: OcrConversationCandidate | undefined,
  current: OcrConversationCandidate,
): OcrMovementSignal {
  if (!previous) return "FIRST_SEEN";

  const previewChanged =
    (previous.lastMessagePreview ?? previous.lastVisibleMessage ?? "").trim() !==
    (current.lastMessagePreview ?? current.lastVisibleMessage ?? "").trim();
  const timeChanged =
    (previous.visibleTimestampRaw ?? "").trim() !== (current.visibleTimestampRaw ?? "").trim();
  const unreadChanged =
    previous.unreadCount !== current.unreadCount || previous.unreadVisible !== current.unreadVisible;

  const changed = [previewChanged, timeChanged, unreadChanged].filter(Boolean).length;
  if (changed === 0) return "NO_CHANGE";
  if (changed > 1) return "MULTIPLE_FIELDS_CHANGED";
  if (previewChanged) return "PREVIEW_CHANGED";
  if (timeChanged) return "VISIBLE_TIME_CHANGED";
  return "UNREAD_CHANGED";
}

/**
 * Creates the existing ParsedLeadDraft shape so OCR intake can reuse current
 * dedupe/identity code instead of introducing another lead model.
 */
export function toParsedLeadDraft(group: CanonicalOcrConversation): ParsedLeadDraft {
  const sorted = sortCandidatesByCapture(group.candidates);
  const newest = sorted[sorted.length - 1];
  const rawSource = sorted
    .map((candidate) => candidate.rawText)
    .filter(Boolean)
    .join("\n\n--- screenshot observation ---\n\n");

  return {
    name: group.contactName,
    phone: group.phoneE164 || newest?.phoneRaw || "",
    email: "",
    location: newest?.locationText ?? "",
    areas: [],
    fullAddress: "",
    budget: newest?.budgetText ?? "",
    moveIn: newest?.moveInText ?? "",
    type: "",
    room: newest?.roomPreference ?? "",
    need: newest?.need ?? "",
    specialReqs: newest?.lastMessagePreview ?? newest?.lastVisibleMessage ?? "",
    inBLR: null,
    zone: "",
    rawSource,
  };
}

export function reviewReason(group: CanonicalOcrConversation): string | null {
  if (!group.phoneE164) {
    return "Phone number could not be resolved confidently. Preserve the row and resolve by name/context without guessing.";
  }
  if (group.needsHumanReview) return "At least one OCR observation is below high confidence.";
  return null;
}
