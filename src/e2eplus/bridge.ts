// Final E2E Plus is not a separate CRM: it writes into the systems already built
// in this project. Ownership identity comes from the Flow OS operator, the next
// action goes to set_flow_next_action, and stage moves go to
// confirm_flow_stage_hint — the same pipeline every other page reads.
import { confirmFlowStageHint, setFlowNextAction } from "@/lib/flow-os/customer-actions";
import { getCurrentFlowOperator, type FlowOperatorIdentity } from "@/lib/flow-os/operator";
import type { FlowStage } from "@/lib/flow-os/lifecycle";

export type BridgeResult = { ok: true } | { ok: false; message: string };

const fail = (e: unknown): BridgeResult => ({
  ok: false,
  message: e instanceof Error ? e.message : String(e),
});

export async function loadOperator(): Promise<FlowOperatorIdentity | null> {
  try {
    return await getCurrentFlowOperator();
  } catch {
    return null;
  }
}

/** Visit room status → the existing pipeline stage machine. */
export const VISIT_STAGE: Record<string, FlowStage> = {
  UPCOMING: "TOUR_SCHEDULED",
  "EN ROUTE": "TOUR_CONFIRMED",
  ARRIVED: "TOUR_CONFIRMED",
  "TOUR LIVE": "TOUR_IN_PROGRESS",
  "CLOSING NOW": "POST_VISIT",
  "TOKEN PENDING": "NEGOTIATION",
  "ALTERNATIVE REQUIRED": "POST_VISIT",
  "FOLLOW-UP TODAY": "POST_VISIT",
  BOOKED: "BOOKED",
  LOST: "LOST",
};

/** Booking ladder → the same stage machine. */
export const BOOKING_STAGE: Record<string, FlowStage> = {
  "APPROVAL PENDING": "QUOTED",
  APPROVED: "NEGOTIATION",
  "PAYMENT/TOKEN PENDING": "NEGOTIATION",
  "PAYMENT RECEIVED": "BOOKED",
  RESERVED: "BOOKED",
  BOOKED: "BOOKED",
};

export async function publishStage(input: {
  leadId: string;
  stage: FlowStage;
  mission?: string;
}): Promise<BridgeResult> {
  try {
    await confirmFlowStageHint({ leadId: input.leadId, stage: input.stage, mission: input.mission ?? null });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function publishNextAction(input: {
  leadId: string;
  kind: string;
  dueAt: string;
  notes?: string;
}): Promise<BridgeResult> {
  try {
    await setFlowNextAction({
      leadId: input.leadId,
      kind: input.kind,
      dueAt: new Date(input.dueAt).toISOString(),
      notes: input.notes ?? null,
    });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
