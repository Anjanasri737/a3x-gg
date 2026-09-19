import type { MovementEvent, MovementState } from "@/movement/types";
import type { CareRole } from "./playbooks";

export type CheckpointCode = "C1" | "C2" | "C3" | "C4";
export type MetricKind = "cumulative" | "snapshot";
export type CheckpointStatus = "BASELINE" | "AHEAD" | "ON TRACK" | "BEHIND" | "CRITICAL" | "MISSING";

export interface MetricDefinition {
  key: string;
  label: string;
  kind: MetricKind;
  className: "context" | "core" | "outcome" | "risk";
  defaultGoal?: number;
}

export interface MetricResult {
  key: string;
  label: string;
  kind: MetricKind;
  current: number;
  previous: number | null;
  delta: number | null;
  expected: number;
  gap: number;
  attainment: number;
  status: CheckpointStatus;
}

export interface ReasonResult {
  code: string;
  label: string;
  severity: "AMBER" | "RED";
  action: string;
  affectedCustomerIds: string[];
}

export interface CheckpointSnapshot {
  id: string;
  date: string;
  operatorId: string;
  operatorName: string;
  role: CareRole;
  code: CheckpointCode;
  dueAt: string;
  capturedAt: string;
  values: Record<string, number>;
  results: MetricResult[];
  reason: ReasonResult | null;
  recoveryOwner: string;
  recoveryDueAt: string | null;
  recoveryState: "OPEN" | "DONE";
  mustWinCustomerIds: string[];
  note: string;
}

export interface ReasonOverride {
  id: string;
  snapshotId: string;
  taxonomy: string;
  note: string;
  by: string;
  createdAt: string;
  acknowledgedBy: string | null;
  acknowledgedAt: string | null;
}

export interface CarryForward {
  id: string;
  sourceSnapshotId: string;
  date: string;
  customerId: string;
  reason: string;
  action: string;
  owner: string;
  dueAt: string;
  state: "OPEN" | "DONE";
}

export const CHECKPOINTS: Record<CheckpointCode, { label: string; time: string; pace: number; question: string }> = {
  C1: { label: "C1 · 10:30 AM", time: "10:30", pace: 0, question: "What exactly will you win today?" },
  C2: { label: "C2 · 1 PM", time: "13:00", pace: 0.3, question: "What is behind pace, and what will you recover by 5 PM?" },
  C3: { label: "C3 · 5 PM", time: "17:00", pace: 0.7, question: "What is behind pace, and what will you recover by 8 PM?" },
  C4: { label: "C4 · 8 PM", time: "20:00", pace: 1, question: "What finished, what missed, and what carries forward?" },
};

export const ROLE_METRICS: Record<CareRole, MetricDefinition[]> = {
  "flow-ops": [
    { key: "fresh", label: "Fresh leads received", kind: "cumulative", className: "context" },
    { key: "active", label: "Active assigned leads", kind: "snapshot", className: "context" },
    { key: "calls", label: "Calls attempted", kind: "cumulative", className: "core", defaultGoal: 70 },
    { key: "connected", label: "Connected calls", kind: "cumulative", className: "core", defaultGoal: 40 },
    { key: "replied", label: "Customer-replied chats", kind: "cumulative", className: "core" },
    { key: "qualified", label: "Qualified customers", kind: "cumulative", className: "core", defaultGoal: 20 },
    { key: "tours", label: "Tours scheduled", kind: "cumulative", className: "outcome", defaultGoal: 10 },
    { key: "quotes", label: "Quotations sent", kind: "cumulative", className: "outcome", defaultGoal: 6 },
    { key: "untouched", label: "Untouched customers", kind: "snapshot", className: "risk", defaultGoal: 0 },
    { key: "noNext", label: "Customers without next action", kind: "snapshot", className: "risk", defaultGoal: 0 },
  ],
  tcm: [
    { key: "received", label: "Tours received", kind: "cumulative", className: "context" },
    { key: "accepted", label: "Tours accepted", kind: "cumulative", className: "core" },
    { key: "rejected", label: "Tours rejected", kind: "cumulative", className: "risk", defaultGoal: 0 },
    { key: "confirmed", label: "Tours confirmed", kind: "cumulative", className: "core", defaultGoal: 10 },
    { key: "unconfirmed", label: "Unconfirmed tours", kind: "snapshot", className: "risk", defaultGoal: 0 },
    { key: "completed", label: "Tours completed", kind: "cumulative", className: "outcome", defaultGoal: 10 },
    { key: "noShow", label: "No-show / rescheduled", kind: "cumulative", className: "risk", defaultGoal: 0 },
    { key: "feedback", label: "Post-tour feedback done", kind: "cumulative", className: "core" },
    { key: "highIntent", label: "High-intent customers", kind: "snapshot", className: "core" },
    { key: "handoffs", label: "Closing handoffs", kind: "cumulative", className: "outcome" },
    { key: "bookings", label: "Bookings", kind: "cumulative", className: "outcome", defaultGoal: 5 },
    { key: "propertyBlockers", label: "Property / room blockers", kind: "snapshot", className: "risk", defaultGoal: 0 },
  ],
};

