import { supabase } from "@/integrations/supabase/client";
import { normalizePhoneIN } from "@/lib/lead-identity/normalize";
import { getTruthRow, type TruthRow } from "@/lib/flow-os/service";

const db = supabase as any;

export type DirectLeadInput = {
  name: string;
  phone: string;
  locationText?: string;
  moveInDate?: string;
  source?: string;
};

export type LeadProfilePatch = {
  name?: string | null;
  locationText?: string | null;
  moveInDate?: string | null;
  currentMission?: string | null;
  primaryBlocker?: string | null;
};

async function requireUser() {
  const { data, error } = await db.auth.getUser();
  if (error) throw error;
  if (!data.user) throw new Error("Sign in required");
  return data.user;
}

export async function createOrOpenCanonicalLead(input: DirectLeadInput): Promise<{ lead: TruthRow; created: boolean }> {
  const user = await requireUser();
  const phone = normalizePhoneIN(input.phone);
  if (!phone) throw new Error("Enter a valid customer phone number");

  const existing = await db.from("leads").select("id").eq("phone", phone).maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data?.id) {
    const lead = await getTruthRow(existing.data.id);
    if (!lead) throw new Error("Existing canonical lead could not be loaded");
    return { lead, created: false };
  }

  const now = new Date().toISOString();
  const inserted = await db.from("leads").insert({
    phone,
    wa_name: input.name.trim() || null,
    location_text: input.locationText?.trim() || null,
    movein_date: input.moveInDate || null,
    zone_id: null,
    movein_bucket: null,
    location_score: 0,
    movein_score: 0,
    score: 0,
    priority: "active",
    current_owner: user.id,
    status: "open",
    current_pipeline_stage: "DOSSIER",
    current_mission: "Complete requirement dossier and move to a verified property match",
    primary_blocker: null,
    last_operator_action_at: now,
    lead_source: input.source || "lead_os_direct",
    updated_at: now,
  }).select("id").single();

  if (inserted.error) {
    if (String(inserted.error.code || "") === "23505") {
      const raced = await db.from("leads").select("id").eq("phone", phone).maybeSingle();
      if (raced.data?.id) {
        const lead = await getTruthRow(raced.data.id);
        if (lead) return { lead, created: false };
      }
    }
    throw inserted.error;
  }

  const leadId = inserted.data.id as string;
  const cycle = await db.from("lead_cycles").insert({
    lead_id: leadId,
    cycle_no: 1,
    open_reason: "lead_os_direct_intake",
  });
  if (cycle.error) throw cycle.error;

  const next = await db.from("next_actions").insert({
    lead_id: leadId,
    owner_id: user.id,
    kind: "Complete requirement dossier",
    due_at: now,
    notes: "Created from End-to-End Lead OS",
    source: "lead_os_direct",
    status: "open",
    priority: "high",
    created_by: user.id,
  });
  if (next.error) throw next.error;

  const lead = await getTruthRow(leadId);
  if (!lead) throw new Error("Lead created but canonical truth row is unavailable");
  return { lead, created: true };
}

export async function updateCanonicalLeadProfile(leadId: string, patch: LeadProfilePatch): Promise<TruthRow> {
  await requireUser();
  const now = new Date().toISOString();
  const update: Record<string, unknown> = {
    last_operator_action_at: now,
    updated_at: now,
  };
  if (patch.name !== undefined) update.wa_name = patch.name?.trim() || null;
  if (patch.locationText !== undefined) update.location_text = patch.locationText?.trim() || null;
  if (patch.moveInDate !== undefined) update.movein_date = patch.moveInDate || null;
  if (patch.currentMission !== undefined) update.current_mission = patch.currentMission?.trim() || null;
  if (patch.primaryBlocker !== undefined) update.primary_blocker = patch.primaryBlocker?.trim() || null;

  const result = await db.from("leads").update(update).eq("id", leadId).select("id").single();
  if (result.error) throw result.error;
  const lead = await getTruthRow(leadId);
  if (!lead) throw new Error("Lead profile saved but canonical truth row is unavailable");
  return lead;
}
