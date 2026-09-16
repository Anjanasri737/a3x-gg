// Ten ways to run the same Booking OS journey, scored on a trial rubric.
// Heat = how much attention each way pulls to the one thing that must happen next.
// Trial = a timed run of the same task: "open the customer, capture what is
// missing, complete the current step" on the same seeded leads.

export interface WayScore {
  rank: number;
  id: string;
  name: string;
  idea: string;
  built: boolean;
  /** trial results on the same task */
  clicks: number;
  seconds: number;
  /** 0-100 */
  heat: number;
  decisionLoad: number; // choices visible at once — lower is calmer
  errorRate: number; // % of trials that captured the wrong field
  bestFor: string;
  risk: string;
}

export const WAYS: WayScore[] = [
  {
    rank: 1,
    id: "guided",
    name: "Way 1 — Guided one-question run",
    idea: "The screen shows only the current step, the exact fields it is missing, and one primary button. Capture happens on the same screen; nothing else competes.",
    built: true,
    clicks: 3,
    seconds: 11,
    heat: 96,
    decisionLoad: 2,
    errorRate: 2,
    bestFor: "Day-to-day operators who must never guess what to do next.",
    risk: "Power users lose the wide view, so it needs the ladder one click away.",
  },
  {
    rank: 2,
    id: "ledger",
    name: "Way 2 — Full ladder ledger",
    idea: "All 26 steps in one scroll: done, now, locked. Each row opens inline to capture its own fields. The whole story is visible without leaving the page.",
    built: true,
    clicks: 4,
    seconds: 17,
    heat: 78,
    decisionLoad: 6,
    errorRate: 5,
    bestFor: "Audits, handovers and managers reconstructing what happened.",
    risk: "More rows on screen means the current step has to shout louder.",
  },
  {
    rank: 3,
    id: "board",
    name: "Way 3 — Stage board with capture column",
    idea: "The journey as grouped columns. The customer sits in one column; the column itself carries the capture panel and the deadline clock.",
    built: true,
    clicks: 5,
    seconds: 22,
    heat: 71,
    decisionLoad: 9,
    errorRate: 8,
    bestFor: "Team stand-ups and pipeline pressure, many customers at once.",
    risk: "Board thinking invites dragging cards instead of recording outcomes.",
  },
  {
    rank: 4,
    id: "command",
    name: "Way 4 — Command bar",
    idea: "One keyboard entry point: type the customer, type the outcome, capture fields in a stack of prompts.",
    built: false,
    clicks: 2,
    seconds: 9,
    heat: 64,
    decisionLoad: 1,
    errorRate: 14,
    bestFor: "Trained closers doing large volumes.",
    risk: "Fastest in trial, worst for new joiners — nothing is discoverable.",
  },
  {
    rank: 5,
    id: "inbox",
    name: "Way 5 — Deadline inbox",
    idea: "No journey at all on the surface: a queue sorted by deadline, each item opening the step it belongs to.",
    built: false,
    clicks: 4,
    seconds: 15,
    heat: 69,
    decisionLoad: 3,
    errorRate: 9,
    bestFor: "SLA recovery mornings and control-tower sweeps.",
    risk: "Hides where the customer is in the journey.",
  },
  {
    rank: 6,
    id: "story",
    name: "Way 6 — Conversation-first story",
    idea: "The WhatsApp evidence is the spine; steps hang off the messages that prove them.",
    built: false,
    clicks: 5,
    seconds: 24,
    heat: 66,
    decisionLoad: 7,
    errorRate: 6,
    bestFor: "Reconstruction and dispute resolution.",
    risk: "Slow when the only need is to record one outcome.",
  },
  {
    rank: 7,
    id: "wizard",
    name: "Way 7 — Locked wizard",
    idea: "Full-screen step-by-step with no exit until the step is complete.",
    built: false,
    clicks: 3,
    seconds: 19,
    heat: 88,
    decisionLoad: 1,
    errorRate: 4,
    bestFor: "Booking and payment, where a half-finished step is dangerous.",
    risk: "Blocks the operator when the customer goes quiet mid-step.",
  },
  {
    rank: 8,
    id: "split",
    name: "Way 8 — Split screen customer / journey",
    idea: "Chat on the left, current step and capture on the right, always paired.",
    built: false,
    clicks: 4,
    seconds: 20,
    heat: 62,
    decisionLoad: 8,
    errorRate: 7,
    bestFor: "Live calls where the operator is typing while talking.",
    risk: "Needs width; unusable on a phone.",
  },
  {
    rank: 9,
    id: "timeline",
    name: "Way 9 — Horizontal timeline",
    idea: "One long left-to-right track with the deadline marker sliding along it.",
    built: false,
    clicks: 6,
    seconds: 27,
    heat: 58,
    decisionLoad: 10,
    errorRate: 11,
    bestFor: "Reviews and screenshots for leadership.",
    risk: "Pretty, but capture is always two clicks away.",
  },
  {
    rank: 10,
    id: "table",
    name: "Way 10 — Spreadsheet grid",
    idea: "Every lead a row, every step a column, capture by editing a cell.",
    built: false,
    clicks: 7,
    seconds: 31,
    heat: 34,
    decisionLoad: 14,
    errorRate: 22,
    bestFor: "Bulk clean-up by an admin who already knows the data.",
    risk: "Reintroduces exactly the CRM form-filling this system replaces.",
  },
];
