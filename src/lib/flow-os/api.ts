import { supabase } from "@/integrations/supabase/client";

// New Flow OS tables may not exist in the generated Supabase types until the
// migration is applied/regenerated. Keep the unsafe cast at this boundary only.
const db = supabase as unknown as {
  from: (table: string) => any;
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: any; error: any }>;
};

export interface FlowLeadRow {
  id: string;
  name: string | null;
  wa_name: string | null;
  phone: string | null;
  phone_e164: string | null;
  pipeline_stage: string;
  current_owner: string | null;
  next_action_at: string | null;
  next_action_kind: string | null;
  movein_date: string | null;
  location_text: string | null;
  budget: number | null;
  score: number;
  last_whatsapp_preview: string | null;
  last_whatsapp_movement_at: string | null;
  last_seen_state: "seen" | "unseen" | "unknown" | null;
  last_color_cue: string | null;
  last_semantic_label: string | null;
  observed_handler_hint: string | null;
  canonical_handler_name: string | null;
  disposition: string | null;
}

export interface FlowClaimRow {
  id: string;
  lead_id: string;
  operator_id: string;
  batch_id: string | null;
  claim_state: "drafted" | "active" | "released" | "completed";
  bucket: string;
  claimed_at: string;
  last_meaningful_action_at: string;
  expires_at: string | null;
  next_action: string | null;
  next_action_at: string | null;
}

export interface ObservationRow {
  id: string;
  batch_id: string;
  screenshot_id: string;
  whatsapp_account: string | null;
  captured_at: string;
  contact_name: string | null;
  phone_e164: string | null;
  last_message_preview: string | null;
  visible_timestamp_raw: string | null;
  seen_state: "seen" | "unseen" | "unknown";
  unread_count: number | null;
  color_cue: string | null;
  raw_label_cue: string | null;
  semantic_label: string | null;
  observed_handler_hint: string | null;
  ocr_confidence: string;
  movement_signal: string | null;
  resolved_lead_id: string | null;
  resolution_type: string | null;
  review_state: string;
}

export async function listFlowLeads(limit = 300): Promise<FlowLeadRow[]> {
  const { data, error } = await db.from("leads")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function listRecentObservations(days = 3, limit = 1000): Promise<ObservationRow[]> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await db.from("screenshot_observations")
    .select("*")
    .gte("captured_at", since)
    .order("captured_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function listActiveClaims(): Promise<FlowClaimRow[]> {
  const { data, error } = await db.from("work_claims")
    .select("*")
    .in("claim_state", ["drafted", "active"])
    .order("claimed_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function listScreenshotBatches(limit = 20) {
  const { data, error } = await db.from("screenshot_batches")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function listOpenLeakageEvents(limit = 200) {
  const { data, error } = await db.from("reconciliation_events")
    .select("*")
    .is("resolved_at", null)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createDraft30(operatorId: string, size = 30): Promise<string> {
  const { data, error } = await db.rpc("create_draft_batch", {
    p_operator_id: operatorId,
    p_target_size: size,
    p_ttl_minutes: 10,
  });
  if (error) throw new Error(error.message);
  return data as string;
}

export async function releaseClaim(claimId: string, operatorId: string, reason: string) {
  const { data, error } = await db.rpc("release_claim", {
    p_claim_id: claimId,
    p_operator_id: operatorId,
    p_reason: reason,
  });
  if (error) throw new Error(error.message);
  return Boolean(data);
}

export async function confirmCheckin(checkinId: string, actorId?: string, overrideReason?: string) {
  const { data, error } = await db.rpc("confirm_checkin", {
    p_checkin_id: checkinId,
    p_actor: actorId ?? null,
    p_override_reason: overrideReason ?? null,
  });
  if (error) throw new Error(error.message);
  return Boolean(data);
}

export async function upsertLeadObservationSummary(leadId: string, patch: Partial<FlowLeadRow>) {
  const { error } = await db.from("leads").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", leadId);
  if (error) throw new Error(error.message);
}

export async function setFutureDisposition(input: {
  leadId: string;
  nextActionAt: string;
  nextActionKind: string;
  ownerId?: string | null;
}) {
  const patch = {
    disposition: "FUTURE",
    next_action_at: input.nextActionAt,
    next_action_kind: input.nextActionKind,
    ...(input.ownerId ? { current_owner: input.ownerId } : {}),
    updated_at: new Date().toISOString(),
  };
  const { error } = await db.from("leads").update(patch).eq("id", input.leadId);
  if (error) throw new Error(error.message);
  const { error: actionError } = await db.from("next_actions").insert({
    lead_id: input.leadId,
    owner_id: input.ownerId ?? null,
    kind: input.nextActionKind,
    due_at: input.nextActionAt,
    notes: "Future disposition from Flow OS",
  });
  if (actionError) throw new Error(actionError.message);
}
