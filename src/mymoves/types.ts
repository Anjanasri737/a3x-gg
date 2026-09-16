// My Moves — Gharpayy Booking OS. One lead = one workspace, driven by state.
export type Stage =
  | "CAPTURED" | "IDENTITY_RESOLUTION" | "DUPLICATE_REVIEW" | "IDENTIFIED" | "UNOWNED"
  | "QUALIFYING" | "MATCHING" | "PROPERTY_SHARED" | "CALL_REQUIRED"
  | "TOUR_READY" | "TOUR_SCHEDULED" | "EN_ROUTE" | "ARRIVED" | "TOUR_LIVE" | "POST_TOUR"
  | "NEGOTIATING" | "QUOTE_SENT" | "TOKEN_PENDING" | "BOOKING_CREATED" | "APPROVAL_PENDING"
  | "ROOM_HELD" | "PAYMENT_PENDING" | "RESERVED" | "CHECKIN_READY" | "CHECKED_IN"
  | "SETTLED" | "LOST" | "FUTURE" | "INVALID";

export type WaPresence =
  | "ACTIVE_CHAT" | "OLD_CHAT" | "AWAITING_FIRST_RESPONSE" | "NO_CHAT"
  | "NOT_ON_WHATSAPP" | "OTHER_GHARPAYY_NUMBER" | "MULTIPLE_CHATS";

export type Timing = "IMMEDIATE" | "TODAY" | "THIS_WEEK" | "FUTURE";
export type Likelihood = "VERY_HIGH" | "HIGH" | "MEDIUM" | "LOW";
export type Journey =
  | "QUALIFYING" | "PROPERTY_OPTIONS" | "CALL_REQUIRED" | "TOUR_READY" | "TOUR_SCHEDULED"
  | "POST_TOUR" | "NEGOTIATING" | "TOKEN_PENDING" | "BOOKED";
export type Problem =
  | "NONE" | "NO_RESPONSE" | "PRICE" | "BUDGET" | "LOCATION" | "INVENTORY" | "ROOM_TYPE"
  | "PARENT_APPROVAL" | "DECISION_DELAY" | "TRY_NEARBY" | "OTHER";

export type Intent = "READY_TO_BOOK" | "READY_TO_VISIT" | "COMPARING" | "JUST_EXPLORING";

export interface Requirement {
  area?: string;
  officeOrCollege?: string;
  moveIn?: string;
  budget?: number;
  maxBudget?: number;
  roomType?: string;
  whoIsStaying?: string;
  duration?: string;
  nonNegotiables?: string[];
  decisionMaker?: string;
  intent?: Intent;
  food?: string;
  parking?: string;
}

export const REQUIREMENT_FIELDS: { key: keyof Requirement; label: string }[] = [
  { key: "area", label: "Area" },
  { key: "officeOrCollege", label: "Office / college" },
  { key: "moveIn", label: "Move-in" },
  { key: "budget", label: "Budget" },
  { key: "roomType", label: "Room type" },
  { key: "whoIsStaying", label: "Who is staying" },
  { key: "duration", label: "Duration" },
  { key: "nonNegotiables", label: "Non-negotiables" },
  { key: "decisionMaker", label: "Decision maker" },
  { key: "intent", label: "Intent" },
];

export interface EngagementDone {
  propertyShared?: boolean;
  mediaShared?: boolean;
  priceDiscussed?: boolean;
  callDone?: boolean;
  tourDiscussed?: boolean;
  tourScheduled?: boolean;
  tourCompleted?: boolean;
  quotationSent?: boolean;
  objectionIdentified?: boolean;
}

export interface PropertyOption {
  id: string;
  name: string;
  roomType: string;
  room?: string;
  rent: number;
  deposit?: number;
  maintenance?: number;
  bookingAmount?: number;
  availableFrom: string;
  distanceKm: number;
  matchPct: number;
  why: string[];
  concern?: string;
}

export interface Quote {
  id: string;
  propertyId: string;
  room: string;
  roomType: string;
  actualRent: number;
  offerRent: number;
  deposit: number;
  maintenance: number;
  lockIn: string;
  notice: string;
  bookingAmount: number;
  validUntil: string;
  moveIn: string;
  sentAt?: string;
  outcome?: string;
}

