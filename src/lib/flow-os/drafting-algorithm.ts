import type { TruthRow } from "./service";
import { inferMessageIntelligence } from "./message-intelligence";

export type DraftBucket =
  | "FRESH_STRONG"
  | "UNREAD_REPLY"
  | "QUALIFIED_NO_TOUR"
  | "TOUR_RELATED"
  | "POST_TOUR"
  | "QUOTE_NEGOTIATION"
  | "RECOVERY"
  | "FUTURE_DUE"
  | "GENERAL";

export interface DraftCandidate {
  row: TruthRow;
  bucket: DraftBucket;
  score: number;
  why: string[];
  intelligence: ReturnType<typeof inferMessageIntelligence>;
  factors: {
    revenueProbability: number;
    urgency: number;
    feasibility: number;
    inventory: number;
    movement: number;
    slaRisk: number;
  };
}

const STAGE_REVENUE: Record<string, number> = {
  NEW: 28,
  DOSSIER: 42,
  MATCHED: 58,
  TOUR_SCHEDULED: 64,
  TOUR_CONFIRMED: 68,
  TOUR_IN_PROGRESS: 78,
  POST_VISIT: 82,
  QUOTED: 88,
  NEGOTIATION: 94,
  BOOKED: 98,
};

const SOFT_TARGETS: Partial<Record<DraftBucket, number>> = {
  FRESH_STRONG: 6,
  UNREAD_REPLY: 5,
  QUALIFIED_NO_TOUR: 5,
  TOUR_RELATED: 4,
  POST_TOUR: 3,
  QUOTE_NEGOTIATION: 3,
  RECOVERY: 2,
  FUTURE_DUE: 2,
};

