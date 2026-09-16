import { createServerFn } from "@tanstack/react-start";

type LogInput = {
  leadId: string;
  activity: string;
  detail?: string | null;
  actor?: string | null;
  nextActionKind?: string | null;
  nextActionAt?: string | null;
};

/**
 * Logs one activity against a lead from the WhatsApp/CRM preview and optionally
 * sets the next action + deadline so no worked lead is left without a next step.
 */
export const logLeadActivity = createServerFn({ method: "POST" })
  .inputValidator((input: LogInput) => {
    if (!input?.leadId) throw new Error("leadId is required");
    if (!input?.activity || input.activity.trim().length < 2) throw new Error("Write what happened");
    return input;
  })
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin;
    const actor = (data.actor || "CRM preview").slice(0, 80);

    const { error: timelineError } = await db.from("lead_timeline").insert({
      lead_id: data.leadId,
      activity: data.activity.trim().slice(0, 200),
      detail: data.detail?.trim() ? data.detail.trim().slice(0, 2000) : null,
      actor,
      at: new Date().toISOString(),
    });
    if (timelineError) throw new Error(timelineError.message);

    let nextAction: { kind: string; due_at: string } | null = null;
    if (data.nextActionKind && data.nextActionKind.trim()) {
      const dueAt = data.nextActionAt
        ? new Date(data.nextActionAt).toISOString()
        : new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
      const { error: actionError } = await db.from("next_actions").insert({
        lead_id: data.leadId,
        kind: data.nextActionKind.trim().slice(0, 80),
        due_at: dueAt,
        status: "open",
        source: "crm_preview",
        notes: data.activity.trim().slice(0, 500),
      });
      if (actionError) throw new Error(actionError.message);
      nextAction = { kind: data.nextActionKind.trim(), due_at: dueAt };
    }

    await db
      .from("leads")
      .update({ last_operator_action_at: new Date().toISOString() })
      .eq("id", data.leadId);

    return { ok: true as const, nextAction };
  });
