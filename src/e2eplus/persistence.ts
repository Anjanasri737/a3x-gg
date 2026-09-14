// Shared storage for E2E execution state. Everything the operator decides in
// Final E2E Plus lives in the database, so the whole team sees the same state
// instead of one browser's copy. The timeline is append-only.
import { supabase } from "@/integrations/supabase/client";
import type { LeadExec, TimelineEntry } from "./store";

const db = supabase as any;

const EXEC_TABLE = "e2e_lead_execution";
const TIMELINE_TABLE = "e2e_lead_timeline";

interface ExecRow {
  lead_id: string;
  where_state: string | null;
  channel: string | null;
  when_bucket: string | null;
  follow_up_at: string | null;
  owner_id: string | null;
  owner_name: string | null;
  claimed_at: string | null;
  ownership_mode: string | null;
  verified: Record<string, boolean> | null;
  urgency: string | null;
  probability: string | null;
  situation: string | null;
  next_action: string | null;
  next_action_at: string | null;
  last_outcome: string | null;
  tour_gate: Record<string, boolean> | null;
  visit_status: string | null;
  booking_status: string | null;
}

const clean = <T>(v: T | null | undefined): T | undefined => (v === null ? undefined : v);

function toExec(row: ExecRow, timeline: TimelineEntry[]): LeadExec {
  return {
    leadId: row.lead_id,
    where: clean(row.where_state) as LeadExec["where"],
    channel: clean(row.channel) as LeadExec["channel"],
    when: clean(row.when_bucket) as LeadExec["when"],
    followUpAt: clean(row.follow_up_at),
    ownerId: clean(row.owner_id),
    ownerName: clean(row.owner_name),
    claimedAt: clean(row.claimed_at),
    ownershipMode: clean(row.ownership_mode) as LeadExec["ownershipMode"],
    verified: row.verified ?? {},
    urgency: clean(row.urgency) as LeadExec["urgency"],
    probability: clean(row.probability) as LeadExec["probability"],
    situation: clean(row.situation) as LeadExec["situation"],
    nextAction: clean(row.next_action),
    nextActionAt: clean(row.next_action_at),
    lastOutcome: clean(row.last_outcome),
    tourGate: row.tour_gate ?? {},
    visitStatus: clean(row.visit_status),
    bookingStatus: clean(row.booking_status),
    timeline,
  };
}

const iso = (v?: string) => {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

function toRow(exec: LeadExec): ExecRow {
  return {
    lead_id: exec.leadId,
    where_state: exec.where ?? null,
    channel: exec.channel ?? null,
    when_bucket: exec.when ?? null,
    follow_up_at: iso(exec.followUpAt),
    owner_id: exec.ownerId ?? null,
    owner_name: exec.ownerName ?? null,
    claimed_at: iso(exec.claimedAt),
    ownership_mode: exec.ownershipMode ?? null,
    verified: exec.verified ?? {},
    urgency: exec.urgency ?? null,
    probability: exec.probability ?? null,
    situation: exec.situation ?? null,
    next_action: exec.nextAction ?? null,
    next_action_at: iso(exec.nextActionAt),
    last_outcome: exec.lastOutcome ?? null,
    tour_gate: exec.tourGate ?? {},
    visit_status: exec.visitStatus ?? null,
    booking_status: exec.bookingStatus ?? null,
  };
}

/** Every lead's shared execution state, keyed by lead id. */
export async function loadAllExecutionState(): Promise<Record<string, LeadExec>> {
  const [execRes, timelineRes] = await Promise.all([
    db.from(EXEC_TABLE).select("*"),
    db.from(TIMELINE_TABLE).select("lead_id, actor, text, created_at").order("created_at", { ascending: true }).limit(5000),
  ]);
  if (execRes.error) throw new Error(execRes.error.message);

  const byLead: Record<string, TimelineEntry[]> = {};
  for (const t of (timelineRes.data ?? []) as Array<{ lead_id: string; actor: string; text: string; created_at: string }>) {
    (byLead[t.lead_id] ??= []).push({ ts: t.created_at, actor: t.actor, text: t.text });
  }

  const out: Record<string, LeadExec> = {};
  for (const row of (execRes.data ?? []) as ExecRow[]) {
    out[row.lead_id] = toExec(row, byLead[row.lead_id] ?? []);
  }
  // Leads with only history and no state row still deserve their timeline.
  for (const [leadId, timeline] of Object.entries(byLead)) {
    if (!out[leadId]) out[leadId] = { leadId, timeline };
  }
  return out;
}

/** Write-through save of one lead's execution state. */
export async function saveExecutionState(exec: LeadExec): Promise<void> {
  const { error } = await db.from(EXEC_TABLE).upsert(toRow(exec), { onConflict: "lead_id" });
  if (error) throw new Error(error.message);
}

/** Append one immutable timeline entry. */
export async function appendTimeline(leadId: string, actor: string, text: string): Promise<void> {
  const { error } = await db.from(TIMELINE_TABLE).insert({ lead_id: leadId, actor, text });
  if (error) throw new Error(error.message);
}
