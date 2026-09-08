// Every lead activity the CRM can do, expressed as one flat catalog for Final Moment.
// Each activity applies real Movement OS state changes, so logging here moves the journey.
import type { MovementStore } from "@/movement/store";
import type { MovementState, NextActionKind } from "@/movement/types";
import type { RoundCounter } from "./store";

type MV = MovementStore;

export type Tone = "positive" | "neutral" | "negative";

export interface NextStep {
  key: string;
  label: string;
  /** hours from now; 0 = no follow-up scheduled */
  inHours: number;
  kind: NextActionKind;
}

export interface FMActivity {
  key: string;
  label: string;
  emoji: string;
  tone: Tone;
  hint?: string;
  /** round counter to bump */
  counter?: RoundCounter;
  /** what it does to the lead */
  apply: (mv: MV, s: MovementState, note: string) => void;
  nextSteps: NextStep[];
}

export interface FMCategory {
  key: string;
  label: string;
  activities: FMActivity[];
}

const step = (label: string, inHours: number, kind: NextActionKind): NextStep => ({
  key: `${label}-${inHours}`.toLowerCase().replace(/\W+/g, "-"),
  label,
  inHours,
  kind,
});

const NONE = step("No follow-up needed", 0, "call");

const inDays = (d: number) => new Date(Date.now() + d * 86400000).toISOString();

