import type { MovementEvent, MovementState } from "@/movement/types";
import { health, scoreLead } from "@/movement/priority";
import type { CareGoal } from "./playbooks";

const isToday = (iso: string) => new Date(iso).toDateString() === new Date().toDateString();

export function actualForGoal(goal: CareGoal, states: MovementState[], events: MovementEvent[]) {
  const today = events.filter((event) => isToday(event.ts));
  if (goal === "FIND") return today.filter((event) => event.kind === "good-lead").length;
  if (goal === "SCHEDULE") return today.filter((event) => event.kind === "tour-scheduled").length;
  if (goal === "COMPLETE") {
    return today.filter((event) => ["handoff-ack", "tour-done", "exit"].includes(event.kind)).length;
  }
  return today.filter((event) => ["booked", "payment-received"].includes(event.kind)).length;
}

export function callStats(events: MovementEvent[]) {
  const today = events.filter((event) => isToday(event.ts));
  const results = today.filter((event) => event.kind === "call-result");
  const connected = results.filter((event) => event.to === "connected").length;
  const dialled = Math.max(results.length, today.filter((event) => event.kind === "call-started").length);
  return {
    dialled,
    connected,
    notConnected: results.length - connected,
    rate: dialled ? Math.round((connected / dialled) * 100) : 0,
  };
}

function careWeight(goal: CareGoal, state: MovementState) {
  if (goal === "FIND") return state.stage === "new" || !state.goodLead ? 500 : 0;
  if (goal === "SCHEDULE") return state.goodLead && !state.tourAt ? 500 : state.stage === "qualified" ? 400 : 0;
  if (goal === "COMPLETE") {
    if (state.tourAt && !state.tourConfirmed) return 550;
    if (state.stage === "tour-done" && !state.tourOutcome) return 520;
    if (state.handoffTo && !state.handoffAckAt) return 500;
    return state.nextAction ? 180 : 0;
  }
  if (["tour-done", "quotation", "negotiation", "payment"].includes(state.stage)) return 600;
  return state.paymentExpected || state.prebook.paymentIntent ? 500 : 0;
}

export function queueForGoal(goal: CareGoal, states: MovementState[]) {
  return states
    .filter((state) => !["booked", "check-in", "lost"].includes(state.stage))
    .map((state) => {
      const scored = scoreLead(state);
      return { ...scored, careScore: scored.score + careWeight(goal, state) };
    })
    .sort((a, b) => b.careScore - a.careScore);
}

export function resultStatus(state: MovementState) {
  const result = state.stage === "booked"
    ? "Paid booking"
    : state.stage === "tour-done" && state.tourOutcome
      ? `Tour outcome · ${state.tourOutcome}`
      : state.tourAt
        ? state.tourConfirmed ? "Tour confirmed" : "Tour needs confirmation"
        : state.goodLead
          ? "Qualified · definitely close"
          : state.crmDraft
            ? "Drafted — result still due"
            : "Result not chosen";
  const accountable = Boolean(state.primaryOwnerId && state.nextAction?.dueAt);
  const accepted = Boolean(state.handoffAckAt || state.stage === "booked" || state.stage === "lost");
  return {
    result,
    accountable,
    accepted,
    health: health(state),
    missing: [
      !state.primaryOwnerId ? "owner" : null,
      !state.nextAction && !["booked", "lost"].includes(state.stage) ? "next action" : null,
      !state.nextAction?.dueAt && !["booked", "lost"].includes(state.stage) ? "deadline" : null,
    ].filter(Boolean) as string[],
  };
}