export interface Booking {
  id: string;
  propertyId: string;
  propertyName: string;
  room: string;
  roomType: string;
  rent: number;
  deposit: number;
  maintenance: number;
  bookingAmount: number;
  discount: number;
  moveIn: string;
  lockIn: string;
  notice: string;
  quoteId?: string;
  leadOwner: string;
  tourOwner?: string;
  createdBy: string;
  createdAt: string;
  inventoryApproval?: "PENDING" | "YES" | "NO" | "DIFFERENT_ROOM";
  commercialApproval?: "PENDING" | "YES" | "CORRECTION_REQUIRED";
  approvalNote?: string;
  roomHeldUntil?: string;
  finalRoomLock?: boolean;
  customerConfirmed?: boolean;
}

export interface Payment {
  id: string;
  amount: number;
  paidTo: "GHARPAYY" | "PROPERTY" | "SPLIT";
  mode: "UPI" | "BANK" | "CASH" | "OTHER";
  proof: boolean;
  verified: boolean;
  at: string;
}

export interface Tour {
  propertyId: string;
  propertyName: string;
  room: string;
  at: string;
  handledBy: "OPERATOR" | "TCM";
  tourOwner: string;
  handoverAccepted?: boolean;
  propertyInformed?: boolean;
  propertyAcknowledged?: boolean;
  customerConfirmed?: "YES" | "LATE" | "RESCHEDULE" | "CANCEL";
  eta?: string;
  metRepresentative?: boolean;
  startedAt?: string;
  completedAt?: string;
  reaction?: "LOVED_IT" | "LIKED_IT" | "UNSURE" | "DID_NOT_LIKE";
  preferredRoom?: string;
  blocker?: string;
}

export interface CheckinReadiness {
  roomReady?: boolean;
  cleaning?: boolean;
  bed?: boolean;
  cupboard?: boolean;
  wifi?: boolean;
  keys?: boolean;
  maintenanceIssue?: boolean;
  balanceKnown?: boolean;
  balanceAmount?: number;
  customerEta?: string;
  handedOver?: boolean;
  inspected?: boolean;
  balanceCollected?: boolean;
  issue?: string;
}

export interface Settlement {
  paidToGharpayy: number;
  paidToProperty: number;
  owedToProperty: number;
  owedToGharpayy: number;
  commission: number;
  status: "OPEN" | "SETTLED";
}

export interface LeadEvent {
  id: string;
  at: string;
  actor: string;
  kind: string;
  label: string;
  detail?: string;
}

export interface ChatLine {
  at: string;
  from: "CUSTOMER" | "TEAM";
  text: string;
}

export interface Lead {
  id: string;
  name: string;
  phone: string;
  waAccount: string;
  waPresence: WaPresence;
  duplicateOf?: string[];
  identityNote?: string;

  owner?: string;
  ownerSince?: string;
  handoverTo?: string;

  stage: Stage;
  nextAction?: string;
  nextActionAt?: string;
  channel: "WHATSAPP" | "CALL" | "WALK_IN" | "REFERRAL" | "WEBSITE";
  blocker?: string;
  lostReason?: string;
  futureDecisionAt?: string;
  followUpAt?: string;

  labels: { timing?: Timing; likelihood?: Likelihood; journey?: Journey; problem?: Problem };
  requirement: Requirement;
  reconstructionVerified?: boolean;
  engagement: EngagementDone;

  feasibility?: string;
  matches: PropertyOption[];
  selectedPropertyId?: string;
  rejectionReason?: string;

  tour?: Tour;
  quote?: Quote;
  booking?: Booking;
  payments: Payment[];
  checkin?: CheckinReadiness;
  settlement?: Settlement;

  openQuestion?: string;
  openObjection?: string;
  expectedPrice?: number;
  approvalRequested?: boolean;

  lastCustomerMsgAt?: string;
  lastTeamMsgAt?: string;
  lastScreenshotAt?: string;
  chat: ChatLine[];
  events: LeadEvent[];
  useCase: string;
}
