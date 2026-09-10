import type { PipelineStage } from "@/lib/pipeline/stage-config";

/**
 * Intake stages live before the existing Closing Engine.
 * Once identity is resolved, the record must enter the existing PipelineStage
 * machine. Do not create another sales lifecycle beside PipelineStage.
 */
export type IntakeStage =
  | "OCR_RECEIVED"
  | "OCR_PARSED"
  | "IDENTITY_RESOLVED";

export type FlowStage = IntakeStage | PipelineStage;

export type FlowOwnerRole =
  | "system"
  | "control-tower"
  | "flow-ops"
  | "tcm"
  | "closing"
  | "checkin-ops";

export type PrimaryAction =
  | "PROCESS_OCR"
  | "REVIEW_OCR"
  | "CREATE_OR_ATTACH_LEAD"
  | "START_DOSSIER"
  | "COMPLETE_DOSSIER"
  | "MATCH_PROPERTIES"
  | "SCHEDULE_TOUR"
  | "CONFIRM_TOUR"
  | "RUN_TOUR"
  | "CAPTURE_POST_VISIT"
  | "SEND_QUOTE"
  | "RESOLVE_BLOCKER"
  | "VERIFY_BOOKING"
  | "COMPLETE_CHECKIN"
  | "NONE";

export interface FlowStageDefinition {
  stage: FlowStage;
  label: string;
  mission: string;
  primaryAction: PrimaryAction;
  ownerRole: FlowOwnerRole;
  terminal?: boolean;
}

/**
 * The only golden path shown to operators.
 * LOST is an alternate terminal state and therefore is not included here.
 */
export const FLOW_ORDER: FlowStage[] = [
  "OCR_RECEIVED",
  "OCR_PARSED",
  "IDENTITY_RESOLVED",
  "NEW",
  "DOSSIER",
  "MATCHED",
  "TOUR_SCHEDULED",
  "TOUR_CONFIRMED",
  "TOUR_IN_PROGRESS",
  "POST_VISIT",
  "QUOTED",
  "NEGOTIATION",
  "BOOKED",
  "CHECKED_IN",
];

export const FLOW_STAGE_DEFS: Record<FlowStage, FlowStageDefinition> = {
  OCR_RECEIVED: {
    stage: "OCR_RECEIVED",
    label: "Screenshot received",
    mission: "Extract every visible WhatsApp conversation without creating duplicate leads.",
    primaryAction: "PROCESS_OCR",
    ownerRole: "system",
  },
  OCR_PARSED: {
    stage: "OCR_PARSED",
    label: "OCR parsed",
    mission: "Review only uncertain OCR fields; accept high-confidence fields automatically.",
    primaryAction: "REVIEW_OCR",
    ownerRole: "control-tower",
  },
  IDENTITY_RESOLVED: {
    stage: "IDENTITY_RESOLVED",
    label: "Identity resolved",
    mission: "Attach the conversation to the existing customer or create exactly one canonical lead.",
    primaryAction: "CREATE_OR_ATTACH_LEAD",
    ownerRole: "system",
  },
  NEW: {
    stage: "NEW",
    label: "Lead added",
    mission: "Start the customer dossier immediately.",
    primaryAction: "START_DOSSIER",
    ownerRole: "flow-ops",
  },
  DOSSIER: {
    stage: "DOSSIER",
    label: "Dossier",
    mission: "Capture only the information required to decide feasibility and the next action.",
    primaryAction: "COMPLETE_DOSSIER",
    ownerRole: "flow-ops",
  },
  MATCHED: {
    stage: "MATCHED",
    label: "Matched",
    mission: "Select the best two viable properties from live inventory.",
    primaryAction: "MATCH_PROPERTIES",
    ownerRole: "flow-ops",
  },
  TOUR_SCHEDULED: {
    stage: "TOUR_SCHEDULED",
    label: "Tour scheduled",
    mission: "Lock the visit plan, coordinator and property sequence.",
    primaryAction: "SCHEDULE_TOUR",
    ownerRole: "flow-ops",
  },
  TOUR_CONFIRMED: {
    stage: "TOUR_CONFIRMED",
    label: "Tour confirmed",
    mission: "Protect attendance and remove any pre-tour blocker.",
    primaryAction: "CONFIRM_TOUR",
    ownerRole: "tcm",
  },
  TOUR_IN_PROGRESS: {
    stage: "TOUR_IN_PROGRESS",
    label: "Tour in progress",
    mission: "Complete the planned tour and record the actual property journey.",
    primaryAction: "RUN_TOUR",
    ownerRole: "tcm",
  },
  POST_VISIT: {
    stage: "POST_VISIT",
    label: "Post visit",
    mission: "Turn the tour outcome into one explicit decision and one blocker.",
    primaryAction: "CAPTURE_POST_VISIT",
    ownerRole: "tcm",
  },
  QUOTED: {
    stage: "QUOTED",
    label: "Quoted",
    mission: "Send the correct offer quickly and start the dated closing follow-up ladder.",
    primaryAction: "SEND_QUOTE",
    ownerRole: "closing",
  },
  NEGOTIATION: {
    stage: "NEGOTIATION",
    label: "Negotiation",
    mission: "Resolve the single biggest booking blocker and move the customer to payment.",
    primaryAction: "RESOLVE_BLOCKER",
    ownerRole: "closing",
  },
  BOOKED: {
    stage: "BOOKED",
    label: "Booked",
    mission: "Verify payment, room lock and booking terms before handoff to check-in.",
    primaryAction: "VERIFY_BOOKING",
    ownerRole: "closing",
  },
  CHECKED_IN: {
    stage: "CHECKED_IN",
    label: "Checked in",
    mission: "Complete KYC, agreement, keys/room handover and arrival confirmation.",
    primaryAction: "COMPLETE_CHECKIN",
    ownerRole: "checkin-ops",
    terminal: true,
  },
  LOST: {
    stage: "LOST",
    label: "Lost",
    mission: "Record the true loss reason and preserve the customer for the right revival window.",
    primaryAction: "NONE",
    ownerRole: "system",
    terminal: true,
  },
};

export function isIntakeStage(stage: FlowStage): stage is IntakeStage {
  return stage === "OCR_RECEIVED" || stage === "OCR_PARSED" || stage === "IDENTITY_RESOLVED";
}

export function isTerminalStage(stage: FlowStage): boolean {
  return stage === "CHECKED_IN" || stage === "LOST";
}

export function nextGoldenStage(stage: FlowStage): FlowStage | null {
  if (isTerminalStage(stage)) return null;
  const index = FLOW_ORDER.indexOf(stage);
  if (index < 0 || index === FLOW_ORDER.length - 1) return null;
  return FLOW_ORDER[index + 1];
}

/**
 * Converts the pre-pipeline handoff into the existing canonical Closing Engine.
 * IDENTITY_RESOLVED must always hand off to NEW; all later stages are already
 * PipelineStage values and should remain owned by the pipeline engine.
 */
export function pipelineEntryFor(stage: FlowStage): PipelineStage | null {
  if (stage === "IDENTITY_RESOLVED") return "NEW";
  if (isIntakeStage(stage)) return null;
  return stage;
}
