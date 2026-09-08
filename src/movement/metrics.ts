// Event-driven metrics — funnel, leakage, checkpoint totals, loss reasons.
import type { MovementEvent, MovementState, FunnelStage, LossReason } from "./types";
import { FUNNEL_ORDER } from "./types";
import { health, scoreLead } from "./priority";

export interface FunnelRow {
  stage: FunnelStage;
  count: number;
  pct: number;
  dropFromPrev: number;
}

const LIVE: FunnelStage[] = FUNNEL_ORDER.filter((s) => s !== "lost");

export function funnel(states: MovementState[]): FunnelRow[] {
  const reached = (s: MovementState, stage: FunnelStage) => {
    if (s.stage === "lost") {
      // credit the deepest stage evidence we have
      if (stage === "new") return true;
      if (stage === "qualified") return s.goodLead;
      if (stage === "tour-scheduled" || stage === "matched") return !!s.tourAt;
      if (stage === "tour-done") return !!s.tourOutcome;
      return false;
    }
    return LIVE.indexOf(s.stage) >= LIVE.indexOf(stage);
  };
  const total = states.length || 1;
  let prev = 0;
  return LIVE.map((stage, i) => {
    const count = states.filter((s) => reached(s, stage)).length;
    const row: FunnelRow = {
      stage,
      count,
      pct: Math.round((count / total) * 100),
      dropFromPrev: i === 0 ? 0 : Math.max(0, prev - count),
    };
    prev = count;
    return row;
  });
}

export interface Leak {
  label: string;
  count: number;
  hint: string;
}

export function leaks(states: MovementState[]): Leak[] {
  const m = (iso?: string | null) => (iso ? (Date.now() - +new Date(iso)) / 60000 : 0);
  return [
    {
      label: "Customer waiting > 10m",
      count: states.filter((s) => s.customerWaitingSince && m(s.customerWaitingSince) > 10).length,
      hint: "Reply now — P0 override",
    },
    {
      label: "No next action",
      count: states.filter(
        (s) => !s.nextAction && !["booked", "lost", "new"].includes(s.stage),
      ).length,
      hint: "Every live lead must own a next step",
    },
    {
      label: "Undrafted conversations",
      count: states.filter((s) => !s.crmDraft).length,
      hint: "Run a drafting batch",
    },
    {
      label: "Draft mismatch (WA vs CRM)",
      count: states.filter((s) => s.waDraft && s.crmDraft && s.waDraft !== s.crmDraft).length,
      hint: "Sync in one tap",
    },
    {
      label: "Tours unconfirmed",
      count: states.filter((s) => s.tourAt && !s.tourConfirmed && s.stage === "tour-scheduled").length,
      hint: "Confirm date, time and property",
    },
    {
      label: "Tour done, no outcome",
      count: states.filter((s) => s.stage === "tour-done" && !s.tourOutcome).length,
      hint: "Outcome is mandatory",
    },
    {
      label: "Handoff unacknowledged",
      count: states.filter((s) => s.handoffTo && !s.handoffAckAt).length,
      hint: "Receiving team must accept",
    },
    {
      label: "Stuck > 24h",
      count: states.filter((s) => health(s) === "stuck").length,
      hint: "Revive or exit with a reason",
    },
  ];
}

export function totals(states: MovementState[], events: MovementEvent[]) {
  const today = new Date().toDateString();
  const todays = events.filter((e) => new Date(e.ts).toDateString() === today);
  const count = (k: MovementEvent["kind"]) => todays.filter((e) => e.kind === k).length;
  const scored = states.map(scoreLead);
  return {
    conversations: states.length,
    drafted: states.filter((s) => !!s.crmDraft).length,
    d1: states.filter((s) => s.crmDraft === "D1").length,
    goodLeads: states.filter((s) => s.goodLead).length,
    calls: count("call-result"),
    connected: todays.filter((e) => e.kind === "call-result" && e.to === "connected").length,
    messages: count("message-sent"),
    toursScheduled: count("tour-scheduled"),
    toursDone: count("tour-done"),
    quotes: count("quote-sent"),
    payments: count("payment-received"),
    booked: count("booked"),
    exits: count("exit"),
    p0: scored.filter((s) => s.bucket === "P0").length,
    breached: scored.filter((s) => s.health === "breached").length,
  };
}

export function lossReasons(states: MovementState[]): { reason: LossReason; count: number }[] {
  const map = new Map<LossReason, number>();
  states
    .filter((s) => s.stage === "lost")
    .forEach((s) => {
      const r = s.lossReason ?? "unknown";
      map.set(r, (map.get(r) ?? 0) + 1);
    });
  return [...map.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count);
}

export function operatorBoard(states: MovementState[], events: MovementEvent[]) {
  const byOwner = new Map<string, { name: string; live: number; booked: number; touches: number; breached: number }>();
  for (const s of states) {
    const id = s.primaryOwnerId || "unassigned";
    const row = byOwner.get(id) ?? { name: s.primaryOwnerName || "Unassigned", live: 0, booked: 0, touches: 0, breached: 0 };
    if (s.stage === "booked") row.booked += 1;
    else if (s.stage !== "lost") row.live += 1;
    if (health(s) === "breached") row.breached += 1;
    byOwner.set(id, row);
  }
  const today = new Date().toDateString();
  for (const e of events) {
    if (new Date(e.ts).toDateString() !== today) continue;
    for (const [, row] of byOwner) if (row.name === e.actorName) row.touches += 1;
  }
  return [...byOwner.entries()].map(([id, r]) => ({ id, ...r })).sort((a, b) => b.booked - a.booked || b.live - a.live);
}
