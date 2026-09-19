// Call Conversation Engine — a call is not an activity, a call must move the customer.
// Every call stores: agenda, what was discussed, what was quoted, what was promised,
// the WhatsApp message sent, the conditional follow-up, and the next step with an SLA.
import type { NextActionKind } from "@/movement/types";

export type AgendaKey =
  | "qualification"
  | "property-intro"
  | "property-feedback"
  | "price"
  | "tour-schedule"
  | "tour-confirm"
  | "post-tour"
  | "closing"
  | "objection"
  | "alternative"
  | "follow-up"
  | "future"
  | "check-in";

export interface AgendaDef {
  key: AgendaKey;
  label: string;
  objective: string;
  /** what this call must bring back */
  needs: string[];
}

export const AGENDAS: AgendaDef[] = [
  { key: "qualification", label: "Qualification", objective: "Understand the requirement", needs: ["Move-in", "Area", "Budget", "Room", "Bangalore status"] },
  { key: "property-intro", label: "Property Introduction", objective: "Explain the shortlisted property", needs: ["Property explained", "First reaction"] },
  { key: "property-feedback", label: "Property Feedback", objective: "Did they see it, do they like it, why", needs: ["Seen?", "Liked?", "Reason"] },
  { key: "price", label: "Price Discussion", objective: "Quote the real commercial and read the reaction", needs: ["Price quoted", "Price reaction"] },
  { key: "tour-schedule", label: "Tour Scheduling", objective: "Fix a visit", needs: ["Date", "Time", "Property"] },
  { key: "tour-confirm", label: "Tour Confirmation", objective: "Make sure they attend", needs: ["Attendance confirmed"] },
  { key: "post-tour", label: "Post-Tour Feedback", objective: "Understand the decision", needs: ["Liked?", "Objection", "Decision"] },
  { key: "closing", label: "Closing", objective: "Booking / pre-book", needs: ["Final property", "Final price", "Booking intent"] },
  { key: "objection", label: "Objection Resolution", objective: "Remove the blocker", needs: ["Blocker", "Resolution"] },
  { key: "alternative", label: "Alternative Property", objective: "Shift to a better-fit property", needs: ["What to change", "New option"] },
  { key: "follow-up", label: "Follow-up", objective: "Get the decision or the next step", needs: ["Decision", "Next step"] },
  { key: "future", label: "Future Lead", objective: "Reactivate an old lead", needs: ["Still looking?", "Changed requirement"] },
  { key: "check-in", label: "Check-in Coordination", objective: "Make the move-in happen", needs: ["Move-in slot", "Documents"] },
];

export const agendaDef = (key: AgendaKey) => AGENDAS.find((a) => a.key === key) ?? AGENDAS[0];

export type OutcomeKind = "connected" | "no-answer" | "call-later" | "not-relevant";

export const OUTCOMES: { key: OutcomeKind; label: string }[] = [
  { key: "connected", label: "Connected" },
  { key: "no-answer", label: "No answer" },
  { key: "call-later", label: "Call later" },
  { key: "not-relevant", label: "Not relevant" },
];

/** Multiple activities can happen inside one call. */
export const ACTIVITIES = [
  "Requirement captured", "Property explained", "Photos discussed", "Location explained",
  "Amenities explained", "Food explained", "Price quoted", "Discount quoted",
  "Deposit discussed", "Negotiation happened", "Alternative suggested", "Tour proposed",
  "Tour scheduled", "Pre-book discussed", "Quotation explained", "Booking discussed",
  "Follow-up agreed",
] as const;
export type Activity = (typeof ACTIVITIES)[number];

export const PROMISES = [
  "Send property options", "Send photos", "Send videos", "Send pricing",
  "Send location", "Schedule visit", "Call again", "Send booking details", "Send quotation",
] as const;
export type Promise_ = (typeof PROMISES)[number];

export type CustomerReaction =
  | "loved" | "liked-comparing" | "needs-different" | "too-expensive"
  | "location-issue" | "room-issue" | "food-concern" | "family-approval"
  | "just-exploring" | "not-interested";

