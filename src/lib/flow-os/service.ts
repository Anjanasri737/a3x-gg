import { supabase } from "@/integrations/supabase/client";
import { normalizePhoneIN } from "@/lib/lead-identity/normalize";
import { compileConversationState, compilationAsIntelligence } from "./conversation-state-compiler";
import { reconcileCounts, type LabelRule } from "./reconciliation";
import { selectDraftPortfolio } from "./drafting-algorithm";

const db = supabase as unknown as {
  from: (table: string) => any;
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: any; error: any }>;
  auth: typeof supabase.auth;
};

export interface ManualObservationInput {
  contactName: string;
  phone: string;
  lastMessage: string;
  direction: "incoming" | "outgoing" | "unknown";
  seenState: "seen" | "unseen" | "unknown";
  unreadVisible: boolean;
  unreadCount?: number | null;
  colorHint?: string | null;
  detectedLabel?: string | null;
  handlerHint?: string | null;
  timestampRaw?: string | null;
  rawText?: string;
}

export interface TruthRow {
  lead_id: string;
  phone: string;
  wa_name: string | null;
  location_text?: string | null;
  movein_date?: string | null;
  lead_source?: string | null;
  opportunity_score?: number | null;
  current_owner: string | null;
  current_owner_name?: string | null;
  current_pipeline_stage: string | null;
  current_mission?: string | null;
  primary_blocker?: string | null;
  last_operator_action_at?: string | null;
  lead_status: string;
  priority: string | null;
  latest_observation_at: string | null;
  last_message_preview: string | null;
  preview_direction: string | null;
  unread_visible: boolean | null;
  unread_count: number | null;
  seen_state: string | null;
  color_hint: string | null;
  detected_label: string | null;
  handler_hint: string | null;
  stage_inference: string | null;
  stage_confidence: number | null;
  claim_id: string | null;
  current_handler: string | null;
  current_handler_name?: string | null;
  reservation_operator?: string | null;
  reservation_operator_name?: string | null;
  claim_state: string | null;
  claim_expires_at: string | null;
  current_batch_id?: string | null;
  next_action_id: string | null;
  next_action_kind: string | null;
  next_action_at: string | null;
  sync_state: "GREEN" | "AMBER" | "RED" | "GREY";
}

export interface ScreenshotBatchSummary {
  id: string;
  screenshot_count: number;
  visible_rows_expected: number;
  rows_segmented: number;
  rows_reconciled: number;
  unresolved_count: number;
  status: string;
  uploaded_at: string;
  whatsapp_account?: string | null;
}

export async function currentUserId() {
  const { data } = await db.auth.getUser();
  return data.user?.id ?? null;
}

export async function currentOperator() {
  const { data } = await db.auth.getUser();
  const user = data.user;
  if (!user) throw new Error("Sign in required");
  return {
    id: user.id,
    name: user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split("@")[0] || "Operator",
    email: user.email ?? undefined,
  };
}

export async function listScreenshotBatches(limit = 20): Promise<ScreenshotBatchSummary[]> {
  const { data, error } = await db.from("screenshot_batches").select("*").order("uploaded_at", { ascending: false }).limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function listTruthRows(): Promise<TruthRow[]> {
  const { data, error } = await db.from("flow_three_day_truth").select("*").order("latest_observation_at", { ascending: false, nullsFirst: false });
  if (error) throw error;
  return (data ?? []) as TruthRow[];
}

export async function getTruthRow(leadId: string): Promise<TruthRow | null> {
  const { data, error } = await db.from("flow_three_day_truth").select("*").eq("lead_id", leadId).maybeSingle();
  if (error) throw error;
  return (data ?? null) as TruthRow | null;
}

export async function listLabelRules(): Promise<LabelRule[]> {
  const { data, error } = await db.from("flow_label_rules").select("*").eq("is_enabled", true).order("rank", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    id: r.id,
    whatsappAccount: r.whatsapp_account,
    colorHint: r.color_hint,
    seenState: r.seen_state,
    textPattern: r.text_pattern,
    inferredLabel: r.inferred_label,
    inferredPriority: r.inferred_priority,
    inferredBucket: r.inferred_bucket,
    rank: r.rank,
    isEnabled: r.is_enabled,
  }));
}

