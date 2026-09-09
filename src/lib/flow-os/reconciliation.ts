import type { PipelineStage } from "@/lib/pipeline/stage-config";
import { inferMessageIntelligence } from "./message-intelligence";

export type SyncState = "GREEN" | "AMBER" | "RED" | "GREY";
export type ReconciliationState =
  | "matched_existing"
  | "new_customer"
  | "returning_cycle"
  | "duplicate_observation"
  | "needs_review"
  | "non_customer";

export interface ReconciliationCounts {
  visibleRows: number;
  resolved: number;
  review: number;
  nonCustomer: number;
  silentDrops: number;
  complete: boolean;
}

export function reconcileCounts(
  visibleRows: number,
  states: Array<ReconciliationState | string>,
): ReconciliationCounts {
  const resolved = states.filter((s) =>
    ["matched_existing", "new_customer", "returning_cycle", "duplicate_observation"].includes(s),
  ).length;
  const review = states.filter((s) => s === "needs_review").length;
  const nonCustomer = states.filter((s) => s === "non_customer").length;
  const accounted = resolved + review + nonCustomer;
  const silentDrops = Math.max(0, visibleRows - accounted);
  return { visibleRows, resolved, review, nonCustomer, silentDrops, complete: visibleRows === accounted };
}

export interface LabelRule {
  id?: string;
  whatsappAccount?: string | null;
  colorHint?: string | null;
  seenState?: "seen" | "unseen" | "unknown" | null;
  textPattern?: string | null;
  inferredLabel: string;
  inferredPriority?: string | null;
  inferredBucket?: string | null;
  rank?: number;
  isEnabled?: boolean;
}

export interface LabelEvidence {
  whatsappAccount?: string | null;
  colorHint?: string | null;
  seenState?: "seen" | "unseen" | "unknown" | null;
  lastMessage?: string | null;
}

export interface LabelInference {
  label: string | null;
  priority: string | null;
  bucket: string | null;
  ruleId?: string;
  reasons: string[];
}

export function inferLabel(evidence: LabelEvidence, rules: LabelRule[]): LabelInference {
  const text = evidence.lastMessage ?? "";
  const candidates = rules
    .filter((r) => r.isEnabled !== false)
    .filter((r) => !r.whatsappAccount || r.whatsappAccount === evidence.whatsappAccount)
    .filter((r) => !r.colorHint || r.colorHint.toLowerCase() === (evidence.colorHint ?? "").toLowerCase())
    .filter((r) => !r.seenState || r.seenState === evidence.seenState)
    .filter((r) => {
      if (!r.textPattern) return true;
      try {
        return new RegExp(r.textPattern, "i").test(text);
      } catch {
        return text.toLowerCase().includes(r.textPattern.toLowerCase());
      }
    })
    .sort((a, b) => (a.rank ?? 100) - (b.rank ?? 100));

  const hit = candidates[0];
  if (!hit) return { label: null, priority: null, bucket: null, reasons: [] };
  const reasons = [
    hit.colorHint ? `colour=${hit.colorHint}` : "",
    hit.seenState ? `seen=${hit.seenState}` : "",
    hit.textPattern ? `message matches ${hit.textPattern}` : "",
  ].filter(Boolean);
  return {
    label: hit.inferredLabel,
    priority: hit.inferredPriority ?? null,
    bucket: hit.inferredBucket ?? null,
    ruleId: hit.id,
    reasons,
  };
}

export interface SyncAssessmentInput {
  hasCrmIdentity: boolean;
  hasOwner: boolean;
  hasCurrentClaim: boolean;
  hasDatedNextAction: boolean;
  nextActionAt?: string | null;
  unreadVisible?: boolean | null;
  latestObservationAt?: string | null;
  lastMeaningfulCrmAt?: string | null;
  savedStage?: PipelineStage | string | null;
  inferredStage?: PipelineStage | string | null;
  waitingReason?: string | null;
}

export function assessSyncState(input: SyncAssessmentInput): { state: SyncState; reasons: string[] } {
  const reasons: string[] = [];
  if (!input.hasCrmIdentity) return { state: "RED", reasons: ["visible WhatsApp customer has no CRM identity"] };
  if (!input.hasOwner && !input.hasCurrentClaim && !input.hasDatedNextAction) {
    return { state: "RED", reasons: ["no owner, active handler or dated next action"] };
  }
  if (input.unreadVisible && !input.hasCurrentClaim && !input.hasDatedNextAction) {
    return { state: "RED", reasons: ["fresh/unread inbound has nobody actively handling it"] };
  }

  const obs = input.latestObservationAt ? Date.parse(input.latestObservationAt) : 0;
  const crm = input.lastMeaningfulCrmAt ? Date.parse(input.lastMeaningfulCrmAt) : 0;
  if (obs && crm && obs > crm) reasons.push("WhatsApp moved after last meaningful CRM activity");
  if (input.savedStage && input.inferredStage && input.savedStage !== input.inferredStage) {
    reasons.push(`saved stage ${input.savedStage} differs from message hint ${input.inferredStage}`);
  }
  if (reasons.length) return { state: "AMBER", reasons };

  if (input.hasDatedNextAction && input.nextActionAt && Date.parse(input.nextActionAt) > Date.now() + 24 * 3600_000) {
    return { state: "GREY", reasons: [input.waitingReason || "intentionally waiting/future with a dated next action"] };
  }
  return { state: "GREEN", reasons: ["WhatsApp evidence and CRM accountability are synchronized"] };
}

export function enrichObservation(input: {
  lastMessagePreview?: string | null;
  previewDirection?: "incoming" | "outgoing" | "unknown";
  unreadVisible?: boolean | null;
  seenState?: "seen" | "unseen" | "unknown";
  colorHint?: string | null;
  detectedLabel?: string | null;
  savedStage?: string | null;
}) {
  return inferMessageIntelligence({
    lastMessage: input.lastMessagePreview,
    direction: input.previewDirection,
    unreadVisible: input.unreadVisible,
    seenState: input.seenState,
    colorHint: input.colorHint,
    detectedLabel: input.detectedLabel,
    savedStage: input.savedStage,
  });
}
