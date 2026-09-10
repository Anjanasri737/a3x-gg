import { supabase } from "@/integrations/supabase/client";

const db = supabase as unknown as {
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: any; error: any }>;
};

export type FlowOutcome = "completed" | "future" | "waiting" | "lost" | "booked" | "checked_in" | "handoff";

export async function completeAndNext(params: {
  batchItemId: string;
  claimId: string;
  outcome: FlowOutcome;
  nextActionKind?: string | null;
  nextActionAt?: string | null;
  notes?: string | null;
}) {
  const { data, error } = await db.rpc("complete_flow_item", {
    _batch_item_id: params.batchItemId,
    _claim_id: params.claimId,
    _outcome: params.outcome,
    _next_action_kind: params.nextActionKind ?? null,
    _next_action_at: params.nextActionAt ?? null,
    _notes: params.notes ?? null,
  });
  if (error) throw error;
  return data as {
    completed_item_id: string;
    lead_id: string;
    outcome: FlowOutcome;
    next_item_id?: string | null;
    next_lead_id?: string | null;
  };
}
