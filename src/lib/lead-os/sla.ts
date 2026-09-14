// SLA clocks, escalation and "how to approach next" guidance derived from the
// conversation bucket library. Screenshot evidence stays evidence: this layer
// only decides urgency and the recommended operator move.
import type { LibraryBucket } from "./library";

export type SlaState = "OK" | "DUE" | "BREACH" | "CRITICAL" | "REVIEW";

export interface SlaVerdict {
  state: SlaState;
  ageMin: number;
  slaMin: number;
  overdueMin: number;
  label: string;
  tone: "ok" | "warn" | "danger" | "muted";
  escalate: boolean;
}

export const SLA_FILTERS = ["ALL", "BREACH", "DUE", "OK", "REVIEW", "ESCALATED"] as const;
export type SlaFilter = (typeof SLA_FILTERS)[number];

export const WAITING_PARTIES = [
  "CUSTOMER",
  "GHARPAYY",
  "SUPPLY",
  "TOUR_TEAM",
  "CLOSING",
  "OTHER_TEAM",
  "EXTERNAL",
  "REVIEW",
  "NONE",
] as const;

function minsSince(value?: string | null): number {
  if (!value) return Number.POSITIVE_INFINITY;
  const t = Date.parse(value);
  if (Number.isNaN(t)) return Number.POSITIVE_INFINITY;
  return Math.max(0, Math.round((Date.now() - t) / 60000));
}

export function humanAge(min: number): string {
  if (!Number.isFinite(min)) return "never";
  if (min < 60) return `${min}m`;
  if (min < 60 * 48) return `${Math.round(min / 60)}h`;
  return `${Math.round(min / 1440)}d`;
}

export function computeSla(input: {
  lastActivityAt?: string | null;
  bucket?: LibraryBucket | null;
  owned: boolean;
  closed?: boolean;
}): SlaVerdict {
  const ageMin = minsSince(input.lastActivityAt);
  const slaMin = Number(input.bucket?.sla_min ?? 0) || 0;
  const safeAge = Number.isFinite(ageMin) ? ageMin : 60 * 24 * 30;

  if (input.closed) {
    return { state: "OK", ageMin: safeAge, slaMin, overdueMin: 0, label: "Closed — heartbeat stopped", tone: "muted", escalate: false };
  }
  if (!slaMin) {
    return {
      state: "REVIEW",
      ageMin: safeAge,
      slaMin: 0,
      overdueMin: 0,
      label: `Needs review · idle ${humanAge(safeAge)}`,
      tone: safeAge > 1440 ? "warn" : "muted",
      escalate: !input.owned && safeAge > 1440,
    };
  }

  const overdueMin = Math.max(0, safeAge - slaMin);
  if (safeAge >= slaMin * 3) {
    return { state: "CRITICAL", ageMin: safeAge, slaMin, overdueMin, label: `Critical · ${humanAge(overdueMin)} past SLA`, tone: "danger", escalate: true };
  }
  if (safeAge >= slaMin) {
    return { state: "BREACH", ageMin: safeAge, slaMin, overdueMin, label: `Breached · ${humanAge(overdueMin)} past SLA`, tone: "danger", escalate: !input.owned };
  }
  if (safeAge >= slaMin * 0.75) {
    return { state: "DUE", ageMin: safeAge, slaMin, overdueMin: 0, label: `Due soon · ${humanAge(slaMin - safeAge)} left`, tone: "warn", escalate: false };
  }
  return { state: "OK", ageMin: safeAge, slaMin, overdueMin: 0, label: `On time · ${humanAge(slaMin - safeAge)} left`, tone: "ok", escalate: false };
}

/** Heartbeat rule: open requirement with no fresh screenshot in 24h. */
export function screenshotHeartbeat(lastObservationAt?: string | null, closed?: boolean) {
  if (closed) return { state: "STOPPED" as const, label: "Heartbeat stopped — requirement closed" };
  const age = minsSince(lastObservationAt);
  if (!Number.isFinite(age)) return { state: "SCREENSHOT_NOT_RECEIVED" as const, label: "No screenshot evidence yet — state unknown" };
  if (age >= 2880) return { state: "SCREENSHOT_NOT_RECEIVED" as const, label: `Critical — no fresh screenshot for ${humanAge(age)}` };
  if (age >= 1440) return { state: "SCREENSHOT_NOT_RECEIVED" as const, label: `No fresh screenshot for ${humanAge(age)} — state unknown` };
  if (age >= 1200) return { state: "DUE" as const, label: `Screenshot refresh due (${humanAge(age)} old)` };
  return { state: "FRESH" as const, label: `Fresh evidence ${humanAge(age)} old` };
}

