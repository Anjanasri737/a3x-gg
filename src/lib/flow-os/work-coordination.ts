// Flow OS — shared-account work coordination contract.
//
// This file deliberately models three different concepts separately:
// 1) business ownership: who is accountable for the lead,
// 2) draft reservation: whose 30-lead batch currently contains the lead,
// 3) live work claim: who may act on the lead right now.
//
// Mixing those concepts is what creates double calls and invisible work.

export const DEFAULT_DRAFT_BATCH_SIZE = 30;
export const DEFAULT_DRAFT_SLA_SECONDS = 300;
export const DEFAULT_ACTIVE_TRAY_SIZE = 13;

export type WorkClaimState =
  | "AVAILABLE"
  | "DRAFTING"
  | "IN_WORK"
  | "CALLING"
  | "FOLLOW_UP_ACTIVE"
  | "WAITING_FOR_CUSTOMER"
  | "NEXT_ACTION_SCHEDULED"
  | "COMPLETED";

export type DraftDisposition =
  | "CALL_NOW"
  | "WHATSAPP_NOW"
  | "TOUR_READY"
  | "POST_TOUR"
  | "FOLLOW_UP_TODAY"
  | "WAITING_CUSTOMER"
  | "FUTURE_DATE"
  | "NEEDS_SUPPLY"
  | "LOST_OR_NON_LEAD"
  | "REVIEW_REQUIRED";

export type ObservationResolutionState =
  | "LINKED_EXISTING_LEAD"
  | "CREATED_NEW_LEAD"
  | "DUPLICATE_OBSERVATION"
  | "REVIEW_REQUIRED"
  | "NON_LEAD_EXPLICIT"
  | "SYSTEM_OR_INTERNAL_CHAT";

export type ConversationMovement =
  | "FIRST_SEEN"
  | "NO_CHANGE"
  | "PREVIEW_CHANGED"
  | "VISIBLE_TIME_CHANGED"
  | "UNREAD_CHANGED"
  | "CUSTOMER_REPLIED"
  | "OPERATOR_REPLIED"
  | "RETURNED_TO_TOP";

export interface ScreenshotObservationProjection {
  observationId: string;
  screenshotId: string;
  sourceId: string | null;
  capturedAt: string;
  rowIndex: number;
  contactName: string | null;
  phoneE164: string | null;
  lastMessagePreview: string | null;
  visibleTimestampRaw: string | null;
  unreadCount: number | null;
  resolutionState: ObservationResolutionState;
  leadId: string | null;
  movement?: ConversationMovement;
  confidence: "high" | "medium" | "low";
}

export interface DraftBatch {
  id: string;
  operatorId: string;
  openedAt: string;
  closedAt: string | null;
  status: "OPEN" | "CLASSIFIED" | "CANCELLED";
  targetSize: number;
  slaSeconds: number;
  items: DraftBatchItem[];
}

export interface DraftBatchItem {
  leadId: string;
  reservedAt: string;
  disposition: DraftDisposition | null;
  dispositionReason?: string | null;
  nextActionAt?: string | null;
  classifiedAt?: string | null;
}

export interface LiveWorkClaim {
  leadId: string;
  operatorId: string;
  operatorName?: string;
  state: WorkClaimState;
  batchId?: string | null;
  claimedAt: string;
  heartbeatAt: string;
  expiresAt: string;
}

export interface LeadWorkProjection {
  leadId: string;
  primaryOwnerId: string | null;
  nextActionOwnerId: string | null;
  nextActionAt: string | null;
  pipelineStage: string;
  isTerminal: boolean;
  futureUntil: string | null;
  liveClaim: LiveWorkClaim | null;
}

export interface ReconciliationCoverage {
  visibleRows: number;
  accountedRows: number;
  linkedExisting: number;
  createdNew: number;
  duplicateObservations: number;
  reviewRequired: number;
  explicitNonLead: number;
  internalChats: number;
  unaccountedRows: number;
  coveragePct: number;
}

