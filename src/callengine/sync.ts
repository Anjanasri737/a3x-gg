// Every M-POWER CALL is written to the database as well as the local store,
// so the operator and the admin see the same record from any device.
import { supabase } from "@/integrations/supabase/client";
import type { CallRecord } from "./types";

export async function pushCallRecord(r: CallRecord): Promise<{ ok: boolean; error?: string }> {
  const { data: auth } = await supabase.auth.getUser();
  const row = {
    called_at: r.ts,
    operator_id: auth.user?.id ?? null,
    operator_name: r.operatorName ?? null,
    lead_ulid: r.ulid ?? null,
    canonical_id: r.canonicalId ?? null,
    customer_name: r.name ?? null,
    agenda: r.agenda,
    agenda_source: r.agendaSource ?? null,
    outcome: r.outcome,
    duration_sec: r.durationSec ?? null,
    capture: r.capture as unknown as Record<string, unknown>,
    movement: r.movement ?? null,
    message_now: r.messageNow ?? null,
    message_sent: !!r.messageSent,
    follow_up: r.followUp as unknown as Record<string, unknown>,
    follow_up_state: r.followUpState ?? null,
    next_step: r.nextStep as unknown as Record<string, unknown>,
    stage_after: r.stageAfter ?? null,
    waste: (r.waste ?? []) as unknown as Record<string, unknown>,
    client_id: r.id,
  };
  const { error } = await supabase.from("call_records").insert(row);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Calls stored centrally — used by the admin view and by the operator's own history. */
export async function fetchCallRecords(limit = 200) {
  const { data, error } = await supabase
    .from("call_records")
    .select("*")
    .order("called_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}