function clamp(n: number) {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function ageMinutes(value?: string | null) {
  if (!value) return Number.POSITIVE_INFINITY;
  const ts = Date.parse(value);
  return Number.isFinite(ts) ? Math.max(0, (Date.now() - ts) / 60_000) : Number.POSITIVE_INFINITY;
}

function classifyBucket(row: TruthRow, inferredBucket: string): DraftBucket {
  const stage = String(row.current_pipeline_stage || row.lead_status || "NEW").toUpperCase();
  const due = row.next_action_at ? Date.parse(row.next_action_at) <= Date.now() : false;
  if (row.unread_visible) return "UNREAD_REPLY";
  if (inferredBucket === "FUTURE" && due) return "FUTURE_DUE";
  if (["QUOTED", "NEGOTIATION"].includes(stage) || inferredBucket === "QUOTE_DUE") return "QUOTE_NEGOTIATION";
  if (stage === "POST_VISIT" || inferredBucket === "POST_TOUR") return "POST_TOUR";
  if (["TOUR_SCHEDULED", "TOUR_CONFIRMED", "TOUR_IN_PROGRESS"].includes(stage) || inferredBucket === "TOUR_READY") return "TOUR_RELATED";
  if (["DOSSIER", "MATCHED"].includes(stage) && !row.next_action_kind?.toLowerCase().includes("tour")) return "QUALIFIED_NO_TOUR";
  if (row.sync_state === "RED" || row.sync_state === "AMBER") return "RECOVERY";
  if (ageMinutes(row.latest_observation_at) <= 60 && ["super_hot", "hot"].includes(String(row.priority))) return "FRESH_STRONG";
  return "GENERAL";
}

export function scoreDraftCandidate(row: TruthRow): DraftCandidate {
  const stage = String(row.current_pipeline_stage || row.lead_status || "NEW").toUpperCase();
  const intelligence = inferMessageIntelligence({
    lastMessage: row.last_message_preview,
    direction: row.preview_direction as any,
    unreadVisible: row.unread_visible,
    seenState: row.seen_state as any,
    colorHint: row.color_hint,
    detectedLabel: row.detected_label,
    savedStage: stage,
  });
  const obsAge = ageMinutes(row.latest_observation_at);
  const actionDue = row.next_action_at ? Date.parse(row.next_action_at) : Number.POSITIVE_INFINITY;
  const overdueMinutes = Number.isFinite(actionDue) ? Math.max(0, (Date.now() - actionDue) / 60_000) : 0;

  const revenueProbability = clamp(
    (STAGE_REVENUE[stage] ?? 35) +
    (row.priority === "super_hot" ? 18 : row.priority === "hot" ? 10 : 0) +
    (intelligence.inferredIntent === "PAYMENT_SIGNAL" ? 12 : 0) +
    (intelligence.inferredIntent === "POST_TOUR_POSITIVE" ? 10 : 0),
  );
  const urgency = clamp(
    (row.unread_visible ? 45 : 0) +
    (overdueMinutes > 0 ? Math.min(35, 10 + overdueMinutes / 10) : 0) +
    (obsAge <= 15 ? 25 : obsAge <= 60 ? 15 : obsAge <= 180 ? 8 : 0),
  );
  // These are conservative proxies until inventory/feasibility services expose
  // numeric scores to the truth view. Unknown is neutral (50), never zero.
  const feasibility = clamp(
    50 +
    (row.location_text ? 12 : 0) +
    (row.movein_date ? 12 : 0) +
    (["MATCHED", "TOUR_SCHEDULED", "TOUR_CONFIRMED", "TOUR_IN_PROGRESS", "POST_VISIT", "QUOTED", "NEGOTIATION", "BOOKED"].includes(stage) ? 18 : 0),
  );
  const inventory = clamp(
    50 +
    (["MATCHED", "TOUR_SCHEDULED", "TOUR_CONFIRMED", "TOUR_IN_PROGRESS", "POST_VISIT", "QUOTED", "NEGOTIATION", "BOOKED"].includes(stage) ? 28 : 0),
  );
  const movement = clamp(
    (row.unread_visible ? 45 : 0) +
    (row.stage_inference && row.stage_inference !== stage ? 30 : 0) +
    (obsAge <= 30 ? 25 : obsAge <= 120 ? 15 : 5),
  );
  const slaRisk = clamp(
    (row.sync_state === "RED" ? 65 : row.sync_state === "AMBER" ? 40 : 10) +
    (overdueMinutes > 0 ? Math.min(35, 10 + overdueMinutes / 10) : 0),
  );

  // Weighted multiplicative score. Geometric-style aggregation prevents one
  // huge signal from completely hiding a fatal weakness while still letting
  // truly hot opportunities dominate the batch.
  const factors = { revenueProbability, urgency, feasibility, inventory, movement, slaRisk };
  const weighted =
    Math.pow(Math.max(revenueProbability, 1) / 100, 0.29) *
    Math.pow(Math.max(urgency, 1) / 100, 0.22) *
    Math.pow(Math.max(feasibility, 1) / 100, 0.14) *
    Math.pow(Math.max(inventory, 1) / 100, 0.12) *
    Math.pow(Math.max(movement, 1) / 100, 0.13) *
    Math.pow(Math.max(slaRisk, 1) / 100, 0.10);
  const score = clamp(weighted * 100 + (row.sync_state === "RED" ? 8 : 0));
  const bucket = classifyBucket(row, intelligence.inferredWorkBucket);
  const why = [
    `Revenue ${revenueProbability}`,
    `Urgency ${urgency}`,
    `Movement ${movement}`,
    `SLA risk ${slaRisk}`,
    ...intelligence.reasons.slice(0, 2),
  ];
  return { row, bucket, score, why, intelligence, factors };
}

/**
 * Soft-balanced portfolio, not a rigid quota. First pass gives each useful
 * funnel bucket representation, second pass fills every remaining slot by ROI.
 * Any candidate scoring >= 88 bypasses a soft bucket target.
 */
export function selectDraftPortfolio(rows: TruthRow[], targetSize = 30): DraftCandidate[] {
  const target = Math.max(1, Math.min(60, targetSize));
  const candidates = rows
    .map(scoreDraftCandidate)
    .filter((c) => !["CHECKED_IN", "LOST"].includes(String(c.row.current_pipeline_stage || c.row.lead_status).toUpperCase()))
    .filter((c) => {
      const future = c.intelligence.inferredWorkBucket === "FUTURE";
      if (!future) return true;
      return Boolean(c.row.next_action_at && Date.parse(c.row.next_action_at) <= Date.now());
    })
    .sort((a, b) => b.score - a.score);

  const selected: DraftCandidate[] = [];
  const selectedIds = new Set<string>();
  const counts = new Map<DraftBucket, number>();

  for (const c of candidates) {
    if (selected.length >= target) break;
    const soft = SOFT_TARGETS[c.bucket];
    if (c.score >= 88 || (soft != null && (counts.get(c.bucket) ?? 0) < soft)) {
      selected.push(c);
      selectedIds.add(c.row.lead_id);
      counts.set(c.bucket, (counts.get(c.bucket) ?? 0) + 1);
    }
  }
  for (const c of candidates) {
    if (selected.length >= target) break;
    if (selectedIds.has(c.row.lead_id)) continue;
    selected.push(c);
    selectedIds.add(c.row.lead_id);
  }
  return selected.sort((a, b) => b.score - a.score);
}