export async function createLabelRule(rule: Omit<LabelRule, "id">) {
  const uid = await currentUserId();
  const { data, error } = await db.from("flow_label_rules").insert({
    whatsapp_account: rule.whatsappAccount ?? null,
    color_hint: rule.colorHint ?? null,
    seen_state: rule.seenState ?? null,
    text_pattern: rule.textPattern ?? null,
    inferred_label: rule.inferredLabel,
    inferred_priority: rule.inferredPriority ?? null,
    inferred_bucket: rule.inferredBucket ?? null,
    rank: rule.rank ?? 100,
    is_enabled: rule.isEnabled !== false,
    name: `${rule.inferredLabel} rule`,
    created_by: uid,
  }).select("*").single();
  if (error) throw error;
  return data;
}

async function findLeadByPhone(phone: string) {
  const normalized = normalizePhoneIN(phone);
  if (!normalized) return null;
  const { data } = await db.from("leads").select("*").eq("phone", normalized).maybeSingle();
  return data ?? null;
}

async function createCanonicalLead(input: ManualObservationInput) {
  const phone = normalizePhoneIN(input.phone);
  const { data, error } = await db.from("leads").insert({
    phone,
    wa_name: input.contactName || null,
    location_text: null,
    zone_id: null,
    movein_bucket: null,
    movein_date: null,
    location_score: 0,
    movein_score: 0,
    score: input.unreadVisible ? 20 : 0,
    priority: input.unreadVisible ? "hot" : "active",
    status: "open",
    current_pipeline_stage: "DOSSIER",
    latest_whatsapp_observation_at: new Date().toISOString(),
    latest_whatsapp_preview: input.lastMessage || null,
    whatsapp_seen_state: input.seenState,
  }).select("*").single();
  if (error) throw error;
  await db.from("lead_cycles").insert({ lead_id: data.id, cycle_no: 1, open_reason: "screenshot_first_seen" });
  return data;
}

