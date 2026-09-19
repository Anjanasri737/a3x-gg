export type CareGoal = "FIND" | "SCHEDULE" | "COMPLETE" | "CLOSE";
export type CareRole = "flow-ops" | "tcm";

export interface CareStage {
  goal: CareGoal;
  /** Plain words for the result itself. */
  meaning: string;
  /** What the operator writes on the board: "40 definitely close". */
  unit: string;
  /** Suggested day number for this role and result. */
  dayCount: number;
  outcome: string;
  /** Step-by-step: how this result is actually produced. */
  steps: string[];
  proof: string;
  /** What people wrongly count as this result. */
  doesNotCount: string;
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

export const GOAL_TITLE: Record<CareGoal, string> = {
  FIND: "FIND — create definitely-close leads",
  SCHEDULE: "SCHEDULE — lock qualified tours",
  COMPLETE: "COMPLETE — finish the customer path",
  CLOSE: "CLOSE — get the paid booking",
};

export const CARE_PLAYBOOKS: Record<CareRole, CarePlaybook> = {
  "flow-ops": {
    role: "flow-ops",
    label: "Flow Ops",
    promise: "Every assigned lead reaches a qualified tour, or an honest future or lost path with proof.",
    acceptanceGate: "The Tour Conversion Manager can continue without chasing feasibility, property, inventory, commitment, owner or due time.",
    stages: [
      {
        goal: "FIND",
        meaning: "Create definitely-close leads",
        unit: "definitely close",
        dayCount: 40,
        outcome: "A real customer is qualified, feasible and you would bet on closing them — not merely contacted.",
        steps: [
          "Open the WhatsApp chat and read the last customer message in full.",
          "Call the customer and get a connected conversation — a sent message is not a lead.",
          "Capture move-in date, area, budget and how many people.",
          "Check feasibility against live inventory — mark it only if you would bet on closing it.",
          "Write the next step, the owner and the due time on the lead.",
        ],
        proof: "Move-in, location, budget, response and feasibility are captured.",
        doesNotCount: "Message sent, call not connected, half-filled qualification, or a lead you would not bet on closing.",
        receiver: "Flow Ops queue",
        recommendWhen: "Usable pipeline is below what the day or week needs.",
        requireWhen: "Untouched P0/P1 or qualification backlog crosses the safe floor.",
      },
      {
        goal: "SCHEDULE",
        meaning: "Lock qualified tours",
        unit: "qualified tours",
        dayCount: 10,
        outcome: "A qualified customer commits to one exact property, on an exact date and time.",
        steps: [
          "Shortlist 2–3 properties that truly fit area, budget and move-in.",
          "Share them on WhatsApp and get the customer to pick one.",
          "Confirm the bed is actually free for that date.",
          "Fix the exact date and time and repeat it back to the customer.",
          "Hand the tour to the Tour Conversion Manager and get it accepted.",
        ],
        proof: "Feasibility, exact property, customer commitment and inventory truth.",
        doesNotCount: "A maybe, a date without a property, or a property without a free bed.",
        receiver: "Tour Conversion Manager",
        recommendWhen: "Qualified-but-unscheduled demand is the largest live pool.",
        requireWhen: "Qualified customers are ageing without a tour decision.",
      },
      {
        goal: "COMPLETE",
        meaning: "Finish the customer path",
        unit: "finished customers",
        dayCount: 10,
        outcome: "Every due customer has an accepted handoff or a clean future / lost outcome.",
        steps: [
          "List every customer due today and call each one.",
          "Record the real outcome — moving ahead, future date, or lost with the reason.",
          "Set the next step, owner and due time on every one of them.",
          "Hand over to the receiver and wait for acceptance, not just a forward.",
        ],
        proof: "Outcome, next step, owner, deadline and receiver acceptance.",
        doesNotCount: "Forwarded without acceptance, or closed without a reason.",
        receiver: "Tour Conversion Manager",
        recommendWhen: "Scheduled customers need confirmation, handoff or recovery.",
        requireWhen: "Today’s committed tour path is at risk.",
      },
      {
        goal: "CLOSE",
        meaning: "Get the paid booking",
        unit: "bookings",
        dayCount: 3,
        outcome: "Ready demand reaches a buying commitment, or an honest blocker with an owner.",
        steps: [
          "Pick post-tour customers who already liked a property.",
          "Confirm the room, the price and the move-in date one final time.",
          "Get approval for any discount before promising it.",
          "Send the payment link and stay on the call until it is paid.",
          "Record the payment and hand over for check-in.",
        ],
        proof: "Buying intent, approved terms, payment step and owner-confirmed next move.",
        doesNotCount: "Interested customer, quote sent, or payment promised but not received.",
        receiver: "Closing or Booking Controller",
        recommendWhen: "Payment-ready demand is the highest-value queue.",
        requireWhen: "Hot post-tour backlog is above safe capacity.",
      },
    ],
    safeguards: [
      "No hot customer is dropped because a different result was chosen for the day.",
      "A tour counts only with feasibility, exact property, commitment, inventory truth and accepted handoff.",
      "Never create fake definitely-close leads, tours or future dates to make the number look better.",
    ],
  },
  tcm: {
    role: "tcm",
    label: "Tour Conversion Manager",
    promise: "Every tour becomes a booking path, an approved negotiation, a reschedule, an alternative, or a clean closure.",
    acceptanceGate: "The next owner receives the tour outcome, buying action, blocker, promise and due time.",
    stages: [
      {
        goal: "FIND",
        meaning: "Pick up the hottest tour cases",
        unit: "hot cases owned",
        dayCount: 15,
        outcome: "The highest-chance live-tour and post-tour customers are actively owned by a person.",
        steps: [
          "Sort today’s tours and post-tour customers by how close they are to paying.",
          "Take ownership of each one by name — no case without an owner.",
          "Verify the property, the timing and the risk before working it.",
          "Set the first move and a due time on each case.",
        ],
        proof: "Tour timing, fit, intent, property and risk are verified.",
        doesNotCount: "A case sitting in the queue with no named owner.",
        receiver: "TCM live queue",
        recommendWhen: "Hot live-tour and post-tour customers are not prioritised.",
        requireWhen: "Any P0 tour or customer is at risk.",
      },
      {
        goal: "SCHEDULE",
        meaning: "Control and confirm tours",
        unit: "confirmed tours",
        dayCount: 15,
        outcome: "The tour is confirmed with the customer, the property and the person who will run it.",
        steps: [
          "Call the customer and re-confirm the date, time and property.",
          "Confirm the bed is still free with the property team.",
          "Assign the person who will run the visit on the ground.",
          "Send the confirmation on WhatsApp with the address and time.",
        ],
        proof: "Exact property, time, inventory, customer confirmation and owner.",
        doesNotCount: "A scheduled slot the customer has not confirmed today.",
        receiver: "Tour execution",
        recommendWhen: "Scheduled tours need control or confirmation.",
        requireWhen: "Show-up risk is above the safe floor.",
      },
      {
        goal: "COMPLETE",
        meaning: "Finish tours properly",
        unit: "completed tours",
        dayCount: 8,
        outcome: "A completed tour has a fast post-tour result and a clear next buying action.",
        steps: [
          "Call within 30 minutes of the visit ending.",
          "Record what was seen, what was liked and the exact objection.",
          "Give the honest answer or the alternative property.",
          "Set the next buying action with a due time.",
        ],
        proof: "Property seen, response, objection, outcome and next action are captured.",
        doesNotCount: "Visit marked done with no customer response captured.",
        receiver: "Tour Conversion Manager",
        recommendWhen: "The current window contains due tours.",
        requireWhen: "A due tour or post-tour report is missing.",
      },
      {
        goal: "CLOSE",
        meaning: "Get the paid booking",
        unit: "paid bookings",
        dayCount: 5,
        outcome: "An honest property fit becomes an approved, paid booking.",
        steps: [
          "Confirm fit, inventory and terms are all truthful.",
          "Get approval for the final price before committing it.",
          "Send the payment link and stay with the customer until it is paid.",
          "Confirm the payment and hand over for check-in.",
        ],
        proof: "Fit, inventory, terms, customer intent and payment are verified.",
        doesNotCount: "Booked in the system without money received.",
        receiver: "Closure Specialist or Booking Controller",
        recommendWhen: "Post-tour buying intent is the highest-value queue.",
        requireWhen: "A qualified tour has no buying path.",
      },
    ],
    safeguards: [
      "A scheduled tour is not a win when nobody manages the customer afterwards.",
      "Post-tour outcome and the next buying action are captured within the same hour.",
      "Never push a booking when property fit, inventory or terms are not truthful.",
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
    question: "Where is the largest live bottleneck right now?",
    accepted: "The bottleneck is smaller and due work is controlled.",
  },
  FINISH: {
    label: "3 · FINISH",
    question: "What high-value work must not roll over unmanaged?",
    accepted: "It reaches the result, or carries with an owner and a due time.",
  },
} as const;

export type CareRound = keyof typeof ROUND_COPY;
