import { normalizePhoneIN } from "@/lib/lead-identity/normalize";
import type { ParsedLeadDraft } from "@/lib/lead-identity/types";

export type OcrConfidence = "high" | "medium" | "low";

export interface OcrMessageFragment {
  text: string;
  direction?: "incoming" | "outgoing" | "unknown";
  timestampText?: string;
}

/**
 * Provider-agnostic result for one visible WhatsApp chat/contact extracted from
 * one screenshot. The OCR provider itself should live behind an API/server
 * boundary; this contract is what the CRM consumes.
 */
export interface OcrConversationCandidate {
  screenshotId: string;
  sourceId?: string;
  whatsappAccount?: string;
  contactName?: string;
  phoneRaw?: string;
  locationText?: string;
  budgetText?: string;
  moveInText?: string;
  roomPreference?: string;
  need?: string;
  firstVisibleMessage?: string;
  lastVisibleMessage?: string;
  messages?: OcrMessageFragment[];
  confidence: OcrConfidence;
  rawText: string;
}

export interface OcrScreenshotResult {
  screenshotId: string;
  uploadedAt: string;
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
}

/**
 * Same normalized phone = same customer candidate, even if that customer is
 * visible in 10 screenshots. This prevents one screenshot from becoming one
 * lead. Candidates without a phone stay isolated until identity review.
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
        candidate.whatsappAccount ?? "unknown-account",
        candidate.contactName?.trim().toLowerCase() ?? "unknown-contact",
        candidate.screenshotId,
        String(index),
      ].join(":");
      const key = phoneE164 || fallbackKey;

      const existing = grouped.get(key);
      if (!existing) {
        grouped.set(key, {
          key,
          phoneE164,
          contactName: candidate.contactName?.trim() ?? "",
          sourceIds: candidate.sourceId ? [candidate.sourceId] : [],
          screenshotIds: [candidate.screenshotId],
          candidates: [candidate],
          needsHumanReview: !phoneE164 || candidate.confidence !== "high",
        });
        continue;
      }

      existing.candidates.push(candidate);
      if (candidate.sourceId && !existing.sourceIds.includes(candidate.sourceId)) {
        existing.sourceIds.push(candidate.sourceId);
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
 * Creates the existing ParsedLeadDraft shape so OCR intake can reuse current
 * dedupe/identity code instead of introducing another lead model.
 */
export function toParsedLeadDraft(group: CanonicalOcrConversation): ParsedLeadDraft {
  const newest = group.candidates[group.candidates.length - 1];
  const rawSource = group.candidates
    .map((candidate) => candidate.rawText)
    .filter(Boolean)
    .join("\n\n--- screenshot ---\n\n");

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
    specialReqs: newest?.lastVisibleMessage ?? "",
    inBLR: null,
    zone: "",
    rawSource,
  };
}

export function reviewReason(group: CanonicalOcrConversation): string | null {
  if (!group.phoneE164) return "Phone number could not be resolved confidently.";
  if (group.needsHumanReview) return "At least one OCR extraction is below high confidence.";
  return null;
}
