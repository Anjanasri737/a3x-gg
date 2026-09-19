export type CareGoal = "FIND" | "SCHEDULE" | "COMPLETE" | "CLOSE";
export type CareRole = "flow-ops" | "tcm";

export interface CareStage {
  goal: CareGoal;
  meaning: string;
  outcome: string;
  defaultTarget: number;
  proof: string;
  receiver: string;
  recommendWhen: string;
  requireWhen: string;
}

export interface CarePlaybook {
  role: CareRole;
  label: string;
  promise: string;
  acceptanceGate: string;
  stages: CareStage[];
  safeguards: string[];
}

export const CARE_GOALS: CareGoal[] = ["FIND", "SCHEDULE", "COMPLETE", "CLOSE"];

export const CARE_PLAYBOOKS: Record<CareRole, CarePlaybook> = {
  "flow-ops": {
    role: "flow-ops",
    label: "Flow Ops",
    promise: "Every assigned lead reaches a qualified tour or an evidence-backed future or lost path.",
    acceptanceGate: "TCM can continue without chasing feasibility, property, inventory, commitment, owner, or due time.",
    stages: [
      {
        goal: "FIND",
        meaning: "Create good leads",
        outcome: "A real customer is qualified and progressed, not merely contacted.",
        defaultTarget: 40,
        proof: "Move-in, location, budget, response and feasibility are captured.",
        receiver: "Flow Ops queue",
        recommendWhen: "Usable pipeline is below the day or week need.",
        requireWhen: "Untouched P0/P1 or qualification backlog crosses the safe floor.",
      },
      {
        goal: "SCHEDULE",
        meaning: "Schedule qualified tours",
        outcome: "A qualified customer commits to an exact property, date and time.",
        defaultTarget: 10,
        proof: "Feasibility, exact property, customer commitment and inventory truth.",
        receiver: "Tour Conversion Manager",
        recommendWhen: "Qualified-unscheduled demand is the largest live pool.",
        requireWhen: "Qualified customers are aging without a tour decision.",
      },
      {
        goal: "COMPLETE",
        meaning: "Complete the customer path",
        outcome: "Every due customer has a valid accepted handoff or a clean future/lost outcome.",
        defaultTarget: 10,
        proof: "Outcome, next action, owner, deadline and receiver acceptance.",
        receiver: "Tour Conversion Manager",
        recommendWhen: "Scheduled customers need confirmation, handoff or recovery.",
        requireWhen: "Today’s committed tour path is at risk.",
      },
      {
        goal: "CLOSE",
        meaning: "Close booking or pre-book contribution",
        outcome: "Eligible post-tour demand reaches a buying commitment or truthful blocker path.",
        defaultTarget: 3,
        proof: "Buying intent, approved terms, payment step and owner-confirmed next move.",
        receiver: "Closing or Booking Controller",
        recommendWhen: "Payment-ready demand is the highest-value queue.",
        requireWhen: "Hot post-tour backlog is above safe capacity.",
      },
    ],
    safeguards: [
      "No hot customer is abandoned because another CARE was selected.",
      "A tour counts only with feasibility, exact property, commitment, inventory truth and accepted TCM handoff.",
      "Never create fake good leads, tours or future dates to improve the result.",
    ],
  },
  tcm: {
    role: "tcm",
    label: "Tour Conversion Manager",
    promise: "Every tour becomes a booking path, authorized negotiation, reschedule, alternative, or precise closure.",
    acceptanceGate: "The next owner receives the tour outcome, buying action, blocker, promise and due time.",
    stages: [
      {
        goal: "FIND",
        meaning: "Find hot tour opportunities",
        outcome: "The highest-probability live-tour and post-tour customers are actively owned.",
        defaultTarget: 15,
        proof: "Tour timing, fit, intent, property and risk are verified.",
        receiver: "TCM live queue",
        recommendWhen: "Hot live-tour and post-tour customers are not prioritized.",
        requireWhen: "Any P0 tour or customer is at risk.",
      },
      {
        goal: "SCHEDULE",
        meaning: "Control and confirm tours",
        outcome: "The tour is confirmed with customer, property and execution owner.",
        defaultTarget: 15,
        proof: "Exact property, time, inventory, customer confirmation and owner.",
        receiver: "Tour execution",
        recommendWhen: "Scheduled tours need control or confirmation.",
        requireWhen: "Show-up risk is above the safe floor.",
      },
      {
        goal: "COMPLETE",
        meaning: "Complete tours",
        outcome: "A completed tour has a fast post-tour result and next buying action.",
        defaultTarget: 8,
        proof: "Property seen, response, objection, outcome and next action are captured.",
        receiver: "Tour Conversion Manager",
        recommendWhen: "The current window contains due tours.",
        requireWhen: "A due tour or post-tour report is missing.",
      },
      {
        goal: "CLOSE",
        meaning: "Close paid bookings",
        outcome: "A truthful property fit becomes an approved paid booking.",
        defaultTarget: 5,
        proof: "Fit, inventory, terms, customer intent and payment are verified.",
        receiver: "Closure Specialist or Booking Controller",
        recommendWhen: "Post-tour buying intent is the highest-value queue.",
        requireWhen: "A qualified tour lacks a buying path.",
      },
    ],
    safeguards: [
      "A scheduled tour is not success when the customer path is unmanaged afterward.",
      "Post-tour outcome and the next buying action are captured quickly.",
      "Never force a booking when property fit, inventory or terms are not truthful.",
    ],
  },
};

export const ROUND_COPY = {
  BUILD: {
    label: "1 · BUILD",
    question: "What usable result must exist before 1 PM?",
    accepted: "Real work moves and urgent commitments stay safe.",
  },
  MOVE: {
    label: "2 · MOVE",
    question: "Where is the largest live bottleneck now?",
    accepted: "The bottleneck is smaller and due work is controlled.",
  },
  FINISH: {
    label: "3 · FINISH",
    question: "What highest-value work must not roll unmanaged?",
    accepted: "It reaches the result or carries with an owner and due time.",
  },
} as const;

export type CareRound = keyof typeof ROUND_COPY;