export const FM_CATEGORIES: FMCategory[] = [
  {
    key: "call",
    label: "📞 Call",
    activities: [
      {
        key: "connected",
        label: "Connected — spoke to customer",
        emoji: "📞",
        tone: "positive",
        counter: "connected",
        hint: "What did they say? Budget, area, move-in, objection.",
        apply: (mv, s, note) => mv.logCall(s.ulid, "connected", note || undefined),
        nextSteps: [
          step("Send options in 1h", 1, "send-property"),
          step("Close call tomorrow", 24, "call"),
          step("Confirm tour today", 4, "confirm-tour"),
          NONE,
        ],
      },
      {
        key: "no-answer",
        label: "No answer",
        emoji: "📵",
        tone: "negative",
        counter: "calls",
        apply: (mv, s, note) => mv.logCall(s.ulid, "no-answer", note || undefined),
        nextSteps: [step("Retry in 2h", 2, "call"), step("Retry tomorrow", 20, "call"), step("WhatsApp now, call in 3 days", 72, "whatsapp")],
      },
      {
        key: "busy",
        label: "Busy / cut the call",
        emoji: "🚫",
        tone: "negative",
        counter: "calls",
        apply: (mv, s, note) => mv.logCall(s.ulid, "busy", note || undefined),
        nextSteps: [step("Retry in 1h", 1, "call"), step("Retry this evening", 6, "call")],
      },
      {
        key: "rejected",
        label: "Rejected the call",
        emoji: "⛔",
        tone: "negative",
        counter: "calls",
        apply: (mv, s, note) => mv.logCall(s.ulid, "rejected", note || undefined),
        nextSteps: [step("WhatsApp instead", 1, "whatsapp"), step("Retry tomorrow", 24, "call")],
      },
      {
        key: "wrong-number",
        label: "Wrong number",
        emoji: "❌",
        tone: "negative",
        apply: (mv, s) => {
          mv.logCall(s.ulid, "wrong-number");
          mv.exit(s.ulid, "unknown", "wrong number");
        },
        nextSteps: [NONE],
      },
      {
        key: "callback",
        label: "Asked to call back later",
        emoji: "🔄",
        tone: "neutral",
        counter: "connected",
        hint: "Exact time they asked for.",
        apply: (mv, s, note) => mv.logCall(s.ulid, "connected", note || "asked for a callback"),
        nextSteps: [step("Call back in 2h", 2, "call"), step("Call back tomorrow", 24, "call"), step("Call back in 3 days", 72, "call")],
      },
    ],
  },
  {
    key: "whatsapp",
    label: "💬 WhatsApp",
    activities: [
      {
        key: "wa-sent",
        label: "Message sent",
        emoji: "💬",
        tone: "neutral",
        counter: "texts",
        hint: "What was sent?",
        apply: (mv, s, note) => mv.sendMessage(s.ulid, note || "Message sent on WhatsApp"),
        nextSteps: [step("Check reply in 3h", 3, "whatsapp"), step("Call if no reply tomorrow", 24, "call")],
      },
      {
        key: "wa-options",
        label: "Sent 3 verified options",
        emoji: "🏠",
        tone: "positive",
        counter: "texts",
        apply: (mv, s) => mv.shareOptions(s.ulid, 3),
        nextSteps: [step("Call for feedback in 2h", 2, "call"), step("Confirm tour tomorrow", 24, "confirm-tour")],
      },
      {
        key: "wa-replied",
        label: "Customer replied",
        emoji: "✅",
        tone: "positive",
        apply: (mv, s, note) => mv.customerReplied(s.ulid, note || undefined),
        nextSteps: [step("Call now while warm", 1, "call"), step("Send shortlist", 2, "send-property")],
      },
      {
        key: "wa-seen",
        label: "Seen, no reply",
        emoji: "👁",
        tone: "negative",
        apply: (mv, s, note) => mv.log(s.ulid, "note", `Seen, no reply${note ? ` — ${note}` : ""}`),
        nextSteps: [step("Nudge in 4h", 4, "whatsapp"), step("Call tomorrow", 24, "call")],
      },
      {
        key: "wa-location",
        label: "Sent location / photos",
        emoji: "📍",
        tone: "neutral",
        counter: "texts",
        apply: (mv, s) => mv.sendMessage(s.ulid, "Sent location pin and room photos"),
        nextSteps: [step("Call in 2h", 2, "call"), NONE],
      },
    ],
  },
  {
    key: "qualify",
    label: "🎯 Qualification",
    activities: [
      {
        key: "requirement",
        label: "Requirement captured",
        emoji: "📋",
        tone: "positive",
        hint: "Area, budget, sharing, move-in date.",
        apply: (mv, s, note) =>
          mv.capture(s.ulid, { location: note || s.zone || null, responding: true, inBangalore: true }),
        nextSteps: [step("Send matched options in 1h", 1, "send-property"), step("Book a visit", 24, "confirm-tour")],
      },
      {
        key: "budget",
        label: "Budget confirmed",
        emoji: "💰",
        tone: "positive",
        hint: "Monthly budget number.",
        apply: (mv, s, note) => {
          const n = Number((note.match(/\d{4,6}/) ?? [])[0] ?? 0);
          mv.capture(s.ulid, n ? { budget: n, responding: true } : { responding: true });
        },
        nextSteps: [step("Shortlist today", 4, "send-property"), step("Book a visit", 24, "confirm-tour")],
      },
      {
        key: "movein",
        label: "Move-in date confirmed",
        emoji: "🗓",
        tone: "positive",
        hint: "e.g. 2026-09-15",
        apply: (mv, s, note) => {
          const d = (note.match(/\d{4}-\d{2}-\d{2}/) ?? [])[0];
          mv.capture(s.ulid, { moveInDate: d ?? inDays(7).slice(0, 10), responding: true });
        },
        nextSteps: [step("Confirm tour", 4, "confirm-tour"), step("Recheck before move-in", 48, "recheck-later")],
      },
      {
        key: "good-lead",
        label: "Marked GOOD LEAD",
        emoji: "⭐",
        tone: "positive",
        apply: (mv, s) => mv.qualify(s.ulid, true),
        nextSteps: [step("Tour or payment push today", 3, "confirm-tour"), step("Send quote", 4, "send-quote")],
      },
      {
        key: "not-good",
        label: "Not a good lead yet",
        emoji: "➖",
        tone: "neutral",
        apply: (mv, s) => mv.qualify(s.ulid, false),
        nextSteps: [step("Recheck in 3 days", 72, "recheck-later"), step("Recheck in 7 days", 168, "recheck-later")],
      },
      {
        key: "date-pushed",
        label: "Move-in pushed to later",
        emoji: "⏭",
        tone: "neutral",
        apply: (mv, s, note) => {
          mv.draft(s.ulid, "D3");
          mv.log(s.ulid, "note", `Move-in pushed${note ? ` — ${note}` : ""}`);
        },
        nextSteps: [step("Recheck in 7 days", 168, "recheck-later"), step("Recheck in 30 days", 720, "recheck-later")],
      },
    ],
  },
  {
    key: "tour",
    label: "🏠 Tour",
    activities: [
      {
        key: "tour-scheduled",
        label: "Tour scheduled",
        emoji: "📅",
        tone: "positive",
        counter: "tours",
        hint: "Property and time.",
        apply: (mv, s, note) => mv.scheduleTour(s.ulid, inDays(1), note || s.tourProperty || "Gharpayy Koramangala"),
        nextSteps: [step("Confirm 2h before", 2, "confirm-tour"), step("Confirm a day before", 20, "confirm-tour")],
      },
      {
        key: "tour-confirmed",
        label: "Tour confirmed by customer",
        emoji: "☑️",
        tone: "positive",
        apply: (mv, s) => mv.confirmTour(s.ulid),
        nextSteps: [step("Post-tour call", 6, "post-tour-call"), NONE],
      },
      {
        key: "tour-done",
        label: "Tour completed",
        emoji: "🚪",
        tone: "positive",
        apply: (mv, s) => mv.tourDone(s.ulid),
        nextSteps: [step("Record result + close call in 2h", 2, "post-tour-call")],
      },
      {
        key: "tour-liked",
        label: "Result: liked the property",
        emoji: "👍",
        tone: "positive",
        apply: (mv, s, note) => {
          mv.recordTourResult(s.ulid, {
            propertySeen: s.tourProperty ?? note ?? "Property",
            liked: true,
            stillLooking: false,
            callPicked: true,
          });
          mv.tourOutcome(s.ulid, "positive");
        },
        nextSteps: [step("Send quote now", 1, "send-quote"), step("Collect token today", 4, "collect-payment")],
      },
      {
        key: "tour-maybe",
        label: "Result: needs time",
        emoji: "🤔",
        tone: "neutral",
        apply: (mv, s, note) => {
          mv.recordTourResult(s.ulid, {
            propertySeen: s.tourProperty ?? "Property",
            liked: false,
            problem: note || undefined,
            stillLooking: true,
            callPicked: true,
          });
          mv.tourOutcome(s.ulid, "maybe");
        },
        nextSteps: [step("Check in after 24h", 24, "call"), step("Send comparison", 4, "send-property")],
      },
      {
        key: "tour-problem",
        label: "Result: property problem",
        emoji: "🛠",
        tone: "negative",
        hint: "What exactly was the problem?",
        apply: (mv, s, note) => {
          mv.recordTourResult(s.ulid, {
            propertySeen: s.tourProperty ?? "Property",
            liked: false,
            problem: note || "property issue",
            stillLooking: true,
            callPicked: true,
          });
          mv.tourOutcome(s.ulid, "property-issue");
        },
        nextSteps: [step("Offer another property in 2h", 2, "send-property"), step("Recheck tomorrow", 24, "call")],
      },
      {
        key: "tour-no-show",
        label: "No-show",
        emoji: "👻",
        tone: "negative",
        apply: (mv, s, note) => mv.log(s.ulid, "note", `Tour no-show${note ? ` — ${note}` : ""}`),
        nextSteps: [step("Call now to reschedule", 1, "call"), step("Retry tomorrow", 24, "call")],
      },
      {
        key: "tour-another",
        label: "Chose another property",
        emoji: "🔁",
        tone: "negative",
        apply: (mv, s) => mv.tourOutcome(s.ulid, "another-property"),
        nextSteps: [step("Pitch our alternative", 3, "send-property"), NONE],
      },
    ],
  },
  {
    key: "close",
    label: "🤝 Quote, negotiation & booking",
    activities: [
      {
        key: "quote",
        label: "Quote sent",
        emoji: "🧾",
        tone: "positive",
        counter: "quotes",
        apply: (mv, s) => mv.sendQuote(s.ulid),
        nextSteps: [step("Chase decision in 4h", 4, "collect-payment"), step("Chase tomorrow", 24, "call")],
      },
      {
        key: "negotiation",
        label: "Price negotiation in progress",
        emoji: "💬",
        tone: "neutral",
        hint: "What are they asking for?",
        apply: (mv, s, note) => {
          mv.setStage(s.ulid, "negotiation", note || "negotiating price");
          mv.setBlocker(s.ulid, "price");
        },
        nextSteps: [step("Manager approval, revert in 4h", 4, "call"), step("Decision call tomorrow", 24, "call")],
      },
      {
        key: "blocker-parent",
        label: "Blocked — parent approval",
        emoji: "👨‍👩‍👦",
        tone: "neutral",
        apply: (mv, s) => mv.setBlocker(s.ulid, "parent-approval"),
        nextSteps: [step("Follow up in 24h", 24, "call"), step("Offer a parent call", 4, "call")],
      },
      {
        key: "blocker-deposit",
        label: "Blocked — deposit / payment timing",
        emoji: "🏦",
        tone: "neutral",
        apply: (mv, s) => mv.setBlocker(s.ulid, "deposit"),
        nextSteps: [step("Offer split plan in 2h", 2, "call"), step("Follow up in 24h", 24, "collect-payment")],
      },
      {
        key: "blocker-room",
        label: "Blocked — room availability",
        emoji: "🚧",
        tone: "negative",
        apply: (mv, s) => mv.setBlocker(s.ulid, "room-availability"),
        nextSteps: [step("Confirm inventory in 2h", 2, "send-property"), NONE],
      },
      {
        key: "blocker-cleared",
        label: "Blocker cleared",
        emoji: "✨",
        tone: "positive",
        apply: (mv, s) => mv.setBlocker(s.ulid, "none"),
        nextSteps: [step("Push to payment now", 1, "collect-payment"), NONE],
      },
      {
        key: "prebook-pitched",
        label: "Pre-booking pitched",
        emoji: "📢",
        tone: "positive",
        apply: (mv, s) => mv.prebook(s.ulid, "pitched"),
        nextSteps: [step("Ask for intent in 2h", 2, "call"), NONE],
      },
      {
        key: "prebook-interested",
        label: "Pre-booking interested",
        emoji: "🙌",
        tone: "positive",
        apply: (mv, s) => mv.prebook(s.ulid, "interested"),
        nextSteps: [step("Collect token today", 4, "collect-payment")],
      },
      {
        key: "payment-intent",
        label: "Payment intent confirmed",
        emoji: "🤝",
        tone: "positive",
        apply: (mv, s) => mv.prebook(s.ulid, "payment-intent"),
        nextSteps: [step("Collect within 4h", 4, "collect-payment"), step("Collect tomorrow", 24, "collect-payment")],
      },
      {
        key: "payment",
        label: "Token / advance received",
        emoji: "💳",
        tone: "positive",
        hint: "Amount received.",
        apply: (mv, s, note) => mv.collectPayment(s.ulid, Number((note.match(/\d{3,7}/) ?? [])[0] ?? 0) || undefined),
        nextSteps: [step("Complete booking today", 3, "collect-payment")],
      },
      {
        key: "booked",
        label: "Booked",
        emoji: "🏁",
        tone: "positive",
        counter: "bookings",
        apply: (mv, s) => mv.book(s.ulid),
        nextSteps: [step("Plan check-in", 48, "recheck-later"), NONE],
      },
      {
        key: "checked-in",
        label: "Checked in",
        emoji: "🔑",
        tone: "positive",
        apply: (mv, s) => mv.checkIn(s.ulid),
        nextSteps: [NONE],
      },
      {
        key: "definite-close",
        label: "Definite close this round",
        emoji: "🔥",
        tone: "positive",
        counter: "closed",
        apply: (mv, s) => {
          mv.qualify(s.ulid, true);
          mv.draft(s.ulid, "D1");
        },
        nextSteps: [step("Close call in 2h", 2, "call"), step("Send quote now", 1, "send-quote")],
      },
    ],
  },
  {
    key: "handoff",
    label: "🔀 Ownership",
    activities: [
      {
        key: "handoff-tcm",
        label: "Handoff to TCM (tour team)",
        emoji: "🚗",
        tone: "neutral",
        apply: (mv, s) => mv.handoff(s.ulid, "tcm"),
        nextSteps: [step("Verify pickup in 1h", 1, "call"), NONE],
      },
      {
        key: "handoff-closing",
        label: "Handoff to Closing",
        emoji: "🧑‍💼",
        tone: "neutral",
        apply: (mv, s) => mv.handoff(s.ulid, "closing"),
        nextSteps: [step("Verify pickup in 1h", 1, "call"), NONE],
      },
      {
        key: "handoff-ops",
        label: "Handoff to Ops",
        emoji: "🧰",
        tone: "neutral",
        apply: (mv, s) => mv.handoff(s.ulid, "ops"),
        nextSteps: [NONE],
      },
      {
        key: "handoff-ack",
        label: "Handoff accepted",
        emoji: "✅",
        tone: "positive",
        apply: (mv, s) => mv.ackHandoff(s.ulid),
        nextSteps: [NONE],
      },
    ],
  },
  {
    key: "other",
    label: "🗂 Other & exit",
    activities: [
      {
        key: "note",
        label: "Note / internal update",
        emoji: "📝",
        tone: "neutral",
        hint: "Anything the next person must know.",
        apply: (mv, s, note) => mv.log(s.ulid, "note", note || "Note added"),
        nextSteps: [NONE, step("Review tomorrow", 24, "call")],
      },
      {
        key: "hold",
        label: "Put on hold",
        emoji: "⏸",
        tone: "neutral",
        apply: (mv, s, note) => {
          mv.setWork(s.ulid, "completed-for-now");
          mv.log(s.ulid, "note", `On hold${note ? ` — ${note}` : ""}`);
        },
        nextSteps: [step("Recheck in 7 days", 168, "recheck-later"), step("Recheck in 14 days", 336, "recheck-later")],
      },
      {
        key: "reactivated",
        label: "Lead reactivated",
        emoji: "♻️",
        tone: "positive",
        apply: (mv, s) => {
          mv.setStage(s.ulid, "qualified", "reactivated");
          mv.draft(s.ulid, "D2");
        },
        nextSteps: [step("Call within 1h", 1, "call")],
      },
      {
        key: "lost-budget",
        label: "Lost — budget",
        emoji: "💸",
        tone: "negative",
        apply: (mv, s, note) => mv.exit(s.ulid, "budget", note || undefined),
        nextSteps: [NONE],
      },
      {
        key: "lost-inventory",
        label: "Lost — no inventory",
        emoji: "🏚",
        tone: "negative",
        apply: (mv, s, note) => mv.exit(s.ulid, "no-inventory", note || undefined),
        nextSteps: [NONE],
      },
      {
        key: "lost-options",
        label: "Lost — didn't like options",
        emoji: "👎",
        tone: "negative",
        apply: (mv, s, note) => mv.exit(s.ulid, "didnt-like-options", note || undefined),
        nextSteps: [NONE],
      },
      {
        key: "lost-noresponse",
        label: "Lost — no response",
        emoji: "🔇",
        tone: "negative",
        apply: (mv, s, note) => mv.exit(s.ulid, "no-response", note || undefined),
        nextSteps: [NONE],
      },
      {
        key: "lost-future",
        label: "Lost — future date",
        emoji: "📆",
        tone: "negative",
        apply: (mv, s, note) => mv.exit(s.ulid, "future-date", note || undefined),
        nextSteps: [step("Revive in 30 days", 720, "recheck-later")],
      },
    ],
  },
];

export const FM_ACTIVITIES = FM_CATEGORIES.flatMap((c) => c.activities.map((a) => ({ ...a, category: c.key })));

export const FM_ACTIVITY_MAP = Object.fromEntries(FM_ACTIVITIES.map((a) => [a.key, a])) as Record<
  string,
  (typeof FM_ACTIVITIES)[number]
>;

export function toneClass(tone: Tone, active: boolean) {
  if (!active) return "border-border text-foreground/80 hover:border-foreground/40";
  if (tone === "positive") return "border-emerald-500 bg-emerald-500/10 text-emerald-600";
  if (tone === "negative") return "border-destructive bg-destructive/10 text-destructive";
  return "border-primary bg-primary/10 text-primary";
}