export interface ApproachPlan {
  headline: string;
  why: string;
  moves: string[];
  message: string;
  guardrail?: string;
}

const BY_WAITING: Record<string, { headline: string; moves: string[]; message: string }> = {
  CUSTOMER: {
    headline: "Chase the customer for the missing answer",
    moves: ["Call once now", "If no answer, send the WhatsApp follow-up", "Log the outcome and set the next action time"],
    message: "Hi {name}, following up on your stay requirement — could you confirm the details we asked for so I can lock the best options for you?",
  },
  GHARPAYY: {
    headline: "We owe the customer the next message",
    moves: ["Prepare the promised options or answer", "Send it on WhatsApp now", "Capture a fresh screenshot as evidence"],
    message: "Hi {name}, here are the options that match what you shared. Tell me which one you'd like to visit and I'll fix the slot.",
  },
  SUPPLY: {
    headline: "Supply gap — raise a demand signal",
    moves: ["Log the budget/location gap to supply", "Offer the nearest feasible alternative", "Set a callback for when inventory opens"],
    message: "Hi {name}, we're arranging an option that fits your budget and area. I'll update you as soon as it's confirmed.",
  },
  TOUR_TEAM: {
    headline: "Tour team owns this — confirm the visit",
    moves: ["Confirm the slot with the tour team", "Re-confirm with the customer", "Keep the arrival window visible"],
    message: "Hi {name}, confirming your visit. Please share a time that works and I'll have someone ready at the property.",
  },
  CLOSING: {
    headline: "Closing owns this — push the paperwork",
    moves: ["Check quote/negotiation status", "Remove the last objection", "Set the booking date"],
    message: "Hi {name}, shall we lock the room for you? I'll share the booking link once you confirm.",
  },
  OTHER_TEAM: {
    headline: "Handoff not accepted yet",
    moves: ["Verify the receiving owner accepted", "If not accepted, escalate to Control Tower", "Keep the customer warm meanwhile"],
    message: "Hi {name}, my colleague will call you shortly with the next steps.",
  },
  EXTERNAL: {
    headline: "Blocked outside the team",
    moves: ["Record the external blocker", "Set a realistic recheck time", "Tell the customer the expected date"],
    message: "Hi {name}, we're waiting on a confirmation from our side and will update you shortly.",
  },
  REVIEW: {
    headline: "Not safe to act — resolve context first",
    moves: ["Open the last screenshot rows", "Find the question this reply answers", "Reclassify, then act"],
    message: "",
  },
};

export function buildApproach(input: {
  name?: string | null;
  bucket?: LibraryBucket | null;
  lastMessage?: string | null;
  direction?: string | null;
  draftDetected?: boolean;
}): ApproachPlan {
  const waiting = String(input.bucket?.waiting_on || "REVIEW").toUpperCase();
  const base = BY_WAITING[waiting] ?? BY_WAITING.REVIEW;
  const name = (input.name || "there").split(" ")[0];

  if (input.draftDetected) {
    return {
      headline: "Unsent draft is sitting in WhatsApp",
      why: "A draft was visible in the screenshot, so this message never reached the customer. It does not count as contact.",
      moves: ["Open the chat", "Send or rewrite the draft now", "Re-capture the screenshot to prove it was sent"],
      message: (base.message || "").replace("{name}", name),
      guardrail: "Do not mark this customer as contacted until the message is actually sent.",
    };
  }

  return {
    headline: base.headline,
    why:
      input.bucket?.rule_reason ||
      `Conversation is in ${String(input.bucket?.bucket || "an unclassified state").replaceAll("_", " ").toLowerCase()}, waiting on ${waiting.toLowerCase()}.`,
    moves: base.moves,
    message: (base.message || "").replace("{name}", name),
    guardrail:
      waiting === "REVIEW"
        ? "Short replies like yes/ok need the previous question. Never guess the state — send it to review instead."
        : undefined,
  };
}