const today = (iso: string) => new Date(iso).toDateString() === new Date().toDateString();
const count = (events: MovementEvent[], kinds: string[]) => events.filter((event) => today(event.ts) && kinds.includes(event.kind)).length;

export function deriveValues(role: CareRole, states: MovementState[], events: MovementEvent[]): Record<string, number> {
  const active = states.filter((state) => !["booked", "check-in", "lost"].includes(state.stage));
  if (role === "flow-ops") return {
    fresh: states.filter((state) => today(state.createdAt)).length,
    active: active.length,
    calls: Math.max(count(events, ["call-started"]), count(events, ["call-result"])),
    connected: events.filter((event) => today(event.ts) && event.kind === "call-result" && event.to === "connected").length,
    replied: count(events, ["customer-replied"]),
    qualified: count(events, ["good-lead"]),
    tours: count(events, ["tour-scheduled"]),
    quotes: count(events, ["quote-sent"]),
    untouched: active.filter((state) => !state.lastOutboundAt).length,
    noNext: active.filter((state) => !state.nextAction).length,
  };
  return {
    received: states.filter((state) => Boolean(state.tourAt)).length,
    accepted: count(events, ["handoff-ack"]),
    rejected: states.filter((state) => state.handoffTo === "tcm" && !state.handoffAckAt).length,
    confirmed: count(events, ["tour-confirmed"]),
    unconfirmed: states.filter((state) => state.tourAt && !state.tourConfirmed).length,
    completed: count(events, ["tour-done"]),
    noShow: states.filter((state) => state.tourOutcome === "not-looking").length,
    feedback: count(events, ["tour-result", "tour-outcome"]),
    highIntent: states.filter((state) => state.goodLead && !["booked", "lost"].includes(state.stage)).length,
    handoffs: count(events, ["handoff"]),
    bookings: count(events, ["booked", "payment-received"]),
    propertyBlockers: states.filter((state) => state.blocker === "property" || state.blocker === "room-availability").length,
  };
}

export function calculateResults(role: CareRole, code: CheckpointCode, values: Record<string, number>, previous?: CheckpointSnapshot): MetricResult[] {
  const pace = CHECKPOINTS[code].pace;
  return ROLE_METRICS[role].map((metric) => {
    const current = values[metric.key] ?? 0;
    const prior = previous?.values[metric.key] ?? null;
    const expected = metric.defaultGoal === undefined ? 0 : Math.round(metric.defaultGoal * pace * 10) / 10;
    const inverse = metric.className === "risk";
    const gap = inverse ? expected - current : current - expected;
    const attainment = metric.defaultGoal === undefined || metric.defaultGoal === 0 ? (current === 0 ? 100 : 0) : Math.round((current / metric.defaultGoal) * 100);
    const status: CheckpointStatus = code === "C1" ? "BASELINE" : inverse
      ? current === 0 ? "ON TRACK" : current <= 2 ? "BEHIND" : "CRITICAL"
      : expected === 0 || current >= expected ? (current > expected ? "AHEAD" : "ON TRACK") : current >= expected * 0.65 ? "BEHIND" : "CRITICAL";
    return { key: metric.key, label: metric.label, kind: metric.kind, current, previous: prior, delta: prior === null ? null : current - prior, expected, gap, attainment, status };
  });
}