export async function ingestManualBatch(params: {
  whatsappAccount: string;
  screenshotNames: string[];
  visibleRowsExpected: number;
  rows: ManualObservationInput[];
}) {
  const uid = await currentUserId();
  const now = new Date().toISOString();
  const { data: batch, error: batchError } = await db.from("screenshot_batches").insert({
    uploader_id: uid,
    whatsapp_account: params.whatsappAccount || null,
    capture_window_start: new Date(Date.now() - 3 * 24 * 3600_000).toISOString(),
    capture_window_end: now,
    screenshot_count: params.screenshotNames.length,
    visible_rows_expected: params.visibleRowsExpected,
    rows_segmented: params.rows.length,
    status: "processing",
    metadata: { mode: "manual-review-adapter", screenshotNames: params.screenshotNames },
  }).select("*").single();
  if (batchError) throw batchError;

  const screenshots: any[] = [];
  for (const [i, name] of params.screenshotNames.entries()) {
    const { data: shot, error } = await db.from("whatsapp_screenshots").insert({
      batch_id: batch.id,
      whatsapp_account: params.whatsappAccount || null,
      image_hash: null,
      captured_at: now,
      visible_row_count: i === 0 ? params.visibleRowsExpected : 0,
      processing_status: "parsed",
      raw_ocr_summary: { fileName: name, adapter: "manual-review" },
    }).select("*").single();
    if (error) throw error;
    screenshots.push(shot);
  }
  if (!screenshots.length) {
    const { data: shot, error } = await db.from("whatsapp_screenshots").insert({
      batch_id: batch.id,
      whatsapp_account: params.whatsappAccount || null,
      captured_at: now,
      visible_row_count: params.visibleRowsExpected,
      processing_status: "parsed",
      raw_ocr_summary: { fileName: "manual", adapter: "manual-review" },
    }).select("*").single();
    if (error) throw error;
    screenshots.push(shot);
  }

  const states: string[] = [];
  let unresolved = 0;
  let rowIndex = 0;
  for (const row of params.rows) {
    const normalized = normalizePhoneIN(row.phone);
    let lead = normalized ? await findLeadByPhone(normalized) : null;
    let reconciliationState = "needs_review";
    let reason = "Phone/identity requires review";

    if (normalized) {
      if (lead) {
        reconciliationState = "matched_existing";
        reason = "Normalized phone matched existing CRM lead";
      } else {
        lead = await createCanonicalLead(row);
        reconciliationState = "new_customer";
        reason = "Visible WhatsApp customer was absent from CRM and was created";
      }
    } else {
      unresolved += 1;
    }

    const savedStage = lead?.current_pipeline_stage ?? null;
    const compiled = compileConversationState({
      lastMessage: row.lastMessage,
      rawText: row.rawText,
      direction: row.direction,
      unreadVisible: row.unreadVisible,
      seenState: row.seenState,
      colorHint: row.colorHint,
      detectedLabel: row.detectedLabel,
      savedStage,
    });
    const intelligence = compiled.legacy;
    const screenshot = screenshots[rowIndex % screenshots.length];
    const { data: obs, error: obsError } = await db.from("screenshot_observations").insert({
      screenshot_id: screenshot.id,
      batch_id: batch.id,
      whatsapp_account: params.whatsappAccount || null,
      row_index: rowIndex,
      contact_name: row.contactName || null,
      phone_raw: row.phone || null,
      phone_normalized: normalized || null,
      lead_id: lead?.id ?? null,
      visible_timestamp_raw: row.timestampRaw ?? null,
      last_message_preview: row.lastMessage || null,
      preview_direction: row.direction,
      unread_visible: row.unreadVisible,
      unread_count: row.unreadCount ?? null,
      seen_state: row.seenState,
      color_hint: row.colorHint ?? null,
      detected_label: row.detectedLabel ?? null,
      handler_hint: row.handlerHint ?? null,
      stage_inference: intelligence.inferredPipelineHint,
      stage_confidence: compiled.confidence,
      ocr_confidence: 100,
      raw_text: row.rawText || [row.contactName, row.phone, row.lastMessage].filter(Boolean).join(" | "),
      captured_at: now,
      reconciliation_state: reconciliationState,
      reconciliation_reason: reason,
      movement_signal: intelligence.isPriorityInterrupt ? "PRIORITY_INTERRUPT" : "OBSERVED",
      work_bucket: intelligence.inferredWorkBucket,
      primary_mission: intelligence.primaryMission,
      blocker_hint: compiled.blocker,
      intelligence: compilationAsIntelligence(compiled),
    }).select("*").single();
    if (obsError) throw obsError;
    states.push(reconciliationState);

    if (lead) {
      const syncState = row.unreadVisible && !lead.current_owner
        ? "RED"
        : intelligence.inferredPipelineHint && savedStage && intelligence.inferredPipelineHint !== savedStage
          ? "AMBER"
          : "GREEN";
      // Screenshot evidence is passive truth. Do not update leads.updated_at or
      // last_operator_action_at: OCR must never masquerade as human CRM work.
      await db.from("leads").update({
        latest_whatsapp_observation_at: now,
        latest_whatsapp_preview: row.lastMessage || null,
        whatsapp_seen_state: row.seenState,
        inferred_stage: intelligence.inferredPipelineHint,
        inferred_label: row.detectedLabel ?? null,
        whatsapp_sync_state: syncState,
      }).eq("id", lead.id);
      if (intelligence.isPriorityInterrupt && lead.current_owner) {
        await db.from("next_actions").insert({
          lead_id: lead.id,
          owner_id: lead.current_owner,
          kind: intelligence.primaryAction,
          due_at: now,
          notes: `Priority interrupt from WhatsApp: ${row.lastMessage}`,
          source: "screenshot_sync",
          triggered_by_observation_id: obs.id,
          status: "open",
          priority: "high",
          created_by: uid,
        });
      }
    }
    rowIndex += 1;
  }

  const counts = reconcileCounts(params.visibleRowsExpected, states as any);
  const status = counts.complete ? (unresolved ? "review" : "complete") : "incomplete";
  const { error: finishError } = await db.from("screenshot_batches").update({
    rows_segmented: params.rows.length,
    rows_reconciled: counts.resolved + counts.nonCustomer,
    unresolved_count: counts.review,
    status,
    updated_at: new Date().toISOString(),
    metadata: {
      mode: "manual-review-adapter",
      screenshotNames: params.screenshotNames,
      silentDrops: counts.silentDrops,
      accounted: counts.resolved + counts.review + counts.nonCustomer,
    },
  }).eq("id", batch.id);
  if (finishError) throw finishError;
  return { batchId: batch.id, counts, unresolved, status };
}

export async function reserveLead(leadId: string, bucket = "TODAY", batchId: string, nextAction?: string | null, nextActionAt?: string | null) {
  const uid = await currentUserId();
  if (!uid) throw new Error("Sign in required to reserve a lead");
  const { data, error } = await db.rpc("reserve_flow_lead", {
    _lead_id: leadId,
    _operator_id: uid,
    _batch_id: batchId,
    _bucket: bucket,
    _next_action: nextAction ?? null,
    _next_action_at: nextActionAt ?? null,
  });
  if (error) throw error;
  return data;
}

