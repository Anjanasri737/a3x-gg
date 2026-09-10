import { supabase } from "@/integrations/supabase/client";
import { getCurrentFlowOperator } from "./revenue-api";

const db = supabase as any;
const nowIso = () => new Date().toISOString();

export interface CommercialState {
  quotation: any | null;
  booking: any | null;
  checkin: any | null;
}

export async function loadCommercialState(leadId: string): Promise<CommercialState> {
  const [{ data: quotation }, { data: booking }, { data: checkin }] = await Promise.all([
    db.from("flow_quotations").select("*").eq("lead_id", leadId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    db.from("flow_bookings").select("*").eq("lead_id", leadId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    db.from("flow_checkins").select("*").eq("lead_id", leadId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
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
  await db.from("leads").update({
    pipeline_stage: "QUOTED",
    current_mission: "Send / follow up quotation",
    last_operator_action_at: nowIso(),
  }).eq("id", input.leadId);
  await db.from("lead_timeline").insert({
    lead_id: input.leadId, activity: "quotation_saved", actor: operator.name,
    new_stage: "QUOTED", detail: `Quotation ₹${input.amount} saved`,
  });
  return data;
}

export async function markQuotationEvent(quotationId: string, event: "copied" | "sent" | "accepted") {
  const operator = await getCurrentFlowOperator();
  const field = event === "copied" ? "copied_at" : event === "sent" ? "sent_at" : "accepted_at";
  const { data: quote, error } = await db.from("flow_quotations").update({
    status: event,
    [field]: nowIso(),
    updated_at: nowIso(),
  }).eq("id", quotationId).select("*").single();
  if (error) throw error;
  await db.from("leads").update({
    pipeline_stage: event === "accepted" ? "NEGOTIATION" : "QUOTED",
    current_mission: event === "accepted" ? "Record payment" : "Follow up quotation",
    last_operator_action_at: nowIso(),
  }).eq("id", quote.lead_id);
  await db.from("lead_timeline").insert({
    lead_id: quote.lead_id, activity: `quotation_${event}`, actor: operator.name,
    new_stage: event === "accepted" ? "NEGOTIATION" : "QUOTED",
    detail: `Quotation ${event}`,
  });
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
  const { data, error } = await db.from("flow_bookings").insert({
    lead_id: input.leadId,
    quotation_id: input.quotationId ?? null,
    property_name: input.propertyName ?? null,
    property_id: input.propertyId ?? null,
    room_label: input.roomLabel ?? null,
    room_id: input.roomId ?? null,
    bed_id: input.bedId ?? null,
    amount: input.amount,
    payment_ref: input.paymentRef,
    payment_evidence: input.paymentEvidence ?? null,
    payment_verified: false,
    owner_approval_required: input.ownerApprovalRequired ?? false,
    owner_approved: !(input.ownerApprovalRequired ?? false),
    status: "payment_received",
    created_by: operator.id,
    created_by_name: operator.name,
  }).select("*").single();
  if (error) throw error;
  await db.from("leads").update({
    pipeline_stage: "NEGOTIATION",
    current_mission: "Verify payment",
    primary_blocker: input.ownerApprovalRequired ? "Payment verification + owner approval" : "Payment verification",
    last_operator_action_at: nowIso(),
  }).eq("id", input.leadId);
  await db.from("lead_timeline").insert({
    lead_id: input.leadId, activity: "payment_recorded", actor: operator.name,
    new_stage: "NEGOTIATION", detail: `Payment reference ${input.paymentRef} recorded; not yet verified`,
  });
  return data;
}

export async function verifyPayment(bookingId: string) {
  const operator = await getCurrentFlowOperator();
  const { data: booking, error } = await db.from("flow_bookings").update({
    payment_verified: true,
    status: "verified",
    updated_at: nowIso(),
  }).eq("id", bookingId).select("*").single();
  if (error) throw error;

  const waitingOwner = booking.owner_approval_required && !booking.owner_approved;
  await db.from("leads").update({
    pipeline_stage: waitingOwner ? "NEGOTIATION" : "BOOKED",
    current_mission: waitingOwner ? "Await owner approval" : "Prepare check-in",
    primary_blocker: waitingOwner ? "Owner approval pending" : null,
    last_operator_action_at: nowIso(),
  }).eq("id", booking.lead_id);
  await db.from("lead_timeline").insert({
    lead_id: booking.lead_id, activity: "payment_verified", actor: operator.name,
    new_stage: waitingOwner ? "NEGOTIATION" : "BOOKED",
    detail: waitingOwner ? "Payment verified; owner approval pending" : "Payment verified; booking can prepare check-in",
  });
  return booking;
}

export async function requestOwnerApproval(bookingId: string) {
  const operator = await getCurrentFlowOperator();
  const { data: booking, error } = await db.from("flow_bookings").update({
    owner_approval_required: true,
    owner_approved: false,
    updated_at: nowIso(),
  }).eq("id", bookingId).select("*").single();
  if (error) throw error;
  await db.from("leads").update({
    pipeline_stage: "NEGOTIATION",
    current_mission: "Await owner approval",
    primary_blocker: "Owner approval pending",
    last_operator_action_at: nowIso(),
  }).eq("id", booking.lead_id);
  await db.from("lead_timeline").insert({
    lead_id: booking.lead_id, activity: "owner_approval_requested", actor: operator.name,
    detail: "Owner approval requested",
  });
  return booking;
}

export async function approveOwner(bookingId: string) {
  const operator = await getCurrentFlowOperator();
  const { data: booking, error } = await db.from("flow_bookings").update({
    owner_approved: true,
    owner_approved_at: nowIso(),
    owner_approved_by: operator.id,
    updated_at: nowIso(),
  }).eq("id", bookingId).select("*").single();
  if (error) throw error;
  const readyForBooked = Boolean(booking.payment_verified);
  await db.from("leads").update({
    pipeline_stage: readyForBooked ? "BOOKED" : "NEGOTIATION",
    current_mission: readyForBooked ? "Prepare check-in" : "Verify payment",
    primary_blocker: readyForBooked ? null : "Payment verification pending",
    last_operator_action_at: nowIso(),
  }).eq("id", booking.lead_id);
  await db.from("lead_timeline").insert({
    lead_id: booking.lead_id, activity: "owner_approved", actor: operator.name,
    new_stage: readyForBooked ? "BOOKED" : "NEGOTIATION", detail: "Owner approval completed",
  });
  return booking;
}

export async function ensureCheckIn(input: {
  leadId: string;
  bookingId: string;
  scheduledFor?: string;
}) {
  const operator = await getCurrentFlowOperator();
  const { data: existing } = await db.from("flow_checkins").select("*").eq("booking_id", input.bookingId).maybeSingle();
  if (existing) return existing;
  const { data, error } = await db.from("flow_checkins").insert({
    lead_id: input.leadId,
    booking_id: input.bookingId,
    scheduled_for: input.scheduledFor ?? null,
    created_by: operator.id,
  }).select("*").single();
  if (error) throw error;
  await db.from("leads").update({ pipeline_stage: "BOOKED", current_mission: "Complete check-in gates", last_operator_action_at: nowIso() }).eq("id", input.leadId);
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
  return data;
}

export async function confirmCheckIn(checkinId: string) {
  const operator = await getCurrentFlowOperator();
  const { data, error } = await db.rpc("flow_confirm_checkin", {
    p_checkin_id: checkinId,
    p_actor_id: operator.id,
    p_actor_name: operator.name,
  });
  if (error) throw error;
  const result = Array.isArray(data) ? data[0] : data;
  if (!result?.ok) throw new Error(result?.reason || "Check-in gates are incomplete");
  return result;
}
