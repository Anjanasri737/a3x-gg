import { supabase } from "@/integrations/supabase/client";

const db = supabase as any;

export interface JourneyStep {
  code: string;
  ordinal: number;
  name: string;
  purpose: string;
  done_when: string;
  owner_role: string;
}

export interface LibraryBucket {
  bucket: string;
  family: string;
  expected_direction: string | null;
  waiting_on: string | null;
  stage: string | null;
  default_next_action: string | null;
  sla_min: number | null;
  priority: string | null;
  movement_effect: string | null;
  rule_confidence: number | null;
  observed_count: number;
  example_1: string | null;
  example_2: string | null;
  example_3: string | null;
  rule_reason: string | null;
  journey_step: string | null;
}

export interface LibraryRow {
  row_id: string;
  zone: string | null;
  screenshot: string | null;
  capture_date: string | null;
  display_contact: string | null;
  phone_e164: string | null;
  identity_status: string | null;
  visible_time: string | null;
  last_message: string | null;
  labels_ocr: string | null;
  direction: string | null;
  ocr_confidence: number | null;
  confidence_band: string | null;
  bucket: string | null;
  next_action: string | null;
  waiting_on: string | null;
  priority: string | null;
  lead_id: string | null;
}

export interface JourneyProgress {
  lead_id: string;
  step_code: string;
  status: "done" | "current" | "pending";
  evidence: string | null;
  at: string | null;
}

export async function listJourneySteps(): Promise<JourneyStep[]> {
  const { data, error } = await db.from("lead_journey_steps").select("*").order("ordinal");
  if (error) throw error;
  return data ?? [];
}

export async function listLibraryBuckets(): Promise<LibraryBucket[]> {
  const { data, error } = await db
    .from("conversation_library_buckets")
    .select("*")
    .order("observed_count", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function listLibraryRows(options: { bucket?: string; leadId?: string; limit?: number } = {}): Promise<LibraryRow[]> {
  let query = db.from("conversation_library_rows").select("*").order("capture_date", { ascending: false });
  if (options.bucket) query = query.eq("bucket", options.bucket);
  if (options.leadId) query = query.eq("lead_id", options.leadId);
  const { data, error } = await query.limit(options.limit ?? 300);
  if (error) throw error;
  return data ?? [];
}

export async function listJourneyProgress(leadId: string): Promise<JourneyProgress[]> {
  const { data, error } = await db
    .from("lead_journey_progress")
    .select("*")
    .eq("lead_id", leadId);
  if (error) throw error;
  return data ?? [];
}

export async function listJourneyProgressCounts(): Promise<Record<string, number>> {
  const { data, error } = await db.from("leads").select("journey_step").not("journey_step", "is", null);
  if (error) throw error;
  const counts: Record<string, number> = {};
  for (const row of data ?? []) counts[row.journey_step] = (counts[row.journey_step] || 0) + 1;
  return counts;
}

export interface LeadOpsRow {
  id: string;
  wa_name: string | null;
  phone: string | null;
  status: string | null;
  current_owner: string | null;
  current_pipeline_stage: string | null;
  conversation_bucket: string | null;
  journey_step: string | null;
  journey_step_index: number | null;
  library_rows_count: number | null;
  latest_whatsapp_preview: string | null;
  latest_whatsapp_observation_at: string | null;
  last_operator_action_at: string | null;
  updated_at: string | null;
}

export async function listLeadOpsRows(limit = 2000): Promise<LeadOpsRow[]> {
  const { data, error } = await db
    .from("leads")
    .select(
      "id,wa_name,phone,status,current_owner,current_pipeline_stage,conversation_bucket,journey_step,journey_step_index,library_rows_count,latest_whatsapp_preview,latest_whatsapp_observation_at,last_operator_action_at,updated_at",
    )
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

/** Find the one canonical customer behind a number seen in a screenshot. */
export async function findLeadOpsRowByPhone(phoneRaw: string): Promise<LeadOpsRow | null> {
  const digits = (phoneRaw || "").replace(/\D/g, "").slice(-10);
  if (digits.length < 10) return null;
  const { data, error } = await db
    .from("leads")
    .select(
      "id,wa_name,phone,status,current_owner,current_pipeline_stage,conversation_bucket,journey_step,journey_step_index,library_rows_count,latest_whatsapp_preview,latest_whatsapp_observation_at,last_operator_action_at,updated_at",
    )
    .like("phone", `%${digits}`)
    .limit(1);
  if (error) throw error;
  return data?.[0] ?? null;
}

export interface LeadJourneyMeta {
  journey_step: string | null;
  journey_step_index: number | null;
  conversation_bucket: string | null;
  library_rows_count: number | null;
}

export async function listLeadJourneyMap(): Promise<Record<string, LeadJourneyMeta>> {
  const { data, error } = await db
    .from("leads")
    .select("id,journey_step,journey_step_index,conversation_bucket,library_rows_count")
    .limit(2000);
  if (error) throw error;
  const map: Record<string, LeadJourneyMeta> = {};
  for (const row of data ?? []) {
    map[row.id] = {
      journey_step: row.journey_step,
      journey_step_index: row.journey_step_index,
      conversation_bucket: row.conversation_bucket,
      library_rows_count: row.library_rows_count,
    };
  }
  return map;
}
