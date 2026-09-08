// Priority Engine — hard overrides P0..P6, then a score. Active 13 = top 13.
import type { Health, MovementState, PriorityBucket } from "./types";

export interface Scored {
  ulid: string;
  state: MovementState;
  bucket: PriorityBucket;
  score: number;
  reason: string;
  health: Health;
  minutesWaiting: number;
  overdueMins: number;
}

const mins = (iso?: string | null) =>
  iso ? Math.max(0, Math.round((Date.now() - +new Date(iso)) / 60000)) : 0;

const untilMins = (iso?: string | null) =>
  iso ? Math.round((+new Date(iso) - Date.now()) / 60000) : Number.POSITIVE_INFINITY;

export function health(st: MovementState): import("./types").Health {
  if (st.stage === "booked" || st.stage === "lost") return "healthy";
  const waiting = mins(st.customerWaitingSince);
  if (st.customerWaitingSince && waiting > 30) return "breached";
  if (st.customerWaitingSince && waiting > 10) return "at-risk";
  if (st.nextAction) {
    const u = untilMins(st.nextAction.dueAt);
    if (u < -30) return "breached";
    if (u < 0) return "action-due";
    if (u < 60) return "due-soon";
    return "healthy";
  }
  if (st.handoffTo && !st.handoffAckAt && mins(st.handoffAt) > 20) return "at-risk";
  if (!st.nextAction && st.stage !== "new" && mins(st.updatedAt) > 24 * 60) return "stuck";
  if (st.stage === "new" && mins(st.updatedAt) > 120) return "at-risk";
  return "healthy";
}

export function scoreLead(st: MovementState): Scored {
  const waiting = mins(st.customerWaitingSince);
  const overdue = st.nextAction ? -untilMins(st.nextAction.dueAt) : 0;
  const tourIn = untilMins(st.tourAt);

  let bucket: PriorityBucket = "P6";
  let reason = "Recovery / dormant";

  if (st.stage === "booked" || st.stage === "lost") {
    bucket = "P6";
    reason = st.stage === "booked" ? "Booked — no action" : "Exited";
  } else if (st.customerWaitingSince && st.unread > 0) {
    bucket = "P0";
    reason = `Customer waiting ${waiting}m`;
  } else if (st.paymentExpected || st.stage === "payment" || st.stage === "negotiation") {
    bucket = "P1";
    reason = "Money on the table";
  } else if (st.tourAt && tourIn < 24 * 60 && tourIn > -12 * 60) {
    bucket = "P2";
    reason = st.tourConfirmed ? "Tour within 24h" : "Tour unconfirmed";
  } else if (st.nextAction && overdue > -15) {
    bucket = "P3";
    reason = overdue > 0 ? `Follow-up overdue ${overdue}m` : "Follow-up due";
  } else if (st.crmDraft === "D1" || (st.goodLead && st.stage !== "new")) {
    bucket = "P4";
    reason = "High intent";
  } else if (st.stage === "new" || st.identity === "shadow") {
    bucket = "P5";
    reason = "Fresh / undrafted";
  }

  const base: Record<PriorityBucket, number> = {
    P0: 1000, P1: 900, P2: 800, P3: 700, P4: 600, P5: 500, P6: 100,
  };
  let score = base[bucket];
  score += Math.min(waiting, 120);
  score += Math.min(Math.max(overdue, 0), 180) / 2;
  if (st.crmDraft === "D1") score += 60;
  if (st.crmDraft === "D2") score += 30;
  if (st.crmDraft === "D4") score -= 40;
  if (st.goodLead) score += 25;
  if (st.checkInDate) {
    const days = (+new Date(st.checkInDate) - Date.now()) / 86400000;
    if (days <= 3) score += 50;
    else if (days <= 7) score += 25;
    else if (days > 30) score -= 20;
  }
  if (st.handoffTo && !st.handoffAckAt) score += 40;

  return {
    ulid: st.ulid, state: st, bucket, score: Math.round(score), reason,
    health: health(st), minutesWaiting: waiting, overdueMins: Math.max(0, overdue),
  };
}

export function rank(states: MovementState[]): Scored[] {
  return states.map(scoreLead).sort((a, b) => b.score - a.score);
}

/** The Active 13: top 13 workable leads from the scored pool. */
export function active13(states: MovementState[], meId?: string): Scored[] {
  return rank(states)
    .filter((s) => s.state.stage !== "booked" && s.state.stage !== "lost")
    .filter((s) => (meId ? !s.state.currentOperatorId || s.state.currentOperatorId === meId : true))
    .slice(0, 13);
}

/** Drafting 30 — the next 30 conversations that still need a draft mark. */
export function drafting30(states: MovementState[]): MovementState[] {
  return states
    .filter((s) => !s.crmDraft || s.waDraft !== s.crmDraft)
    .sort((a, b) => +new Date(b.lastCustomerMsgAt ?? b.updatedAt) - +new Date(a.lastCustomerMsgAt ?? a.updatedAt))
    .slice(0, 30);
}
