import { supabase } from "@/integrations/supabase/client";
import { normalizePhoneIN } from "@/lib/lead-identity/normalize";
import { classifyLastMessage, deriveSeenState, movementSummary, type SeenState } from "./chat-intelligence";

// New Flow OS tables are intentionally accessed through an untyped façade until
// the generated Supabase types are regenerated after migrations are applied.
const db = supabase as any;

export type ObservationResolution =
  | "pending"
  | "matched_existing"
  | "new_lead"
  | "returning_cycle"
  | "duplicate_observation"
  | "identity_review"
  | "non_customer";

export type PreviewDirection = "incoming" | "outgoing" | "unknown";

export interface StructuredChatRowInput {
  screenshotKey: string;
  screenshotHash?: string;
  rowIndex: number;
  contactName?: string;
  phone?: string;
  lastMessage?: string;
  visibleTimestamp?: string;
  previewDirection?: PreviewDirection;
  seenState?: SeenState;
  unreadCount?: number;
  rowColour?: string;
  labelColour?: string;
  labelName?: string;
  handlerName?: string;
  capturedAt?: string;
  rawText?: string;
  ocrConfidence?: number;
  resolutionOverride?: ObservationResolution;
  resolutionReason?: string;
}

export interface ScreenshotBatchInput {
  waSourceId?: string;
  waAccountLabel?: string;
  screenshotCount: number;
  visibleRowsExpected: number;
  captureFrom?: string;
  captureTo?: string;
  note?: string;
  rows: StructuredChatRowInput[];
}

export interface BatchReconciliationSummary {
  batchId: string;
  screenshotCount: number;
  visibleRowsExpected: number;
  rowsSegmented: number;
  rowsReconciled: number;
  unresolvedRows: number;
  status: "processing" | "review" | "balanced" | "incomplete";
  newLeads: number;
  existingUpdated: number;
  duplicateObservations: number;
  identityReview: number;
}

export interface FlowOperator {
  id: string;
  name: string;
  email?: string;
}

export interface FlowLeadRow {
  id: string;
  phone: string;
  wa_name?: string | null;
  location_text?: string | null;
  movein_date?: string | null;
  score?: number | null;
  priority?: string | null;
  current_owner?: string | null;
  status?: string | null;
  pipeline_stage?: string | null;
  current_mission?: string | null;
  primary_blocker?: string | null;
  opportunity_score?: number | null;
  last_wa_message?: string | null;
  last_wa_seen_at?: string | null;
  wa_seen_state?: SeenState | null;
  wa_unread_count?: number | null;
  wa_label_colour?: string | null;
  wa_label_name?: string | null;
  current_handler_id?: string | null;
  current_handler_name?: string | null;
  suggested_stage?: string | null;
  suggested_mission?: string | null;
  suggestion_confidence?: number | null;
  suggestion_evidence?: string | null;
  sync_state?: string | null;
  last_operator_action_at?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
}

export interface FlowWorkClaim {
  id: string;
  lead_id: string;
  operator_id: string;
  operator_name?: string | null;
  draft_batch_id?: string | null;
  state: string;
  claimed_at: string;
  last_meaningful_activity_at: string;
  expires_at: string;
  takeover_requested_by?: string | null;
  takeover_requested_by_name?: string | null;
  takeover_requested_at?: string | null;
}

export interface WorkItemView {
  itemId: string;
  batchId: string;
  position: number;
  state: string;
  isPriorityInterrupt: boolean;
  roiScore: number;
  roiReasons: string[];
  lead: FlowLeadRow;
  claim?: FlowWorkClaim;
  nextAction?: { id: string; kind: string; due_at: string; notes?: string | null };
  latestObservation?: any;
  dueNow: boolean;
  activeTray: boolean;
}

export interface OperatorWorkState {
  operator: FlowOperator;
  batchId?: string;
  myDraftCount: number;
  activeTrayCount: number;
  dueNowCount: number;
  priorityInterruptCount: number;
  items: WorkItemView[];
}

export interface LeakageBucket<T = any> {
  key: string;
  label: string;
  count: number;
  severity: "red" | "amber" | "grey";
  rows: T[];
}

function isoNow() {
  return new Date().toISOString();
}

function safeDate(value?: string | null) {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function operatorDisplayName(user: any) {
  return (
    user?.user_metadata?.full_name ||
    user?.user_metadata?.name ||
    user?.email?.split("@")[0] ||
    "Operator"
  );
}

export async function getCurrentFlowOperator(): Promise<FlowOperator> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("Sign in required to claim and draft leads.");
  return {
    id: data.user.id,
    name: operatorDisplayName(data.user),
    email: data.user.email ?? undefined,
  };
}