export const REACTIONS: { key: CustomerReaction; label: string }[] = [
  { key: "loved", label: "Loved option" },
  { key: "liked-comparing", label: "Liked but comparing" },
  { key: "needs-different", label: "Needs different property" },
  { key: "too-expensive", label: "Too expensive" },
  { key: "location-issue", label: "Location issue" },
  { key: "room-issue", label: "Room issue" },
  { key: "food-concern", label: "Food concern" },
  { key: "family-approval", label: "Needs family approval" },
  { key: "just-exploring", label: "Just exploring" },
  { key: "not-interested", label: "Not interested" },
];

export type PriceReaction = "accepted" | "reasonable" | "needs-discount" | "too-expensive" | "family-approval" | "comparing" | "no-reaction";

export const PRICE_REACTIONS: { key: PriceReaction; label: string }[] = [
  { key: "accepted", label: "Accepted" },
  { key: "reasonable", label: "Reasonable" },
  { key: "needs-discount", label: "Needs discount" },
  { key: "too-expensive", label: "Too expensive" },
  { key: "family-approval", label: "Needs family approval" },
  { key: "comparing", label: "Comparing elsewhere" },
  { key: "no-reaction", label: "Didn't react" },
];

export const DISLIKE_REASONS = [
  "Price", "Location", "Room", "Washroom", "Food", "Sharing", "Property quality", "Distance", "Availability date", "Other",
] as const;

export const TOUR_REFUSALS = [
  "Too far", "Not in Bangalore", "Busy", "Doesn't like property enough", "Price issue", "Already saw another PG",
] as const;

export interface PriceQuote {
  propertyName: string;
  roomType: string;
  listed?: number | null;
  quoted: number;
  deposit?: number | null;
  maintenance?: number | null;
  validity?: string;
}

/** What the call learned. */
export interface CallCapture {
  moveIn?: string | null;
  area?: string | null;
  officeOrCollege?: string | null;
  inBangalore?: boolean | null;
  budget?: number | null;
  roomType?: string | null;
  forWhom?: "Self" | "Friend" | "Family" | null;
  matters?: string[];
  reaction?: CustomerReaction | null;
  seen?: "yes" | "partially" | "not-yet" | null;
  propertyName?: string | null;
  dislikeReason?: string | null;
  price?: PriceQuote | null;
  priceReaction?: PriceReaction | null;
  tourAt?: string | null;
  tourRefusal?: string | null;
  activities: string[];
  promises: string[];
  mediaCount?: number;
  note?: string;
}

export const emptyCapture = (): CallCapture => ({ activities: [], promises: [], matters: [] });

/** Movement is the real score — not call count. */
export type MovementClass = "none" | "data" | "property" | "commercial" | "tour" | "booking";

export const MOVEMENT_LABEL: Record<MovementClass, string> = {
  none: "No Movement",
  data: "Data Movement",
  property: "Property Movement",
  commercial: "Commercial Movement",
  tour: "Tour Movement",
  booking: "Booking Movement",
};

export interface FollowUpPlan {
  text: string;
  dueAt: string;
  /** the follow-up cancels itself when this becomes true */
  trigger: string;
}

export interface NextStepPlan {
  kind: NextActionKind;
  label: string;
  dueAt: string;
}

export interface CallOutputs {
  now: string;
  followUp: FollowUpPlan;
  nextStep: NextStepPlan;
  movement: MovementClass;
  mediaHint: string | null;
}

export interface CallRecord {
  id: string;
  ts: string;
  ulid: string;
  canonicalId: string;
  name?: string;
  operatorId: string;
  operatorName: string;
  agenda: AgendaKey;
  agendaSource: "system" | "operator";
  outcome: OutcomeKind;
  durationSec?: number;
  capture: CallCapture;
  movement: MovementClass;
  messageNow: string;
  messageSent: boolean;
  followUp: FollowUpPlan;
  followUpState: "armed" | "cancelled" | "sent";
  nextStep: NextStepPlan;
  stageAfter: string;
  /** operational waste flags, for the admin dashboard */
  waste: string[];
}
