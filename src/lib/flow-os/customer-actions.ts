import { supabase } from "@/integrations/supabase/client";

const db = supabase as unknown as {
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: any; error: any }>;
};

export async function confirmFlowStageHint(input: {
  leadId: string;
  stage: string;
  mission?: string | null;
  observationId?: string | null;
}) {
  const { data, error } = await db.rpc("confirm_flow_stage_hint", {
    _lead_id: input.leadId,
    _stage: input.stage,
    _mission: input.mission ?? null,
    _observation_id: input.observationId ?? null,
  });
  if (error) throw error;
  return data;
}

export async function setFlowNextAction(input: {
  leadId: string;
  kind: string;
  dueAt: string;
  notes?: string | null;
}) {
  const { data, error } = await db.rpc("set_flow_next_action", {
    _lead_id: input.leadId,
    _kind: input.kind,
    _due_at: input.dueAt,
    _notes: input.notes ?? null,
  });
  if (error) throw error;
  return data;
}
