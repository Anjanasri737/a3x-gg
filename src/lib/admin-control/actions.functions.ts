// Admin actions from the control room: fix ownership, set a next action,
// escalate to Control Tower, or resolve a screenshot row. Every change is
// written to the audit history so nothing is silent.
import { createServerFn } from "@tanstack/react-start";

type Base = { leadId: string; by?: string | null; reason?: string | null };

const actor = (v?: string | null) => (v || "Admin control").slice(0, 80);

async function audit(entity: string, entityId: string, action: string, by: string, reason?: string | null) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.from("audit_logs").insert({
    entity,
    entity_id: entityId,
    action,
    prev: { by },
    reason: (reason ?? "").slice(0, 400) || null,
    at: new Date().toISOString(),
  });
}

export const assignOwner = createServerFn({ method: "POST" })
  .inputValidator((input: Base & { handler: string }) => {
    if (!input?.leadId) throw new Error("leadId is required");
    if (!input?.handler?.trim()) throw new Error("Type who takes this customer");
    return input;
  })
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const handler = data.handler.trim().slice(0, 80);
    const { error } = await supabaseAdmin
      .from("leads")
      .update({ current_handler_name: handler, last_operator_action_at: new Date().toISOString() })
      .eq("id", data.leadId);
    if (error) throw new Error(error.message);
    await audit("lead", data.leadId, `owner set to ${handler}`, actor(data.by), data.reason);
    return { ok: true as const, handler };
  });

export const setNextAction = createServerFn({ method: "POST" })
  .inputValidator((input: Base & { kind: string; dueInMinutes?: number }) => {
    if (!input?.leadId) throw new Error("leadId is required");
    if (!input?.kind?.trim()) throw new Error("Say what must happen next");
    return input;
  })
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const dueAt = new Date(Date.now() + (data.dueInMinutes ?? 120) * 60000).toISOString();
    const kind = data.kind.trim().slice(0, 80);
    const { error } = await supabaseAdmin.from("next_actions").insert({
      lead_id: data.leadId,
      kind,
      due_at: dueAt,
      status: "open",
      source: "admin_control",
      notes: (data.reason ?? "Set from Admin Draft Control").slice(0, 400),
    });
    if (error) throw new Error(error.message);
    await supabaseAdmin
      .from("leads")
      .update({ last_operator_action_at: new Date().toISOString() })
      .eq("id", data.leadId);
    await audit("lead", data.leadId, `next action: ${kind}`, actor(data.by), data.reason);
    return { ok: true as const, kind, dueAt };
  });

export const escalateToTower = createServerFn({ method: "POST" })
  .inputValidator((input: Base) => {
    if (!input?.leadId) throw new Error("leadId is required");
    return input;
  })
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("leads")
      .update({
        current_handler_name: "Control Tower",
        primary_blocker: (data.reason ?? "Escalated: nobody moved this in time").slice(0, 200),
        last_operator_action_at: new Date().toISOString(),
      })
      .eq("id", data.leadId);
    if (error) throw new Error(error.message);
    await audit("lead", data.leadId, "escalated to Control Tower", actor(data.by), data.reason);
    return { ok: true as const };
  });

export const resolveRow = createServerFn({ method: "POST" })
  .inputValidator((input: { observationId: string; decision: "reconciled" | "non_customer"; by?: string | null; reason?: string | null }) => {
    if (!input?.observationId) throw new Error("observationId is required");
    return input;
  })
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("screenshot_observations")
      .update({ reconciliation_state: data.decision, reconciliation_reason: (data.reason ?? "decided in Admin control").slice(0, 200) })
      .eq("id", data.observationId);
    if (error) throw new Error(error.message);
    await audit("screenshot_observation", data.observationId, `row ${data.decision}`, actor(data.by), data.reason);
    return { ok: true as const };
  });