export async function signInFlowOperator(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signOutFlowOperator() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getFlowSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

/**
 * Paste adapter for OCR providers, exports or manually structured rows.
 * One line = one visible WhatsApp row.
 * Supported delimiters: TAB or |.
 * Columns:
 * name | phone | lastMessage | seenState | unreadCount | rowColour |
 * labelColour | labelName | handler | visibleTimestamp | direction
 */
export function parseStructuredChatRows(text: string, screenshotKey = "pasted-1"): StructuredChatRowInput[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^name\s*[|\t]/i.test(line));

  return lines.map((line, index) => {
    const parts = line.includes("\t") ? line.split("\t") : line.split("|");
    const [
      contactName = "",
      phone = "",
      lastMessage = "",
      seen = "unknown",
      unread = "0",
      rowColour = "",
      labelColour = "",
      labelName = "",
      handlerName = "",
      visibleTimestamp = "",
      direction = "unknown",
    ] = parts.map((p) => p.trim());

    const seenState: SeenState = ["seen", "unseen", "unknown"].includes(seen.toLowerCase())
      ? (seen.toLowerCase() as SeenState)
      : "unknown";
    const previewDirection: PreviewDirection = ["incoming", "outgoing", "unknown"].includes(direction.toLowerCase())
      ? (direction.toLowerCase() as PreviewDirection)
      : "unknown";

    return {
      screenshotKey,
      rowIndex: index,
      contactName,
      phone,
      lastMessage,
      seenState,
      unreadCount: Math.max(0, Number.parseInt(unread || "0", 10) || 0),
      rowColour,
      labelColour,
      labelName,
      handlerName,
      visibleTimestamp,
      previewDirection,
      rawText: line,
      ocrConfidence: 1,
    };
  });
}

async function findExistingLead(phoneE164: string): Promise<FlowLeadRow | null> {
  if (!phoneE164) return null;
  const { data } = await db
    .from("leads")
    .select("*")
    .eq("phone", phoneE164)
    .maybeSingle();
  if (data) return data as FlowLeadRow;

  // Legacy rows may have been stored without +91 normalisation. Compare the
  // final 10 digits as a conservative fallback.
  const digits = phoneE164.replace(/\D/g, "").slice(-10);
  if (digits.length !== 10) return null;
  const { data: candidates } = await db.from("leads").select("*").limit(5000);
  return ((candidates ?? []) as FlowLeadRow[]).find((lead) => lead.phone?.replace(/\D/g, "").slice(-10) === digits) ?? null;
}

