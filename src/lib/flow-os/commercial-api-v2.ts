import { supabase } from "@/integrations/supabase/client";
import { getCurrentFlowOperator } from "./operator";

const db = supabase as any;
const nowIso = () => new Date().toISOString();

export interface CommercialState {
  quotation: any | null;
  booking: any | null;
  checkin: any | null;
}

async function logTimeline(input: { leadId: string; activity: string; newStage?: string | null; detail?: string | null }) {
  const operator = await getCurrentFlowOperator();
  const { error } = await db.from("lead_timeline").insert({
    lead_id: input.leadId,
    actor: operator.id,
    activity: input.activity,
    new_stage: input.newStage ?? null,
    detail: input.detail ?? null,
  });
  if (error) throw error;
}

async function updateLeadExecution(leadId: string, patch: Record<string, unknown>) {
  const { error } = await db.from("leads").update({ ...patch, last_operator_action_at: nowIso() }).eq("id", leadId);
  if (error) throw error;
}

export async function loadCommercialState(leadId: string): Promise<CommercialState> {
  const [{ data: quotation, error: qError }, { data: booking, error: bError }, { data: checkin, error: cError }] = await Promise.all([
    db.from("flow_quotations").select("*").eq("lead_id", leadId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    db.from("flow_bookings").select("*").eq("lead_id", leadId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    db.from("flow_checkins").select("*").eq("lead_id", leadId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (qError) throw qError;
  if (bError) throw bError;
  if (cError) throw cError;
  return { quotation: quotation ?? null, booking: booking ?? null, checkin: checkin ?? null };
}

export async function saveQuotation(input: {
  leadId: string;
  propertyName?: string;
  propertyId?: string;
  roomLabel?: string;
  roomId?: string;
  amount: number;
  depositAmount?: number;
  maintenanceAmount?: number;
  discount?: number;
  lockInMonths?: number;
  noticeDays?: number;
  expiresAt: string;
}) {
  const operator = await getCurrentFlowOperator();
  const { data, error } = await db.from("flow_quotations").insert({
    lead_id: input.leadId,
    property_name: input.propertyName ?? null,
    property_id: input.propertyId ?? null,
    room_label: input.roomLabel ?? null,
    room_id: input.roomId ?? null,
    amount: input.amount,
    deposit_amount: input.depositAmount ?? null,
    maintenance_amount: input.maintenanceAmount ?? null,
    discount: input.discount ?? 0,
    lock_in_months: input.lockInMonths ?? null,
    notice_days: input.noticeDays ?? null,
    expires_at: input.expiresAt,
    status: "saved",
    created_by: operator.id,
    created_by_name: operator.name,
  }).select("*").single();
  if (error) throw error;
  await updateLeadExecution(input.leadId, { current_pipeline_stage: "QUOTED", current_mission: "Send quotation and get decision", primary_blocker: null });
  await logTimeline({ leadId: input.leadId, activity: "quotation_saved", newStage: "QUOTED", detail: `Quotation ₹${input.amount} saved` });
  return data;
}

export async function markQuotationEvent(quotationId: string, event: "copied" | "sent" | "accepted") {
  const field = event === "copied" ? "copied_at" : event === "sent" ? "sent_at" : "accepted_at";
  const { data: quote, error } = await db.from("flow_quotations").update({ status: event, [field]: nowIso(), updated_at: nowIso() }).eq("id", quotationId).select("*").single();
  if (error) throw error;
  const stage = event === "accepted" ? "NEGOTIATION" : "QUOTED";
  await updateLeadExecution(quote.lead_id, {
    current_pipeline_stage: stage,
    current_mission: event === "accepted" ? "Record and verify payment" : "Follow up quotation",
    primary_blocker: null,
  });
  await logTimeline({ leadId: quote.lead_id, activity: `quotation_${event}`, newStage: stage, detail: `Quotation ${event}` });
  return quote;
}

export async function recordPayment(input: {
  leadId: string;
  quotationId?: string;
  propertyName?: string;
  propertyId?: string;
  roomLabel?: string;
  roomId?: string;
  bedId?: string;
  amount: number;
  paymentRef: string;
  paymentEvidence?: string;
  ownerApprovalRequired?: boolean;
}) {
  const operator = await getCurrentFlowOperator();
  if (!input.paymentRef.trim()) throw new Error("Payment reference / UTR is required");
  const { data, error } = await db.from("flow_bookings").insert({
    lead_id: input.leadId,
    quotation_id: input.quotationId ?? null,
    property_name: input.propertyName ?? null,
    property_id: input.propertyId ?? null,
    room_label: input.roomLabel ?? null,
    room_id: input.roomId ?? null,
    bed_id: input.bedId ?? null,
    amount: input.amount,
    payment_ref: input.paymentRef.trim(),
    payment_evidence: input.paymentEvidence?.trim() || null,
    payment_verified: false,
    owner_approval_required: input.ownerApprovalRequired ?? false,
    owner_approved: !(input.ownerApprovalRequired ?? false),
    status: "payment_received",
    created_by: operator.id,
    created_by_name: operator.name,
  }).select("*").single();
  if (error) throw error;
  await updateLeadExecution(input.leadId, {
    current_pipeline_stage: "NEGOTIATION",
    current_mission: "Verify payment evidence",
    primary_blocker: input.ownerApprovalRequired ? "Payment verification + owner approval pending" : "Payment verification pending",
  });
  await logTimeline({ leadId: input.leadId, activity: "payment_recorded", newStage: "NEGOTIATION", detail: `Payment reference ${input.paymentRef.trim()} recorded; verification still required` });
  return data;
}

export async function verifyPayment(bookingId: string) {
  const { data: booking, error } = await db.from("flow_bookings").update({ payment_verified: true, status: "verified", updated_at: nowIso() }).eq("id", bookingId).select("*").single();
  if (error) throw error;
  const waitingOwner = Boolean(booking.owner_approval_required && !booking.owner_approved);
  const stage = waitingOwner ? "NEGOTIATION" : "BOOKED";
  await updateLeadExecution(booking.lead_id, {
    current_pipeline_stage: stage,
    current_mission: waitingOwner ? "Get owner approval" : "Prepare check-in",
    primary_blocker: waitingOwner ? "Owner approval pending" : null,
  });
  await logTimeline({ leadId: booking.lead_id, activity: "payment_verified", newStage: stage, detail: waitingOwner ? "Payment verified; owner approval pending" : "Payment verified; booking is ready for check-in preparation" });
  return booking;
}

export async function requestOwnerApproval(bookingId: string) {
  const { data: booking, error } = await db.from("flow_bookings").update({ owner_approval_required: true, owner_approved: false, updated_at: nowIso() }).eq("id", bookingId).select("*").single();
  if (error) throw error;
  await updateLeadExecution(booking.lead_id, { current_pipeline_stage: "NEGOTIATION", current_mission: "Get owner approval", primary_blocker: "Owner approval pending" });
  await logTimeline({ leadId: booking.lead_id, activity: "owner_approval_requested", newStage: "NEGOTIATION", detail: "Owner approval requested" });
  return booking;
}

export async function approveOwner(bookingId: string) {
  const operator = await getCurrentFlowOperator();
  const { data: booking, error } = await db.from("flow_bookings").update({ owner_approved: true, owner_approved_at: nowIso(), owner_approved_by: operator.id, updated_at: nowIso() }).eq("id", bookingId).select("*").single();
  if (error) throw error;
  const stage = booking.payment_verified ? "BOOKED" : "NEGOTIATION";
  await updateLeadExecution(booking.lead_id, { current_pipeline_stage: stage, current_mission: booking.payment_verified ? "Prepare check-in" : "Verify payment", primary_blocker: booking.payment_verified ? null : "Payment verification pending" });
  await logTimeline({ leadId: booking.lead_id, activity: "owner_approved", newStage: stage, detail: "Owner approval completed" });
  return booking;
}

export async function ensureCheckIn(input: { leadId: string; bookingId: string; scheduledFor?: string }) {
  const operator = await getCurrentFlowOperator();
  const { data: booking, error: bookingError } = await db.from("flow_bookings").select("*").eq("id", input.bookingId).eq("lead_id", input.leadId).maybeSingle();
  if (bookingError) throw bookingError;
  if (!booking) throw new Error("Canonical booking not found");
  if (!booking.payment_verified) throw new Error("Verify payment before preparing check-in");
  if (booking.owner_approval_required && !booking.owner_approved) throw new Error("Owner approval is still pending");
  const { data: existing, error: existingError } = await db.from("flow_checkins").select("*").eq("booking_id", input.bookingId).maybeSingle();
  if (existingError) throw existingError;
  if (existing) return existing;
  const { data, error } = await db.from("flow_checkins").insert({ lead_id: input.leadId, booking_id: input.bookingId, scheduled_for: input.scheduledFor ?? null, created_by: operator.id }).select("*").single();
  if (error) throw error;
  await updateLeadExecution(input.leadId, { current_pipeline_stage: "BOOKED", current_mission: "Complete check-in gates", primary_blocker: null });
  await logTimeline({ leadId: input.leadId, activity: "checkin_prepared", newStage: "BOOKED", detail: "Check-in readiness checklist started" });
  return data;
}

export async function updateCheckInGates(checkinId: string, patch: {
  arrivedAt?: string | null;
  roomAllocated?: boolean;
  roomOrBedLabel?: string;
  kycDone?: boolean;
  agreementDone?: boolean;
  keysHandedOver?: boolean;
  npsScore?: number | null;
}) {
  const update: Record<string, unknown> = { updated_at: nowIso() };
  if (patch.arrivedAt !== undefined) update.arrived_at = patch.arrivedAt;
  if (patch.roomAllocated !== undefined) update.room_allocated = patch.roomAllocated;
  if (patch.roomOrBedLabel !== undefined) update.room_or_bed_label = patch.roomOrBedLabel;
  if (patch.kycDone !== undefined) update.kyc_done = patch.kycDone;
  if (patch.agreementDone !== undefined) update.agreement_done = patch.agreementDone;
  if (patch.keysHandedOver !== undefined) update.keys_handed_over = patch.keysHandedOver;
  if (patch.npsScore !== undefined) update.nps_score = patch.npsScore;
  const { data, error } = await db.from("flow_checkins").update(update).eq("id", checkinId).select("*").single();
  if (error) throw error;
  await updateLeadExecution(data.lead_id, { current_mission: "Complete check-in gates" });
  await logTimeline({ leadId: data.lead_id, activity: "checkin_gate_updated", newStage: "BOOKED", detail: Object.keys(update).filter((k) => k !== "updated_at").join(", ") });
  return data;
}

export async function confirmCheckIn(checkinId: string) {
  const operator = await getCurrentFlowOperator();
  const { data, error } = await db.rpc("flow_confirm_checkin", { p_checkin_id: checkinId, p_actor_id: operator.id, p_actor_name: operator.name });
  if (error) throw error;
  const result = Array.isArray(data) ? data[0] : data;
  if (!result?.ok) throw new Error(result?.reason || "Check-in gates are incomplete");
  const { data: checkin } = await db.from("flow_checkins").select("lead_id").eq("id", checkinId).maybeSingle();
  if (checkin?.lead_id) await logTimeline({ leadId: checkin.lead_id, activity: "checked_in", newStage: "CHECKED_IN", detail: "All hard gates passed; customer physically checked in" });
  return result;
}

export async function listLeadTimeline(leadId: string, limit = 100) {
  const { data, error } = await db.from("lead_timeline").select("*").eq("lead_id", leadId).order("at", { ascending: false }).limit(limit);
  if (error) throw error;
  return data ?? [];
}