export async function claimLead(leadId: string, bucket = "TODAY", batchId?: string | null, nextAction?: string | null, nextActionAt?: string | null) {
  const uid = await currentUserId();
  if (!uid) throw new Error("Sign in required to claim a lead");
  const { data, error } = await db.rpc("claim_flow_lead", {
    _lead_id: leadId,
    _operator_id: uid,
    _batch_id: batchId ?? null,
    _bucket: bucket,
    _ttl_minutes: 10,
    _next_action: nextAction ?? null,
    _next_action_at: nextActionAt ?? null,
  });
  if (error) throw error;
  return data;
}

export async function touchClaim(claimId: string) {
  const { data, error } = await db.rpc("touch_flow_claim", { _claim_id: claimId, _ttl_minutes: 10 });
  if (error) throw error;
  return data;
}

export async function releaseClaim(claimId: string, reason = "completed") {
  const { error } = await db.rpc("release_flow_claim", { _claim_id: claimId, _reason: reason });
  if (error) throw error;
}

async function getOrCreateActiveDraft(uid: string, targetSize: number) {
  const { data: existing, error: existingError } = await db.from("draft_batches")
    .select("*").eq("operator_id", uid).eq("status", "active")
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (existingError) throw existingError;
  if (existing) return existing;
  const { data: batch, error } = await db.from("draft_batches").insert({
    operator_id: uid,
    target_size: targetSize,
    status: "active",
    metadata: { createdBy: "flow-os-10x", algorithm: "roi-soft-balanced-v1" },
  }).select("*").single();
  if (error) throw error;
  return batch;
}

export async function createDraft30(targetSize = 30) {
  const uid = await currentUserId();
  if (!uid) throw new Error("Sign in required");
  const target = Math.max(1, Math.min(60, targetSize));
  const batch = await getOrCreateActiveDraft(uid, target);

  const { data: existingItems, error: itemError } = await db.from("draft_batch_items")
    .select("*").eq("batch_id", batch.id).in("status", ["active", "queued"])
    .order("rank", { ascending: true });
  if (itemError) throw itemError;
  const existingIds = new Set((existingItems ?? []).map((i: any) => i.lead_id));
  const needed = Math.max(0, target - existingIds.size);

  if (needed > 0) {
    const truth = await listTruthRows();
    const eligible = truth.filter((r) => {
      if (["CHECKED_IN", "LOST"].includes(String(r.current_pipeline_stage || r.lead_status).toUpperCase())) return false;
      if (existingIds.has(r.lead_id)) return false;
      const reservation = r.reservation_operator ?? (r.claim_state === "drafted" ? r.current_handler : null);
      return !reservation || reservation === uid;
    });
    const portfolio = selectDraftPortfolio(eligible, Math.max(target, needed));
    let nextRank = (existingItems ?? []).reduce((max: number, i: any) => Math.max(max, Number(i.rank) || 0), 0);
    let added = 0;

    for (const candidate of portfolio) {
      if (added >= needed) break;
      try {
        const claim = await reserveLead(
          candidate.row.lead_id,
          candidate.intelligence.inferredWorkBucket,
          batch.id,
          candidate.intelligence.primaryAction,
          candidate.row.next_action_at,
        );
        nextRank += 1;
        const { error } = await db.from("draft_batch_items").insert({
          batch_id: batch.id,
          lead_id: candidate.row.lead_id,
          work_claim_id: claim?.id ?? claim?.[0]?.id ?? null,
          rank: nextRank,
          mission: candidate.intelligence.primaryMission,
          why_now: candidate.why.join(" · "),
          score: candidate.score,
          status: nextRank <= 13 ? "active" : "queued",
        });
        if (!error) {
          existingIds.add(candidate.row.lead_id);
          added += 1;
        }
      } catch {
        // The database unique claim is the final collision barrier. Another
        // operator won the race; continue until this batch is filled.
      }
    }
  }

  return loadMyActiveDraft();
}

export async function loadMyActiveDraft() {
  const uid = await currentUserId();
  if (!uid) return null;
  const { data: batch } = await db.from("draft_batches").select("*").eq("operator_id", uid).eq("status", "active").order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!batch) return null;
  const { data: items, error } = await db.from("draft_batch_items").select("*").eq("batch_id", batch.id).order("rank", { ascending: true });
  if (error) throw error;
  const truth = await listTruthRows();
  const truthMap = new Map(truth.map((r) => [r.lead_id, r]));
  return { batch, items: (items ?? []).map((i: any) => ({ ...i, lead: truthMap.get(i.lead_id) })) };
}
