import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { normalizePhoneIN } from "@/lib/lead-identity/normalize";
import { inferMessageIntelligence } from "@/lib/flow-os/message-intelligence";
import type { ObservationRecord } from "./types";

const ResolveInput = z.object({
  observationId: z.string().uuid(),
  contactName: z.string().max(200).nullable().optional(),
  phoneRaw: z.string().max(60).nullable().optional(),
  lastMessagePreview: z.string().max(2000).nullable().optional(),
  seenState: z.enum(["seen", "unseen", "unknown"]).optional(),
  colorHint: z.string().max(120).nullable().optional(),
  detectedLabel: z.string().max(120).nullable().optional(),
  handlerHint: z.string().max(200).nullable().optional(),
  mode: z.enum(["resolve", "non_customer"]).default("resolve"),
  reason: z.string().max(500).nullable().optional(),
});

async function nextCycleNo(admin: any, leadId: string) {
  const { data } = await admin.from("lead_cycles").select("cycle_no").eq("lead_id", leadId).order("cycle_no", { ascending: false }).limit(1).maybeSingle();
  return Number(data?.cycle_no ?? 0) + 1;
}

export const resolveVisionObservation = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => ResolveInput.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const { data: existingObs, error: obsError } = await admin.from("screenshot_observations").select("*").eq("id", data.observationId).maybeSingle();
    if (obsError || !existingObs) throw new Error("Observation not found");

    if (data.mode === "non_customer") {
      const reason = data.reason?.trim();
      if (!reason || reason.length < 3) throw new Error("A specific non-customer reason is required");
      const { data: updated, error } = await admin.from("screenshot_observations").update({
        operator_edited: true,
        lead_id: null,
        reconciliation_state: "non_customer",
        reconciliation_reason: reason,
      }).eq("id", data.observationId).select("*").single();
      if (error) throw new Error(error.message);
      return updated as ObservationRecord;
    }

    const contactName = (data.contactName ?? existingObs.contact_name ?? "").trim();
    const phoneRaw = (data.phoneRaw ?? existingObs.phone_raw ?? "").trim();
    const normalized = normalizePhoneIN(phoneRaw);
    if (!normalized) throw new Error("A valid phone number is required to resolve this WhatsApp row safely");

    let { data: lead } = await admin.from("leads").select("*").eq("phone", normalized).maybeSingle();
    let reconciliationState = "matched_existing";
    let reconciliationReason = "Corrected phone matched canonical CRM customer";

    if (!lead) {
      const insert = await admin.from("leads").insert({
        phone: normalized,
        wa_name: contactName || null,
        location_text: null,
        movein_bucket: null,
        movein_date: null,
        location_score: 0,
        movein_score: 0,
        score: existingObs.unread_visible ? 20 : 0,
        priority: existingObs.unread_visible ? "hot" : "active",
        current_owner: null,
        status: "open",
        current_pipeline_stage: "DOSSIER",
        latest_whatsapp_observation_at: existingObs.captured_at ?? new Date().toISOString(),
        latest_whatsapp_preview: data.lastMessagePreview ?? existingObs.last_message_preview ?? null,
        whatsapp_seen_state: data.seenState ?? existingObs.seen_state ?? "unknown",
        lead_source: "whatsapp_screenshot_review",
      }).select("*").single();
      if (insert.error) throw new Error(`Could not create canonical CRM customer: ${insert.error.message}`);
      lead = insert.data;
      reconciliationState = "new_customer";
      reconciliationReason = "Missing WhatsApp customer created in the canonical CRM after review";
      const cycleNo = await nextCycleNo(admin, lead.id);
      await admin.from("lead_cycles").insert({ lead_id: lead.id, cycle_no: cycleNo, open_reason: "screenshot_review_resolved" });
    } else if (["LOST"].includes(String(lead.current_pipeline_stage ?? "").toUpperCase()) && existingObs.unread_visible) {
      const cycleNo = await nextCycleNo(admin, lead.id);
      await admin.from("lead_cycles").insert({ lead_id: lead.id, cycle_no: cycleNo, open_reason: "returning_whatsapp_inbound" });
      await admin.from("leads").update({ status: "open", current_pipeline_stage: "DOSSIER" }).eq("id", lead.id);
      reconciliationState = "returning_cycle";
      reconciliationReason = "Fresh WhatsApp inbound reopened a previously lost customer as a new cycle";
      lead.current_pipeline_stage = "DOSSIER";
    }

    const lastMessage = data.lastMessagePreview ?? existingObs.last_message_preview ?? "";
    const seenState = data.seenState ?? existingObs.seen_state ?? "unknown";
    const colorHint = data.colorHint ?? existingObs.color_hint ?? null;
    const detectedLabel = data.detectedLabel ?? existingObs.detected_label ?? null;
    const intelligence = inferMessageIntelligence({
      lastMessage,
      direction: existingObs.preview_direction ?? "unknown",
      unreadVisible: existingObs.unread_visible ?? false,
      seenState,
      colorHint,
      detectedLabel,
      savedStage: lead.current_pipeline_stage ?? null,
    });

    const patch = {
      operator_edited: true,
      contact_name: contactName || null,
      phone_raw: phoneRaw,
      phone_normalized: normalized,
      lead_id: lead.id,
      last_message_preview: lastMessage || null,
      seen_state: seenState,
      color_hint: colorHint,
      whatsapp_row_color: colorHint,
      detected_label: detectedLabel,
      handler_hint: data.handlerHint ?? existingObs.handler_hint ?? null,
      stage_inference: intelligence.inferredPipelineHint,
      stage_confidence: intelligence.confidence,
      work_bucket: intelligence.inferredWorkBucket,
      primary_mission: intelligence.primaryMission,
      blocker_hint: intelligence.blockerHint,
      reconciliation_state: reconciliationState,
      reconciliation_reason: data.reason?.trim() || reconciliationReason,
      movement_signal: intelligence.isPriorityInterrupt ? "PRIORITY_INTERRUPT" : (existingObs.movement_signal ?? "OBSERVED"),
      intelligence: { reasons: intelligence.reasons, primaryAction: intelligence.primaryAction, advisoryOnly: true, resolvedAfterReview: true },
    };
    const { data: updated, error } = await admin.from("screenshot_observations").update(patch).eq("id", data.observationId).select("*").single();
    if (error) throw new Error(`Could not resolve observation: ${error.message}`);

    // Passive screenshot truth updates evidence fields only. It deliberately
    // does NOT touch leads.updated_at or last_operator_action_at.
    await admin.from("leads").update({
      latest_whatsapp_observation_at: existingObs.captured_at ?? new Date().toISOString(),
      latest_whatsapp_preview: lastMessage || null,
      whatsapp_seen_state: seenState,
      inferred_stage: intelligence.inferredPipelineHint,
      inferred_label: detectedLabel,
      whatsapp_sync_state: intelligence.inferredPipelineHint && lead.current_pipeline_stage && intelligence.inferredPipelineHint !== lead.current_pipeline_stage ? "AMBER" : "GREEN",
    }).eq("id", lead.id);

    return updated as ObservationRecord;
  });