const ids = (states: MovementState[], test: (state: MovementState) => boolean) => states.filter(test).map((state) => state.ulid);

export function diagnose(role: CareRole, values: Record<string, number>, results: MetricResult[], states: MovementState[]): ReasonResult | null {
  const behind = (key: string) => results.find((item) => item.key === key)?.status === "BEHIND" || results.find((item) => item.key === key)?.status === "CRITICAL";
  if (role === "flow-ops") {
    if (behind("tours") && behind("calls")) return { code: "LOW_CALL_VOLUME", label: "Low call volume", severity: "RED", action: "Open callable customers and complete a recovery call block.", affectedCustomerIds: ids(states, (s) => !s.lastOutboundAt && !["booked", "lost"].includes(s.stage)) };
    if (behind("connected") && values.calls > 0) return { code: "LOW_CONNECT_RATE", label: "Low connect rate", severity: "RED", action: "Retry calls, use WhatsApp fallback, and inspect source and timing.", affectedCustomerIds: ids(states, (s) => !s.q.responding && !["booked", "lost"].includes(s.stage)) };
    if (behind("qualified")) return { code: "LOW_QUALIFICATION_RATE", label: "Low qualification rate", severity: "AMBER", action: "Review feasibility and customer quality.", affectedCustomerIds: ids(states, (s) => !s.goodLead && s.q.responding === true) };
    if (behind("tours")) return { code: "QUALIFIED_NOT_MOVED_TO_TOUR", label: "Qualified customers not moved to tour", severity: "RED", action: "Open the qualified-without-tour group and lock property, inventory and time.", affectedCustomerIds: ids(states, (s) => s.goodLead && !s.tourAt) };
    if (behind("quotes")) return { code: "QUOTATIONS_NOT_SENT", label: "Quotations not sent", severity: "AMBER", action: "Open quotation-due customers and send approved terms.", affectedCustomerIds: ids(states, (s) => s.stage === "tour-done" && !s.prebook.pitched) };
  } else {
    if (values.rejected > 0) return { code: "TOURS_PENDING_REJECTED", label: "Tours pending or rejected", severity: "RED", action: "Accept or reassign the handoffs now.", affectedCustomerIds: ids(states, (s) => s.handoffTo === "tcm" && !s.handoffAckAt) };
    if (values.unconfirmed > 0) return { code: "TOUR_CONFIRMATION_GAP", label: "Tour confirmation gap", severity: "RED", action: "Call the customer and property, then confirm the visit owner.", affectedCustomerIds: ids(states, (s) => Boolean(s.tourAt) && !s.tourConfirmed) };
    if (values.feedback < values.completed) return { code: "POST_TOUR_FEEDBACK_PENDING", label: "Post-tour feedback pending", severity: "RED", action: "Capture the customer outcome now.", affectedCustomerIds: ids(states, (s) => s.stage === "tour-done" && !s.tourOutcome) };
    if (values.propertyBlockers > 0) return { code: "PROPERTY_ROOM_BLOCKER", label: "Property or room blocker", severity: "RED", action: "Confirm inventory truth or move the customer to a feasible property.", affectedCustomerIds: ids(states, (s) => s.blocker === "property" || s.blocker === "room-availability") };
    if (behind("bookings")) return { code: "POST_TOUR_CLOSING_GAP", label: "Post-tour closing gap", severity: "AMBER", action: "Quote and hand over the highest-intent post-tour customers.", affectedCustomerIds: ids(states, (s) => ["tour-done", "quotation", "negotiation", "payment"].includes(s.stage)) };
  }
  return null;
}

export function checkpointDue(date: string, code: CheckpointCode) {
  return new Date(`${date}T${CHECKPOINTS[code].time}:00`).toISOString();
}
