export type WorkBucket =
  | "NOW"
  | "TODAY"
  | "TOUR_READY"
  | "POST_TOUR"
  | "QUOTE_DUE"
  | "RECOVERY"
  | "FUTURE"
  | "WAITING_CUSTOMER"
  | "WAITING_SUPPLY"
  | "WAITING_OWNER"
  | "LOST";

export type ClaimState = "available" | "drafted" | "active" | "released" | "completed";

export interface DraftBatch {
  id: string;
  operatorId: string;
  createdAt: string;
  targetSize: 30;
  leadIds: string[];
  completedLeadIds: string[];
  activeLeadIds: string[];
  releasedLeadIds: string[];
}

/**
 * One lead may appear in many screenshot observations, queues and views, but it
 * can have only one active work claim at a time. This is the collision barrier
 * for eight people working the same WhatsApp universe.
 */
export interface LeadWorkClaim {
  leadId: string;
  operatorId: string;
  batchId?: string;
  state: ClaimState;
  bucket: WorkBucket;
  claimedAt: string;
  lastMeaningfulActionAt: string;
  expiresAt?: string;
  releasedAt?: string;
  releaseReason?: string;
  nextAction?: string;
  nextActionAt?: string;
}

export interface LeadWorkSnapshot {
  leadId: string;
  bucket: WorkBucket;
  score: number;
  ownerId?: string | null;
  currentClaim?: LeadWorkClaim | null;
  lastInboundAt?: string | null;
  lastOutboundAt?: string | null;
  nextActionAt?: string | null;
  moveInDate?: string | null;
  pipelineStage?: string | null;
  hasUnreadInbound?: boolean;
  hasRevenueLeakage?: boolean;
}

export interface DraftPolicy {
  batchSize: 30;
  maxActiveTray: number;
  claimIdleExpiryMinutes: number;
  allowCrossZone: boolean;
}

export const DEFAULT_DRAFT_POLICY: DraftPolicy = {
  batchSize: 30,
  maxActiveTray: 13,
  claimIdleExpiryMinutes: 10,
  allowCrossZone: false,
};

/**
 * Revenue-leakage invariant:
 * A lead visible in the latest screenshot horizon must never be left without
 * either (a) an active accountable owner/claim, or (b) a dated next action in a
 * legitimate waiting/future state.
 */
export function isRevenueLeakage(snapshot: LeadWorkSnapshot): boolean {
  if (snapshot.bucket === "LOST") return false;
  if (snapshot.currentClaim?.state === "active" || snapshot.currentClaim?.state === "drafted") return false;
  if (snapshot.nextActionAt) return false;
  return true;
}

export function claimExpired(claim: LeadWorkClaim, now = Date.now()): boolean {
  if (claim.state !== "active" && claim.state !== "drafted") return false;
  if (claim.expiresAt) return Date.parse(claim.expiresAt) <= now;
  const idleMs = now - Date.parse(claim.lastMeaningfulActionAt || claim.claimedAt);
  return idleMs >= DEFAULT_DRAFT_POLICY.claimIdleExpiryMinutes * 60_000;
}

/**
 * Re-uploading screenshots may change urgency. A fresh inbound message is a
 * Priority Interrupt: it may reorder an operator's own batch, but it must not
 * steal a lead from another non-expired active claim.
 */
export function canInterrupt(snapshot: LeadWorkSnapshot, operatorId: string): boolean {
  const claim = snapshot.currentClaim;
  if (!snapshot.hasUnreadInbound) return false;
  if (!claim) return true;
  if (claim.operatorId === operatorId) return true;
  return claimExpired(claim);
}

/**
 * Deterministic selection prevents eight operators from seeing the same 30.
 * The caller must persist claims atomically in the database after selection.
 */
export function chooseDraftCandidates(
  snapshots: LeadWorkSnapshot[],
  operatorId: string,
  limit = DEFAULT_DRAFT_POLICY.batchSize,
): LeadWorkSnapshot[] {
  const eligible = snapshots.filter((lead) => {
    const claim = lead.currentClaim;
    if (!claim) return lead.bucket !== "LOST";
    if (claim.operatorId === operatorId && (claim.state === "drafted" || claim.state === "active")) return true;
    return claimExpired(claim) && lead.bucket !== "LOST";
  });

  return eligible
    .sort((a, b) => {
      const inboundA = a.hasUnreadInbound ? 1 : 0;
      const inboundB = b.hasUnreadInbound ? 1 : 0;
      if (inboundA !== inboundB) return inboundB - inboundA;
      if (a.score !== b.score) return b.score - a.score;
      const nextA = a.nextActionAt ? Date.parse(a.nextActionAt) : Number.MAX_SAFE_INTEGER;
      const nextB = b.nextActionAt ? Date.parse(b.nextActionAt) : Number.MAX_SAFE_INTEGER;
      if (nextA !== nextB) return nextA - nextB;
      const moveA = a.moveInDate ? Date.parse(a.moveInDate) : Number.MAX_SAFE_INTEGER;
      const moveB = b.moveInDate ? Date.parse(b.moveInDate) : Number.MAX_SAFE_INTEGER;
      return moveA - moveB;
    })
    .slice(0, limit);
}
