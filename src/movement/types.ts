// Gharpayy Customer Movement OS — one journey, six truths, append-only events.

export type DraftCode = "D1" | "D2" | "D3" | "D4";

export const DRAFT_META: Record<DraftCode, { label: string; hint: string }> = {
  D1: { label: "D1 · Immediate", hint: "Ready now — tour / payment intent" },
  D2: { label: "D2 · Active", hint: "Talking, needs a push" },
  D3: { label: "D3 · Future", hint: "Real, but later" },
  D4: { label: "D4 · Cold", hint: "No response / not looking" },
};

export type FunnelStage =
  | "new" | "qualified" | "matched" | "tour-scheduled" | "tour-done"
  | "quotation" | "negotiation" | "payment" | "booked" | "lost";

export const FUNNEL_ORDER: FunnelStage[] = [
  "new", "qualified", "matched", "tour-scheduled", "tour-done",
  "quotation", "negotiation", "payment", "booked", "lost",
];

export type WorkState =
  | "available" | "drafting" | "in-work" | "calling" | "waiting-customer"
  | "next-action-scheduled" | "handoff-pending" | "completed-for-now";

export type NextActionKind =
  | "call" | "whatsapp" | "send-property" | "confirm-tour"
  | "post-tour-call" | "send-quote" | "collect-payment" | "recheck-later";

export type Health = "healthy" | "due-soon" | "action-due" | "at-risk" | "breached" | "stuck";

export type PriorityBucket = "P0" | "P1" | "P2" | "P3" | "P4" | "P5" | "P6";

export const PRIORITY_LABEL: Record<PriorityBucket, string> = {
  P0: "CUSTOMER WAITING",
  P1: "REVENUE NOW",
  P2: "TOUR NOW",
  P3: "FOLLOW-UP DUE",
  P4: "HIGH INTENT",
  P5: "FRESH",
  P6: "RECOVERY",
};

export type IdentityLevel = "shadow" | "qualified" | "full";

export type CallResult = "connected" | "no-answer" | "busy" | "wrong-number" | "rejected";

export type Blocker =
  | "price" | "property" | "parent-approval" | "room-availability"
  | "deposit" | "move-in-date" | "payment-timing" | "trust" | "none";

export type LossReason =
  | "future-date" | "budget" | "no-inventory" | "no-response"
  | "didnt-like-options" | "not-pitched" | "unknown";

export interface NextAction {
  kind: NextActionKind;
  dueAt: string;
  ownerId: string;
  ownerName: string;
  note?: string;
}

export interface LiveLock {
  ulid: string;
  operatorId: string;
  operatorName: string;
  startedAt: string;
  objective: string;
  /** minutes of inactivity before the lock auto-releases */
  ttlMins: number;
  lastTouchAt: string;
}

export interface MovementState {
  ulid: string;
  identity: IdentityLevel;
  /** WhatsApp-side draft (signal layer) */
  waDraft: DraftCode | null;
  /** CRM-side draft (system of record) */
  crmDraft: DraftCode | null;
  draftedAt?: string;
  draftedById?: string;
  draftedByName?: string;
  batchId?: string;

  stage: FunnelStage;
  work: WorkState;

  primaryOwnerId: string;
  primaryOwnerName: string;
  currentOperatorId?: string | null;
  currentOperatorName?: string | null;

  nextAction: NextAction | null;

  customerWaitingSince?: string | null;
  unread: number;
  lastCustomerMsgAt?: string | null;
  lastOutboundAt?: string | null;

  goodLead: boolean;
  checkInDate?: string | null;
  tourAt?: string | null;
  tourConfirmed?: boolean;
  tourOutcome?: "positive" | "maybe" | "property-issue" | "not-looking" | null;
  blocker?: Blocker;
  lossReason?: LossReason | null;
  paymentExpected?: boolean;

  handoffTo?: "tcm" | "closing" | "ops" | null;
  handoffAt?: string | null;
  handoffAckAt?: string | null;

  updatedAt: string;
}

export type MovementEventKind =
  | "ingested" | "drafted" | "draft-synced" | "claimed" | "released"
  | "call-started" | "call-result" | "message-sent" | "customer-replied"
  | "qualified" | "good-lead" | "matched"
  | "tour-scheduled" | "tour-confirmed" | "tour-done" | "tour-outcome"
  | "prebook-pitched" | "prebook-interested" | "payment-intent"
  | "quote-sent" | "negotiation" | "payment-received" | "booked" | "checked-in"
  | "next-action-set" | "next-action-done" | "handoff" | "handoff-ack"
  | "exit" | "note";

export interface MovementEvent {
  id: string;
  ts: string;
  ulid: string;
  kind: MovementEventKind;
  actorId: string;
  actorName: string;
  text: string;
  from?: string;
  to?: string;
  batchId?: string;
  position?: string;
  meta?: Record<string, unknown>;
}

export interface DraftBatch {
  id: string;
  label: "G1" | "G2" | "G3" | "G4" | "CLOSURE";
  size: number;
  ulids: string[];
  startedAt: string;
  endedAt?: string;
  operatorId: string;
  operatorName: string;
  cursor: number;
}

export interface UnmatchedChat {
  id: string;
  phoneRaw: string;
  waAccount: string;
  name?: string;
  lastMessage?: string;
  reason: string;
  ts: string;
  retries: number;
}

export interface Checkpoint {
  id: string;
  at: string;
  label: "1PM" | "5PM" | "EOD";
  totals: Record<string, number>;
}