async function latestObservationForIdentity(phoneE164: string) {
  if (!phoneE164) return null;
  const { data } = await db
    .from("flow_screenshot_observations")
    .select("*")
    .eq("phone_e164", phoneE164)
    .order("captured_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ?? null;
}

function leadUpdateFromObservation(row: StructuredChatRowInput, stageSuggestion: ReturnType<typeof classifyLastMessage>, operator?: FlowOperator) {
  const unreadCount = row.unreadCount ?? 0;
  const seenState = deriveSeenState({ unreadCount, explicit: row.seenState, rowColour: row.rowColour });
  return {
    last_wa_message: row.lastMessage || null,
    last_wa_seen_at: row.capturedAt ?? isoNow(),
    wa_seen_state: seenState,
    wa_unread_count: unreadCount,
    wa_label_colour: row.labelColour || row.rowColour || null,
    wa_label_name: row.labelName || null,
    suggested_stage: stageSuggestion.suggestedStage,
    suggested_mission: stageSuggestion.suggestedMission,
    suggestion_confidence: stageSuggestion.confidence,
    suggestion_evidence: stageSuggestion.evidence.join(" · "),
    sync_state: stageSuggestion.shouldInterrupt ? "movement_detected" : "observed",
    ...(row.handlerName ? { current_handler_name: row.handlerName } : {}),
    ...(operator && row.handlerName === operator.name ? { current_handler_id: operator.id } : {}),
  };
}

export async function ingestScreenshotBatch(input: ScreenshotBatchInput): Promise<BatchReconciliationSummary> {
  let operator: FlowOperator | undefined;
  try {
    operator = await getCurrentFlowOperator();
  } catch {
    // Intake can still be used in dev/legacy mode if current RLS permits it.
  }

  const { data: batch, error: batchError } = await db
    .from("flow_screenshot_batches")
    .insert({
      wa_source_id: input.waSourceId ?? null,
      wa_account_label: input.waAccountLabel ?? null,
      capture_from: input.captureFrom ?? null,
      capture_to: input.captureTo ?? null,
      uploaded_by: operator?.id ?? null,
      uploaded_by_name: operator?.name ?? null,
      screenshot_count: input.screenshotCount,
      visible_rows_expected: input.visibleRowsExpected,
      note: input.note ?? null,
      status: "processing",
    })
    .select("*")
    .single();
  if (batchError || !batch) throw batchError ?? new Error("Could not create screenshot batch");

  let newLeads = 0;
  let existingUpdated = 0;
  let duplicateObservations = 0;
  let identityReview = 0;

  for (const sourceRow of input.rows) {
    const capturedAt = sourceRow.capturedAt ?? input.captureTo ?? isoNow();
    const phoneE164 = sourceRow.phone ? normalizePhoneIN(sourceRow.phone) : "";
    const stageSuggestion = classifyLastMessage(sourceRow.lastMessage);
    const previous = await latestObservationForIdentity(phoneE164);
    const movement = movementSummary(
      previous
        ? { lastMessage: previous.last_message, unreadCount: previous.unread_count, seenState: previous.seen_state }
        : undefined,
      { lastMessage: sourceRow.lastMessage, unreadCount: sourceRow.unreadCount, seenState: sourceRow.seenState },
    );

    let resolution: ObservationResolution = sourceRow.resolutionOverride ?? "pending";
    let lead: FlowLeadRow | null = null;

    if (resolution === "non_customer") {
      // Explicit justified exclusion; observation is still retained.
    } else if (!phoneE164) {
      resolution = "identity_review";
      identityReview += 1;
    } else {
      lead = await findExistingLead(phoneE164);
      if (lead) {
        const isExactDuplicate =
          previous &&
          (previous.last_message ?? "").trim() === (sourceRow.lastMessage ?? "").trim() &&
          (previous.visible_timestamp_raw ?? "").trim() === (sourceRow.visibleTimestamp ?? "").trim() &&
          previous.screenshot_hash &&
          sourceRow.screenshotHash &&
          previous.screenshot_hash === sourceRow.screenshotHash;

        resolution = isExactDuplicate ? "duplicate_observation" : "matched_existing";
        if (isExactDuplicate) duplicateObservations += 1;
        else existingUpdated += 1;
      } else {
        const { data: inserted, error: leadError } = await db
          .from("leads")
          .insert({
            phone: phoneE164,
            wa_name: sourceRow.contactName || null,
            status: "open",
            score: 0,
            location_score: 0,
            movein_score: 0,
            pipeline_stage: "NEW",
            current_mission: stageSuggestion.suggestedMission || "Contact customer",
            ...leadUpdateFromObservation(sourceRow, stageSuggestion, operator),
          })
          .select("*")
          .single();
        if (leadError || !inserted) throw leadError ?? new Error("Could not create lead");
        lead = inserted as FlowLeadRow;
        resolution = "new_lead";
        newLeads += 1;

        // Preserve the returning-cycle architecture used by Tower.
        await db.from("lead_cycles").insert({ lead_id: lead.id, cycle_no: 1, open_reason: "screenshot_intake" });
      }
    }

    if (lead) {
      const patch: Record<string, unknown> = {
        ...leadUpdateFromObservation({ ...sourceRow, capturedAt }, stageSuggestion, operator),
      };
      if (!lead.wa_name && sourceRow.contactName) patch.wa_name = sourceRow.contactName;
      if (!lead.current_mission || lead.current_mission === "Contact customer") patch.current_mission = stageSuggestion.suggestedMission;
      if ((lead.opportunity_score ?? 0) < Math.round(stageSuggestion.confidence * 100)) {
        patch.opportunity_score = Math.round(stageSuggestion.confidence * 100);
      }
      await db.from("leads").update(patch).eq("id", lead.id);
    }

    const seenState = deriveSeenState({
      unreadCount: sourceRow.unreadCount,
      explicit: sourceRow.seenState,
      rowColour: sourceRow.rowColour,
    });

    const { error: observationError } = await db.from("flow_screenshot_observations").insert({
      batch_id: batch.id,
      screenshot_key: sourceRow.screenshotKey,
      screenshot_hash: sourceRow.screenshotHash ?? null,
      row_index: sourceRow.rowIndex,
      wa_source_id: input.waSourceId ?? null,
      wa_account_label: input.waAccountLabel ?? null,
      captured_at: capturedAt,
      contact_name: sourceRow.contactName ?? null,
      phone_raw: sourceRow.phone ?? null,
      phone_e164: phoneE164 || null,
      last_message: sourceRow.lastMessage ?? null,
      preview_direction: sourceRow.previewDirection ?? "unknown",
      visible_timestamp_raw: sourceRow.visibleTimestamp ?? null,
      seen_state: seenState,
      unread_count: sourceRow.unreadCount ?? 0,
      row_colour: sourceRow.rowColour ?? null,
      label_colour: sourceRow.labelColour ?? null,
      label_name: sourceRow.labelName ?? null,
      handler_id: sourceRow.handlerName && operator?.name === sourceRow.handlerName ? operator.id : null,
      handler_name: sourceRow.handlerName ?? null,
      ocr_confidence: sourceRow.ocrConfidence ?? null,
      raw_text: sourceRow.rawText ?? sourceRow.lastMessage ?? null,
      previous_observation_id: previous?.id ?? null,
      movement_signal: movement,
      suggested_stage: stageSuggestion.suggestedStage,
      suggested_mission: stageSuggestion.suggestedMission,
      suggestion_confidence: stageSuggestion.confidence,
      suggestion_evidence: stageSuggestion.evidence.join(" · "),
      resolution,
      resolution_reason: sourceRow.resolutionReason ?? null,
      lead_id: lead?.id ?? null,
      resolved_at: resolution === "identity_review" ? null : isoNow(),
    });
    if (observationError) throw observationError;
  }

  await db.rpc("flow_refresh_batch", { p_batch_id: batch.id });
  const { data: refreshed } = await db.from("flow_screenshot_batches").select("*").eq("id", batch.id).single();

  return {
    batchId: batch.id,
    screenshotCount: refreshed?.screenshot_count ?? input.screenshotCount,
    visibleRowsExpected: refreshed?.visible_rows_expected ?? input.visibleRowsExpected,
    rowsSegmented: refreshed?.rows_segmented ?? input.rows.length,
    rowsReconciled: refreshed?.rows_reconciled ?? 0,
    unresolvedRows: refreshed?.unresolved_rows ?? identityReview,
    status: refreshed?.status ?? "processing",
    newLeads,
    existingUpdated,
    duplicateObservations,
    identityReview,
  };
}

export async function loadRecentBatches(limit = 20) {
  const { data, error } = await db
    .from("flow_screenshot_batches")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function loadIdentityReviewRows(limit = 100) {
  const { data, error } = await db
    .from("flow_screenshot_observations")
    .select("*")
    .in("resolution", ["pending", "identity_review"])
    .order("captured_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function resolveObservationIdentity(observationId: string, leadId: string, resolution: "matched_existing" | "new_lead" = "matched_existing") {
  const { data: obs } = await db.from("flow_screenshot_observations").select("batch_id").eq("id", observationId).single();
  const { error } = await db
    .from("flow_screenshot_observations")
    .update({ lead_id: leadId, resolution, resolved_at: isoNow() })
    .eq("id", observationId);
  if (error) throw error;
  if (obs?.batch_id) await db.rpc("flow_refresh_batch", { p_batch_id: obs.batch_id });
}

function roiScore(lead: FlowLeadRow, latestObservation: any, nextAction: any) {
  let score = Number(lead.opportunity_score ?? lead.score ?? 0);
  const reasons: string[] = [];
  const now = Date.now();

  const unread = Number(latestObservation?.unread_count ?? lead.wa_unread_count ?? 0);
  if (unread > 0) {
    score += 30;
    reasons.push(`New inbound / unread ${unread}`);
  }

  if (latestObservation?.preview_direction === "incoming") {
    score += 15;
    reasons.push("Latest visible message appears inbound");
  }

  const suggestion = classifyLastMessage(latestObservation?.last_message ?? lead.last_wa_message);
  if (suggestion.shouldInterrupt) {
    score += Math.round(suggestion.confidence * 20);
    reasons.push(suggestion.suggestedMission);
  }

  if (lead.priority === "super_hot") {
    score += 40;
    reasons.push("Super Hot priority");
  } else if (lead.priority === "hot") {
    score += 25;
    reasons.push("Hot priority");
  }

  if (lead.movein_date) {
    const days = Math.ceil((safeDate(lead.movein_date) - now) / 86_400_000);
    if (days <= 2) {
      score += 30;
      reasons.push("Move-in within 2 days");
    } else if (days <= 7) {
      score += 18;
      reasons.push("Move-in within 7 days");
    } else if (days > 30) {
      score -= 10;
      reasons.push("Long-dated move-in");
    }
  }

  if (nextAction?.due_at && safeDate(nextAction.due_at) <= now) {
    score += 25;
    reasons.push("Next action due now");
  }

  const stage = (lead.pipeline_stage ?? "NEW").toUpperCase();
  if (["POST_VISIT", "QUOTED", "NEGOTIATION"].includes(stage)) {
    score += 25;
    reasons.push(`${stage.replaceAll("_", " ")} close opportunity`);
  }
  if (stage === "CHECKED_IN" || stage === "LOST") score -= 500;
  if (stage === "FUTURE" && (!nextAction?.due_at || safeDate(nextAction.due_at) > now)) score -= 100;

  return { score, reasons: reasons.slice(0, 5) };
}

export async function claimLead(leadId: string, batchId?: string) {
  const operator = await getCurrentFlowOperator();
  const { data, error } = await db.rpc("flow_claim_lead", {
    p_lead_id: leadId,
    p_operator_id: operator.id,
    p_operator_name: operator.name,
    p_batch_id: batchId ?? null,
  });
  if (error) throw error;
  return Array.isArray(data) ? data[0] : data;
}

export async function requestTakeover(claimId: string) {
  const operator = await getCurrentFlowOperator();
  const { error } = await db
    .from("flow_work_claims")
    .update({
      takeover_requested_by: operator.id,
      takeover_requested_by_name: operator.name,
      takeover_requested_at: isoNow(),
    })
    .eq("id", claimId)
    .eq("state", "active");
  if (error) throw error;
}

export async function heartbeatClaim(claimId: string) {
  const operator = await getCurrentFlowOperator();
  const { data, error } = await db.rpc("flow_heartbeat_claim", {
    p_claim_id: claimId,
    p_operator_id: operator.id,
  });
  if (error) throw error;
  return Boolean(data);
}

export async function createDraft30() {
  const operator = await getCurrentFlowOperator();

  const { data: existingBatch } = await db
    .from("flow_draft_batches")
    .select("*")
    .eq("operator_id", operator.id)
    .eq("status", "open")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existingBatch) return existingBatch;

  const [{ data: leads }, { data: claims }, { data: actions }, { data: observations }] = await Promise.all([
    db.from("leads").select("*").order("score", { ascending: false }).limit(1000),
    db.from("flow_work_claims").select("*").eq("state", "active"),
    db.from("next_actions").select("*").is("done_at", null).order("due_at", { ascending: true }).limit(2000),
    db.from("flow_screenshot_observations").select("*").not("lead_id", "is", null).order("captured_at", { ascending: false }).limit(3000),
  ]);

  const activeClaimByLead = new Map<string, any>((claims ?? []).map((c: any) => [c.lead_id, c]));
  const actionByLead = new Map<string, any>();
  for (const action of actions ?? []) if (!actionByLead.has(action.lead_id)) actionByLead.set(action.lead_id, action);
  const observationByLead = new Map<string, any>();
  for (const obs of observations ?? []) if (!observationByLead.has(obs.lead_id)) observationByLead.set(obs.lead_id, obs);

  const ranked = ((leads ?? []) as FlowLeadRow[])
    .filter((lead) => {
      const stage = (lead.pipeline_stage ?? "NEW").toUpperCase();
      if (["CHECKED_IN", "LOST"].includes(stage)) return false;
      const claim = activeClaimByLead.get(lead.id);
      if (claim && claim.operator_id !== operator.id && safeDate(claim.expires_at) > Date.now()) return false;
      return true;
    })
    .map((lead) => ({ lead, ...roiScore(lead, observationByLead.get(lead.id), actionByLead.get(lead.id)) }))
    .sort((a, b) => b.score - a.score);

  const { data: batch, error: batchError } = await db
    .from("flow_draft_batches")
    .insert({ operator_id: operator.id, operator_name: operator.name, target_size: 30, active_tray_size: 13 })
    .select("*")
    .single();
  if (batchError || !batch) throw batchError ?? new Error("Could not create Draft 30");

  let position = 1;
  for (const candidate of ranked) {
    if (position > 30) break;
    const { data: claimResult, error: claimError } = await db.rpc("flow_claim_lead", {
      p_lead_id: candidate.lead.id,
      p_operator_id: operator.id,
      p_operator_name: operator.name,
      p_batch_id: batch.id,
    });
    if (claimError) continue;
    const claim = Array.isArray(claimResult) ? claimResult[0] : claimResult;
    if (!claim?.ok) continue;

    const observation = observationByLead.get(candidate.lead.id);
    const suggestion = classifyLastMessage(observation?.last_message ?? candidate.lead.last_wa_message);
    await db.from("flow_draft_items").insert({
      batch_id: batch.id,
      lead_id: candidate.lead.id,
      position,
      roi_score: candidate.score,
      roi_reasons: candidate.reasons,
      state: position <= 13 ? "active" : "drafted",
      is_priority_interrupt: Boolean(observation?.unread_count > 0 && suggestion.shouldInterrupt),
    });
    position += 1;
  }

  return batch;
}

export async function loadOperatorWork(): Promise<OperatorWorkState> {
  const operator = await getCurrentFlowOperator();
  const { data: batch } = await db
    .from("flow_draft_batches")
    .select("*")
    .eq("operator_id", operator.id)
    .eq("status", "open")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!batch) {
    return { operator, myDraftCount: 0, activeTrayCount: 0, dueNowCount: 0, priorityInterruptCount: 0, items: [] };
  }

  const { data: items } = await db
    .from("flow_draft_items")
    .select("*")
    .eq("batch_id", batch.id)
    .order("position", { ascending: true });
  const leadIds = (items ?? []).map((i: any) => i.lead_id);
  if (leadIds.length === 0) {
    return { operator, batchId: batch.id, myDraftCount: 0, activeTrayCount: 0, dueNowCount: 0, priorityInterruptCount: 0, items: [] };
  }

  const [{ data: leads }, { data: claims }, { data: actions }, { data: observations }] = await Promise.all([
    db.from("leads").select("*").in("id", leadIds),
    db.from("flow_work_claims").select("*").in("lead_id", leadIds).eq("state", "active"),
    db.from("next_actions").select("*").in("lead_id", leadIds).is("done_at", null).order("due_at", { ascending: true }),
    db.from("flow_screenshot_observations").select("*").in("lead_id", leadIds).order("captured_at", { ascending: false }).limit(1000),
  ]);

  const leadById = new Map<string, FlowLeadRow>((leads ?? []).map((lead: FlowLeadRow) => [lead.id, lead]));
  const claimByLead = new Map<string, FlowWorkClaim>((claims ?? []).map((claim: FlowWorkClaim) => [claim.lead_id, claim]));
  const actionByLead = new Map<string, any>();
  for (const action of actions ?? []) if (!actionByLead.has(action.lead_id)) actionByLead.set(action.lead_id, action);
  const observationByLead = new Map<string, any>();
  for (const obs of observations ?? []) if (!observationByLead.has(obs.lead_id)) observationByLead.set(obs.lead_id, obs);

  const views: WorkItemView[] = (items ?? [])
    .map((item: any) => {
      const lead = leadById.get(item.lead_id);
      if (!lead) return null;
      const action = actionByLead.get(item.lead_id);
      return {
        itemId: item.id,
        batchId: batch.id,
        position: item.position,
        state: item.state,
        isPriorityInterrupt: Boolean(item.is_priority_interrupt),
        roiScore: Number(item.roi_score ?? 0),
        roiReasons: item.roi_reasons ?? [],
        lead,
        claim: claimByLead.get(item.lead_id),
        nextAction: action,
        latestObservation: observationByLead.get(item.lead_id),
        dueNow: Boolean(action?.due_at && safeDate(action.due_at) <= Date.now()),
        activeTray: item.state === "active" || item.position <= 13,
      } satisfies WorkItemView;
    })
    .filter(Boolean) as WorkItemView[];

  return {
    operator,
    batchId: batch.id,
    myDraftCount: views.filter((v) => !["done", "released", "passed"].includes(v.state)).length,
    activeTrayCount: views.filter((v) => v.activeTray && !["done", "released", "passed", "future"].includes(v.state)).length,
    dueNowCount: views.filter((v) => v.dueNow && v.state !== "done").length,
    priorityInterruptCount: views.filter((v) => v.isPriorityInterrupt && v.state !== "done").length,
    items: views,
  };
}

export async function confirmSuggestedStage(leadId: string, stage: string, mission?: string) {
  const operator = await getCurrentFlowOperator();
  const { error } = await db
    .from("leads")
    .update({
      pipeline_stage: stage,
      current_mission: mission ?? null,
      last_operator_action_at: isoNow(),
      sync_state: "confirmed",
    })
    .eq("id", leadId);
  if (error) throw error;

  await db.from("lead_timeline").insert({
    lead_id: leadId,
    activity: "flow_stage_confirmed",
    actor: operator.name,
    new_stage: stage,
    next_action: mission ?? null,
    detail: "Operator confirmed screenshot/last-message stage suggestion",
  });
}

export async function moveLeadToFuture(input: {
  leadId: string;
  itemId?: string;
  followUpAt: string;
  moveInDate?: string;
  reason: string;
  desiredOutcome: string;
}) {
  const operator = await getCurrentFlowOperator();
  await db.from("next_actions").insert({
    lead_id: input.leadId,
    owner_id: operator.id,
    kind: "future_follow_up",
    due_at: input.followUpAt,
    notes: `${input.reason} · Desired outcome: ${input.desiredOutcome}${input.moveInDate ? ` · Move-in: ${input.moveInDate}` : ""}`,
  });
  await db
    .from("leads")
    .update({
      pipeline_stage: "FUTURE",
      current_mission: `Follow up ${new Date(input.followUpAt).toLocaleDateString()}`,
      primary_blocker: input.reason,
      movein_date: input.moveInDate ?? null,
      last_operator_action_at: isoNow(),
    })
    .eq("id", input.leadId);
  if (input.itemId) await db.from("flow_draft_items").update({ state: "future", disposition: input.reason }).eq("id", input.itemId);

  const { data: claim } = await db.from("flow_work_claims").select("id").eq("lead_id", input.leadId).eq("operator_id", operator.id).eq("state", "active").maybeSingle();
  if (claim?.id) await db.rpc("flow_release_claim", { p_claim_id: claim.id, p_operator_id: operator.id, p_reason: "future" });
}

export async function completeAndNext(input: {
  leadId: string;
  itemId: string;
  disposition: string;
  stage?: string;
  nextAction?: string;
  nextActionAt?: string;
  blocker?: string;
}) {
  const operator = await getCurrentFlowOperator();
  if (!input.nextActionAt && !["BOOKED", "CHECKED_IN", "LOST"].includes((input.stage ?? "").toUpperCase())) {
    throw new Error("Every non-terminal lead needs a dated next action before Complete & Next.");
  }

  if (input.nextAction && input.nextActionAt) {
    await db.from("next_actions").insert({
      lead_id: input.leadId,
      owner_id: operator.id,
      kind: input.nextAction,
      due_at: input.nextActionAt,
      notes: input.disposition,
    });
  }

  await db
    .from("leads")
    .update({
      ...(input.stage ? { pipeline_stage: input.stage } : {}),
      ...(input.nextAction ? { current_mission: input.nextAction } : {}),
      primary_blocker: input.blocker ?? null,
      last_operator_action_at: isoNow(),
      sync_state: "operator_updated",
    })
    .eq("id", input.leadId);

  await db.from("flow_draft_items").update({ state: "done", disposition: input.disposition, completed_at: isoNow() }).eq("id", input.itemId);
  const { data: claim } = await db.from("flow_work_claims").select("id").eq("lead_id", input.leadId).eq("operator_id", operator.id).eq("state", "active").maybeSingle();
  if (claim?.id) await db.rpc("flow_release_claim", { p_claim_id: claim.id, p_operator_id: operator.id, p_reason: "completed" });

  await db.from("lead_timeline").insert({
    lead_id: input.leadId,
    activity: "complete_and_next",
    actor: operator.name,
    new_stage: input.stage ?? null,
    next_action: input.nextAction ?? null,
    deadline: input.nextActionAt ?? null,
    detail: input.disposition,
  });
}

export async function loadLabelColourMappings() {
  const { data, error } = await db.from("flow_label_colour_mapping").select("*").eq("active", true).order("colour_key");
  if (error) throw error;
  return data ?? [];
}

export async function saveLabelColourMapping(input: {
  colourKey: string;
  waLabelName?: string;
  crmLabel: string;
  suggestedStage?: string;
  suggestedMission?: string;
}) {
  const operator = await getCurrentFlowOperator();
  const { error } = await db.from("flow_label_colour_mapping").upsert(
    {
      colour_key: input.colourKey.trim().toLowerCase(),
      wa_label_name: input.waLabelName ?? null,
      crm_label: input.crmLabel,
      suggested_stage: input.suggestedStage ?? null,
      suggested_mission: input.suggestedMission ?? null,
      updated_by: operator.id,
      updated_at: isoNow(),
    },
    { onConflict: "colour_key" },
  );
  if (error) throw error;
}

export async function loadLeakageBuckets(): Promise<LeakageBucket[]> {
  const since3d = new Date(Date.now() - 3 * 86_400_000).toISOString();
  const [{ data: leads }, { data: observations }, { data: claims }, { data: actions }, { data: batches }] = await Promise.all([
    db.from("leads").select("*").order("updated_at", { ascending: false }).limit(5000),
    db.from("flow_screenshot_observations").select("*").gte("captured_at", since3d).order("captured_at", { ascending: false }).limit(10000),
    db.from("flow_work_claims").select("*").eq("state", "active"),
    db.from("next_actions").select("*").is("done_at", null).order("due_at", { ascending: true }).limit(10000),
    db.from("flow_screenshot_batches").select("*").gte("created_at", since3d).order("created_at", { ascending: false }),
  ]);

  const leadRows = (leads ?? []) as FlowLeadRow[];
  const obsRows = observations ?? [];
  const activeClaims = claims ?? [];
  const nextActions = actions ?? [];
  const claimByLead = new Map<string, any>(activeClaims.map((c: any) => [c.lead_id, c]));
  const actionByLead = new Map<string, any>();
  for (const action of nextActions) if (!actionByLead.has(action.lead_id)) actionByLead.set(action.lead_id, action);
  const latestObsByLead = new Map<string, any>();
  for (const obs of obsRows) if (obs.lead_id && !latestObsByLead.has(obs.lead_id)) latestObsByLead.set(obs.lead_id, obs);

  const whatsappOnly = obsRows.filter((o: any) => !o.lead_id && o.resolution !== "non_customer");
  const unresolved = obsRows.filter((o: any) => ["pending", "identity_review"].includes(o.resolution));
  const unowned = leadRows.filter((lead) => !lead.current_owner);
  const staleClaims = activeClaims.filter((claim: any) => safeDate(claim.expires_at) <= Date.now());
  const noNextAction = leadRows.filter((lead) => {
    const stage = (lead.pipeline_stage ?? "NEW").toUpperCase();
    if (["CHECKED_IN", "LOST"].includes(stage)) return false;
    if (claimByLead.has(lead.id)) return false;
    if (actionByLead.has(lead.id)) return false;
    return true;
  });
  const freshInboundUntouched = leadRows.filter((lead) => {
    const obs = latestObsByLead.get(lead.id);
    if (!obs) return false;
    const inbound = obs.preview_direction === "incoming" || obs.seen_state === "unseen" || Number(obs.unread_count ?? 0) > 0;
    return inbound && safeDate(obs.captured_at) > safeDate(lead.last_operator_action_at);
  });
  const qualifiedNoTour = leadRows.filter((lead) => ["DOSSIER", "MATCHED"].includes((lead.pipeline_stage ?? "").toUpperCase()) && classifyLastMessage(lead.last_wa_message).suggestedStage === "MATCHED");
  const tourNoPost = leadRows.filter((lead) => (lead.pipeline_stage ?? "").toUpperCase() === "TOUR_IN_PROGRESS" && safeDate(lead.last_operator_action_at) < Date.now() - 4 * 60 * 60 * 1000);
  const positiveNoQuote = leadRows.filter((lead) => (lead.pipeline_stage ?? "").toUpperCase() === "POST_VISIT" && classifyLastMessage(lead.last_wa_message).suggestedStage === "POST_VISIT");
  const paymentBookingGap = leadRows.filter((lead) => (lead.pipeline_stage ?? "").toUpperCase() === "NEGOTIATION" && /payment|token|upi|qr/i.test(lead.last_wa_message ?? ""));
  const checkInRisk = leadRows.filter((lead) => ["BOOKED", "CHECK_IN_READY"].includes((lead.pipeline_stage ?? "").toUpperCase()) && lead.movein_date && safeDate(lead.movein_date) <= Date.now() + 24 * 60 * 60 * 1000);
  const incompleteBatches = (batches ?? []).filter((b: any) => b.status !== "balanced");

  return [
    { key: "incomplete_batches", label: "Screenshot batches not fully reconciled", count: incompleteBatches.length, severity: "red", rows: incompleteBatches },
    { key: "whatsapp_only", label: "Visible in WhatsApp, not linked to CRM", count: whatsappOnly.length, severity: "red", rows: whatsappOnly },
    { key: "identity_review", label: "OCR / identity review", count: unresolved.length, severity: "amber", rows: unresolved },
    { key: "unowned", label: "CRM leads without owner", count: unowned.length, severity: "red", rows: unowned },
    { key: "stale_claims", label: "Stale work claims", count: staleClaims.length, severity: "amber", rows: staleClaims },
    { key: "fresh_inbound", label: "New inbound not acted on", count: freshInboundUntouched.length, severity: "red", rows: freshInboundUntouched },
    { key: "no_next_action", label: "No claim and no dated next action", count: noNextAction.length, severity: "red", rows: noNextAction },
    { key: "qualified_no_tour", label: "Qualified / tour-ready with no tour movement", count: qualifiedNoTour.length, severity: "amber", rows: qualifiedNoTour },
    { key: "tour_no_post", label: "Tour movement without post-tour closure", count: tourNoPost.length, severity: "red", rows: tourNoPost },
    { key: "positive_no_quote", label: "Positive post-tour / quote due", count: positiveNoQuote.length, severity: "red", rows: positiveNoQuote },
    { key: "payment_booking_gap", label: "Payment intent without completed booking", count: paymentBookingGap.length, severity: "red", rows: paymentBookingGap },
    { key: "checkin_risk", label: "Booked / check-in risk within 24h", count: checkInRisk.length, severity: "red", rows: checkInRisk },
  ];
}

export async function loadThreeDayTruthSummary() {
  const since3d = new Date(Date.now() - 3 * 86_400_000).toISOString();
  const [{ data: observations }, { data: batches }] = await Promise.all([
    db.from("flow_screenshot_observations").select("lead_id,phone_e164,resolution,captured_at").gte("captured_at", since3d).limit(20000),
    db.from("flow_screenshot_batches").select("*").gte("created_at", since3d).order("created_at", { ascending: false }),
  ]);
  const uniqueKeys = new Set((observations ?? []).map((o: any) => o.lead_id ?? o.phone_e164 ?? `unresolved:${o.resolution}:${o.captured_at}`));
  return {
    uniqueCustomers: uniqueKeys.size,
    observations: (observations ?? []).length,
    batches: (batches ?? []).length,
    balancedBatches: (batches ?? []).filter((b: any) => b.status === "balanced").length,
    unresolved: (observations ?? []).filter((o: any) => ["pending", "identity_review"].includes(o.resolution)).length,
  };
}