/**
 * A screenshot run is complete only when every visible row has an explicit
 * disposition. REVIEW_REQUIRED still counts as accounted because it is visible
 * work, not silently dropped work. Resolution can happen later.
 */
export function reconciliationCoverage(
  observations: ScreenshotObservationProjection[],
): ReconciliationCoverage {
  const visibleRows = observations.length;
  const count = (state: ObservationResolutionState) =>
    observations.filter((o) => o.resolutionState === state).length;

  const linkedExisting = count("LINKED_EXISTING_LEAD");
  const createdNew = count("CREATED_NEW_LEAD");
  const duplicateObservations = count("DUPLICATE_OBSERVATION");
  const reviewRequired = count("REVIEW_REQUIRED");
  const explicitNonLead = count("NON_LEAD_EXPLICIT");
  const internalChats = count("SYSTEM_OR_INTERNAL_CHAT");
  const accountedRows =
    linkedExisting + createdNew + duplicateObservations + reviewRequired + explicitNonLead + internalChats;
  const unaccountedRows = Math.max(0, visibleRows - accountedRows);
  const coveragePct = visibleRows === 0 ? 100 : Math.round((accountedRows / visibleRows) * 100);

  return {
    visibleRows,
    accountedRows,
    linkedExisting,
    createdNew,
    duplicateObservations,
    reviewRequired,
    explicitNonLead,
    internalChats,
    unaccountedRows,
    coveragePct,
  };
}

/** One open draft per operator. The next 30 cannot open until the current 30 are classified. */
export function canOpenDraft(operatorId: string, batches: DraftBatch[]) {
  const open = batches.find((b) => b.operatorId === operatorId && b.status === "OPEN");
  if (!open) return { ok: true as const };
  const remaining = open.items.filter((i) => !i.disposition).length;
  return {
    ok: false as const,
    reason: `Finish current draft ${open.id}: ${remaining} lead(s) still need disposition.`,
    batchId: open.id,
    remaining,
  };
}

/**
 * The batch itself is not a permission to act. Only a non-expired live claim
 * allows Call / WhatsApp / state-changing actions.
 */
export function canAcquireLiveClaim(
  leadId: string,
  operatorId: string,
  claims: LiveWorkClaim[],
  now = Date.now(),
) {
  const active = claims.find((c) => c.leadId === leadId && Date.parse(c.expiresAt) > now);
  if (!active) return { ok: true as const };
  if (active.operatorId === operatorId) return { ok: true as const, existing: active };
  return {
    ok: false as const,
    reason: `${active.operatorName ?? active.operatorId} is already working this lead.`,
    active,
  };
}

/**
 * Future is a next-action state, not a dead bucket. A future lead must always
 * have a dated wake-up action. A fresh inbound WhatsApp observation can wake it
 * earlier without creating a new lead.
 */
export function futureLeadIsValid(lead: LeadWorkProjection) {
  if (!lead.futureUntil) return { ok: true as const };
  if (!lead.nextActionAt) {
    return { ok: false as const, reason: "Future lead has no dated next action." };
  }
  if (!lead.nextActionOwnerId && !lead.primaryOwnerId) {
    return { ok: false as const, reason: "Future lead has no accountable owner." };
  }
  return { ok: true as const };
}

/**
 * Hard work leakage means a non-terminal lead is neither actively owned/worked
 * nor safely parked behind a dated next action.
 */
export function isWorkLeakage(lead: LeadWorkProjection, now = Date.now()) {
  if (lead.isTerminal) return false;
  const hasLiveWorker = !!lead.liveClaim && Date.parse(lead.liveClaim.expiresAt) > now;
  const hasAccountableOwner = !!lead.primaryOwnerId || !!lead.nextActionOwnerId;
  const hasDatedNextAction = !!lead.nextActionAt;
  return !hasLiveWorker && (!hasAccountableOwner || !hasDatedNextAction);
}
