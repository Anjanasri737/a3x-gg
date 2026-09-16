// The one and only Gharpayy journey. Every lead walks these steps in this order.
// Screenshot -> admission -> ownership -> reconstruction -> qualification -> contact
// -> match -> tour -> closing -> booking -> approval -> payment -> check-in.
//
// Each step asks for exactly one thing (plus a few mandatory extras), so Understand
// mode can show one question at a time and the rail can show done / now / locked.

export type StepEffect = "ESCALATE" | "CLOSE";

export interface StepOption {
  value: string;
  label: string;
  hint?: string;
  effect?: StepEffect;
}

export interface ExtraField {
  field: string;
  label: string;
  kind: "TEXT" | "NUMBER" | "DATE" | "DATETIME";
  placeholder?: string;
}

export interface JStep {
  key: string;
  group: string;
  title: string;
  question: string;
  help: string;
  field: string;
  kind: "CHOICE" | "TEXT" | "NUMBER" | "DATE" | "DATETIME" | "DONE";
  options?: StepOption[];
  placeholder?: string;
  extra?: ExtraField[];
  waitingOn: string;
  /** minutes allowed before this step turns red */
  sla: number;
}

export const JOURNEY: JStep[] = [
  {
    key: "CAPTURE",
    group: "Bring the chat in",
    title: "Chat pulled in from a screenshot",
    question: "Is this chat in the CRM?",
    help: "Draft Vision reads the screenshot and creates or updates one customer — never five copies.",
    field: "captured",
    kind: "CHOICE",
    options: [{ value: "YES", label: "Yes, this chat is in the CRM" }],
    waitingOn: "Gharpayy",
    sla: 60,
  },
  {
    key: "WHERE",
    group: "Admission",
    title: "Where is this customer right now",
    question: "Where is this customer currently?",
    help: "Nobody starts chatting randomly. First we say where the customer actually is.",
    field: "where",
    kind: "CHOICE",
    options: [
      { value: "ACTIVE_CHAT", label: "Active WhatsApp chat" },
      { value: "OLD_CHAT", label: "Old WhatsApp chat found" },
      { value: "CHAT_MISSING", label: "WhatsApp chat missing" },
      { value: "NOT_ON_WA", label: "Number not on WhatsApp" },
      { value: "CRM_EXISTS", label: "CRM lead already exists" },
      { value: "AWAITING_FIRST_REPLY", label: "Waiting for first reply" },
      { value: "DUPLICATE", label: "Duplicate — someone else is handling", effect: "CLOSE" },
    ],
    waitingOn: "Gharpayy",
    sla: 60,
  },
  {
    key: "CHANNEL",
    group: "Admission",
    title: "The one channel we use",
    question: "How will we talk to this customer?",
    help: "One clear channel so nobody guesses where the conversation lives.",
    field: "channel",
    kind: "CHOICE",
    options: [
      { value: "WHATSAPP", label: "WhatsApp" },
      { value: "CALL", label: "Call" },
      { value: "BOTH", label: "WhatsApp + call" },
      { value: "OTHER", label: "Other" },
    ],
    waitingOn: "Gharpayy",
    sla: 60,
  },
  {
    key: "WHEN",
    group: "Admission",
    title: "When we handle it",
    question: "When should this customer be handled?",
    help: "Follow-up and future cannot be picked without a date and time.",
    field: "when",
    kind: "CHOICE",
    options: [
      { value: "NOW", label: "Now", hint: "Within 15 minutes" },
      { value: "TODAY", label: "Today", hint: "Before the day ends" },
      { value: "FOLLOWUP", label: "Follow-up", hint: "Needs a date and time" },
      { value: "FUTURE", label: "Future", hint: "Move-in is far away, still needs a date" },
      { value: "NOT_ACTIONABLE", label: "Not actionable", effect: "CLOSE" },
    ],
    extra: [{ field: "whenAt", label: "Exact date and time", kind: "DATETIME" }],
    waitingOn: "Gharpayy",
    sla: 60,
  },
  {
    key: "OWN",
    group: "Ownership",
    title: "Somebody owns this lead",
    question: "Do you take ownership and move this forward?",
    help: "Opening a lead is not ownership. Saying yes here is ownership, and the clock starts.",
    field: "ownership",
    kind: "CHOICE",
    options: [
      { value: "OWN", label: "Yes — I own this lead" },
      { value: "NEED_HELP", label: "I need help", hint: "Goes to Control Tower with your reason", effect: "ESCALATE" },
      { value: "REASSIGN", label: "Reassign", hint: "Goes back to the pool for Control Tower", effect: "ESCALATE" },
    ],
    extra: [{ field: "ownershipNote", label: "Reason (only if help or reassign)", kind: "TEXT", placeholder: "Why can't you take it?" }],
    waitingOn: "Gharpayy",
    sla: 30,
  },
  {
    key: "RECON",
    group: "What already happened",
    title: "WhatsApp reconstruction",
    question: "What has already happened on WhatsApp?",
    help: "Read the chat first so we never ask the customer the same thing twice.",
    field: "recon",
    kind: "CHOICE",
    options: [
      { value: "FRESH", label: "Nothing yet — fresh chat" },
      { value: "CONTACTED", label: "Contacted only" },
      { value: "PART_QUALIFIED", label: "Some details already given" },
      { value: "FULLY_QUALIFIED", label: "Fully qualified already" },
      { value: "PROPERTY_SHARED", label: "Properties already shared" },
      { value: "CALL_DONE", label: "Call already done" },
      { value: "TOUR_DISCUSSED", label: "Tour already discussed" },
    ],
    waitingOn: "Gharpayy",
    sla: 30,
  },
  {
    key: "AREA",
    group: "Qualification",
    title: "Where they want to stay",
    question: "Which area or landmark?",
    help: "Office, college or locality — exactly what they said.",
    field: "area",
    kind: "TEXT",
    placeholder: "Kharadi / Hinjewadi / near Symbiosis",
    waitingOn: "Customer",
    sla: 120,
  },
  {
    key: "FEASIBLE",
    group: "Qualification",
    title: "Can we serve that area",
    question: "Do we have a property in that area?",
    help: "If we cannot serve it, say so now instead of wasting the customer's time.",
    field: "feasible",
    kind: "CHOICE",
    options: [
      { value: "YES", label: "Yes, we can serve it" },
      { value: "NEARBY", label: "Only nearby options" },
      { value: "NO", label: "Not serviceable", effect: "CLOSE" },
    ],
    waitingOn: "Gharpayy",
    sla: 120,
  },
  {
    key: "MOVEIN",
    group: "Qualification",
    title: "Move-in date",
    question: "When do they want to move in?",
    help: "Move-in date decides how hot this lead is.",
    field: "moveIn",
    kind: "DATE",
    waitingOn: "Customer",
    sla: 120,
  },
  {
    key: "BUDGET",
    group: "Qualification",
    title: "Budget",
    question: "What is their monthly budget?",
    help: "A number is enough — refine it on the call.",
    field: "budget",
    kind: "NUMBER",
    placeholder: "12000",
    waitingOn: "Customer",
    sla: 120,
  },
  {
    key: "ROOMTYPE",
    group: "Qualification",
    title: "Room type",
    question: "What kind of room do they want?",
    help: "This is matched against live inventory.",
    field: "roomType",
    kind: "CHOICE",
    options: [
      { value: "SINGLE", label: "Single" },
      { value: "DOUBLE", label: "Double sharing" },
      { value: "TRIPLE", label: "Triple sharing" },
      { value: "ANY", label: "Open to any" },
    ],
    waitingOn: "Customer",
    sla: 120,
  },
  {
    key: "INTENT",
    group: "Qualification",
    title: "How serious is the customer",
    question: "What is the customer's intent?",
    help: "Your honest read after the chat or call.",
    field: "intent",
    kind: "CHOICE",
    options: [
      { value: "VERY_HIGH", label: "Very high — ready to book" },
      { value: "HIGH", label: "High — wants a tour" },
      { value: "MEDIUM", label: "Medium — comparing options" },
      { value: "LOW", label: "Low — just asking" },
      { value: "NOT_INTERESTED", label: "Not interested", effect: "CLOSE" },
    ],
    waitingOn: "Gharpayy",
    sla: 120,
  },
  {
    key: "CALL",
    group: "Talk to them",
    title: "The call",
    question: "What happened on the call?",
    help: "Every lead must have a real call attempt recorded, not just chat.",
    field: "call",
    kind: "CHOICE",
    options: [
      { value: "CONNECTED", label: "Connected — spoke to customer" },
      { value: "NO_ANSWER", label: "No answer" },
      { value: "CALLBACK", label: "Customer asked for a callback" },
      { value: "SWITCHED_OFF", label: "Switched off / unreachable" },
      { value: "WRONG_NUMBER", label: "Wrong number", effect: "CLOSE" },
    ],
    extra: [{ field: "callNote", label: "What did they say?", kind: "TEXT", placeholder: "Wants a tour this weekend…" }],
    waitingOn: "Customer",
    sla: 60,
  },
  {
    key: "REPLY",
    group: "Talk to them",
    title: "Customer response",
    question: "Has the customer responded to us?",
    help: "A sent message is not a reply. Drafts do not count as contact.",
    field: "reply",
    kind: "CHOICE",
    options: [
      { value: "REPLIED", label: "Yes, they replied" },
      { value: "SENT_NO_REPLY", label: "We messaged, no reply yet" },
      { value: "DRAFT_ONLY", label: "Only an unsent draft on WhatsApp" },
    ],
    waitingOn: "Customer",
    sla: 240,
  },
  {
    key: "MATCH",
    group: "Match a property",
    title: "Property options shared",
    question: "Which property did we share?",
    help: "Name the property and room so the tour and quotation match it.",
    field: "property",
    kind: "TEXT",
    placeholder: "Gharpayy Kharadi — double sharing",
    extra: [{ field: "propertyRoom", label: "Room / bed", kind: "TEXT", placeholder: "Room 204 / Bed B" }],
    waitingOn: "Customer",
    sla: 240,
  },
  {
    key: "TOUR_READY",
    group: "Tour",
    title: "Tour readiness",
    question: "Is this customer ready for a tour?",
    help: "A tour without area, budget and move-in is a wasted visit.",
    field: "tourReady",
    kind: "CHOICE",
    options: [
      { value: "READY", label: "Ready to visit" },
      { value: "VIRTUAL", label: "Wants a virtual tour" },
      { value: "NOT_YET", label: "Not yet — needs more options" },
    ],
    waitingOn: "Gharpayy",
    sla: 240,
  },
  {
    key: "TOUR_SLOT",
    group: "Tour",
    title: "Tour scheduled",
    question: "When is the tour?",
    help: "Date, time and who is taking the customer.",
    field: "tourAt",
    kind: "DATETIME",
    extra: [{ field: "tourHost", label: "Who takes the tour", kind: "TEXT", placeholder: "Riya" }],
    waitingOn: "Gharpayy",
    sla: 120,
  },
  {
    key: "TOUR_CONFIRM",
    group: "Tour",
    title: "Tour confirmed by customer",
    question: "Did the customer confirm the tour?",
    help: "Confirm on the day, not two days before.",
    field: "tourConfirm",
    kind: "CHOICE",
    options: [
      { value: "CONFIRMED", label: "Confirmed" },
      { value: "RESCHEDULE", label: "Wants to reschedule" },
      { value: "NO_RESPONSE", label: "No response yet" },
    ],
    waitingOn: "Customer",
    sla: 120,
  },
  {
    key: "TOUR_VISIT",
    group: "Tour",
    title: "The live visit",
    question: "What happened at the property?",
    help: "The person who owns the tour owns the closing.",
    field: "tourVisit",
    kind: "CHOICE",
    options: [
      { value: "ARRIVED", label: "Customer arrived and saw it" },
      { value: "NO_SHOW", label: "No show" },
      { value: "RESCHEDULED", label: "Rescheduled on the spot" },
    ],
    waitingOn: "Gharpayy",
    sla: 60,
  },
  {
    key: "TOUR_FEEDBACK",
    group: "Tour",
    title: "Post-tour feedback",
    question: "What did the customer say after the visit?",
    help: "If they disliked it, we offer an alternative immediately — we never let them disappear.",
    field: "tourFeedback",
    kind: "CHOICE",
    options: [
      { value: "LIKED", label: "Liked it — wants pricing" },
      { value: "ALTERNATIVE", label: "Needs an alternative property" },
      { value: "REJECTED", label: "Rejected everything", effect: "CLOSE" },
    ],
    waitingOn: "Customer",
    sla: 60,
  },
  {
    key: "QUOTE",
    group: "Closing",
    title: "Quotation sent",
    question: "What did we quote?",
    help: "Rent, deposit and maintenance in the same session as the tour.",
    field: "rent",
    kind: "NUMBER",
    placeholder: "Monthly rent",
    extra: [
      { field: "deposit", label: "Deposit", kind: "NUMBER", placeholder: "20000" },
      { field: "maintenance", label: "Maintenance", kind: "NUMBER", placeholder: "1000" },
    ],
    waitingOn: "Customer",
    sla: 60,
  },
  {
    key: "NEGOTIATE",
    group: "Closing",
    title: "Customer decision",
    question: "Did the customer accept the terms?",
    help: "If they are negotiating, the deadline stays short.",
    field: "decision",
    kind: "CHOICE",
    options: [
      { value: "ACCEPTED", label: "Accepted the terms" },
      { value: "NEGOTIATING", label: "Negotiating" },
      { value: "DROPPED", label: "Dropped out", effect: "CLOSE" },
    ],
    waitingOn: "Customer",
    sla: 120,
  },
  {
    key: "BOOKING",
    group: "Booking",
    title: "Booking created",
    question: "Create the booking — this freezes the commercial terms.",
    help: "Customer, property, room, move-in, rent, deposit and booking amount are locked from here.",
    field: "bookingAmount",
    kind: "NUMBER",
    placeholder: "Booking amount",
    extra: [{ field: "bookingMoveIn", label: "Confirmed move-in date", kind: "DATE" }],
    waitingOn: "Gharpayy",
    sla: 60,
  },
  {
    key: "APPROVAL",
    group: "Booking",
    title: "Property approval",
    question: "Did the property manager approve the room?",
    help: "Inventory lock first. A rejection must carry a real reason.",
    field: "approval",
    kind: "CHOICE",
    options: [
      { value: "APPROVED", label: "Room available — approved" },
      { value: "ROOM_CHANGED", label: "Room changed" },
      { value: "UNAVAILABLE", label: "Room unavailable" },
      { value: "MOVEIN_IMPOSSIBLE", label: "Move-in date impossible" },
      { value: "COMMERCIAL_WRONG", label: "Commercial data incorrect" },
    ],
    extra: [{ field: "approvalNote", label: "Reason / note", kind: "TEXT", placeholder: "Only 3-sharing free from 5th" }],
    waitingOn: "Supply",
    sla: 120,
  },
  {
    key: "PAYMENT",
    group: "Booking",
    title: "Payment or token",
    question: "Has the token or payment come in?",
    help: "Money is reconciled against the approved booking, not against a promise.",
    field: "payment",
    kind: "CHOICE",
    options: [
      { value: "RECEIVED", label: "Payment received" },
      { value: "PARTIAL", label: "Part payment received" },
      { value: "PENDING", label: "Still pending" },
    ],
    extra: [
      { field: "paymentAmount", label: "Amount received", kind: "NUMBER", placeholder: "5000" },
      { field: "paymentMode", label: "Paid to / mode", kind: "TEXT", placeholder: "Gharpayy UPI" },
    ],
    waitingOn: "Customer",
    sla: 120,
  },
  {
    key: "RESERVED",
    group: "Booking",
    title: "Reserved and room locked",
    question: "Is the room locked for this customer?",
    help: "Final room lock happens only after approval and money.",
    field: "reserved",
    kind: "CHOICE",
    options: [
      { value: "LOCKED", label: "Room locked" },
      { value: "WAITING", label: "Waiting on property" },
    ],
    extra: [{ field: "lockedRoom", label: "Final room / bed", kind: "TEXT", placeholder: "Room 204 / Bed B" }],
    waitingOn: "Supply",
    sla: 120,
  },
  {
    key: "CUSTOMER_CONFIRM",
    group: "Booking",
    title: "Customer confirmation sent",
    question: "Has the customer been sent the confirmation?",
    help: "Booking ID, room, move-in date and what to bring.",
    field: "customerConfirm",
    kind: "CHOICE",
    options: [
      { value: "SENT", label: "Confirmation sent" },
      { value: "ACKNOWLEDGED", label: "Customer acknowledged it" },
    ],
    waitingOn: "Customer",
    sla: 120,
  },
  {
    key: "CHECKIN_PREP",
    group: "Check-in",
    title: "Check-in preparation",
    question: "Is the property ready for check-in?",
    help: "Room cleaned, keys ready, warden informed, documents collected.",
    field: "checkinPrep",
    kind: "CHOICE",
    options: [
      { value: "READY", label: "Everything ready" },
      { value: "PENDING", label: "Something pending" },
    ],
    extra: [{ field: "checkinPrepNote", label: "What is pending", kind: "TEXT", placeholder: "Documents not collected" }],
    waitingOn: "Supply",
    sla: 240,
  },
  {
    key: "CHECKIN_DAY",
    group: "Check-in",
    title: "Check-in day",
    question: "Did the customer check in?",
    help: "This is the last mile — nobody should go silent on the day.",
    field: "checkinDay",
    kind: "CHOICE",
    options: [
      { value: "CHECKED_IN", label: "Checked in" },
      { value: "DELAYED", label: "Delayed" },
      { value: "CANCELLED", label: "Cancelled", effect: "CLOSE" },
    ],
    waitingOn: "Customer",
    sla: 120,
  },
  {
    key: "SETTLED",
    group: "Check-in",
    title: "Settled",
    question: "Is the balance settled and the customer settled in?",
    help: "Balance collected, agreement done, customer happy.",
    field: "settled",
    kind: "CHOICE",
    options: [
      { value: "SETTLED", label: "Settled — journey complete" },
      { value: "BALANCE_PENDING", label: "Balance pending" },
    ],
    waitingOn: "Gharpayy",
    sla: 240,
  },
];

export const GROUPS: string[] = JOURNEY.reduce<string[]>((acc, s) => (acc.includes(s.group) ? acc : [...acc, s.group]), []);

export const stepIndex = (key: string) => JOURNEY.findIndex((s) => s.key === key);

/** A step is done when its main field and every extra field that is required are filled. */
export function isStepDone(f: Record<string, string>, step: JStep): boolean {
  const main = f[step.field];
  if (!main) return false;
  if (step.key === "WHEN" && (main === "FOLLOWUP" || main === "FUTURE") && !f["whenAt"]) return false;
  if (step.key === "MATCH" && !f["propertyRoom"]) return false;
  if (step.key === "QUOTE" && (!f["deposit"] || !f["maintenance"])) return false;
  if (step.key === "BOOKING" && !f["bookingMoveIn"]) return false;
  if (step.key === "PAYMENT" && main !== "PENDING" && !f["paymentAmount"]) return false;
  if (step.key === "RESERVED" && main === "LOCKED" && !f["lockedRoom"]) return false;
  if (step.key === "APPROVAL" && main !== "APPROVED" && !f["approvalNote"]) return false;
  return true;
}

/** First step that is not done — the step the operator must do now. */
export function currentStep(f: Record<string, string>): JStep | undefined {
  return JOURNEY.find((s) => !isStepDone(f, s));
}

export function progress(f: Record<string, string>) {
  const done = JOURNEY.filter((s) => isStepDone(f, s)).length;
  return { done, total: JOURNEY.length };
}

/** Names of the fields still missing on a step, in plain words. */
export function missingOn(f: Record<string, string>, step: JStep): string[] {
  const out: string[] = [];
  if (!f[step.field]) out.push(step.title);
  (step.extra ?? []).forEach((x) => {
    if (!f[x.field] && requiredExtra(f, step, x.field)) out.push(x.label);
  });
  return out;
}

function requiredExtra(f: Record<string, string>, step: JStep, field: string) {
  const main = f[step.field];
  if (step.key === "WHEN" && field === "whenAt") return main === "FOLLOWUP" || main === "FUTURE";
  if (step.key === "OWN" && field === "ownershipNote") return main === "NEED_HELP" || main === "REASSIGN";
  if (step.key === "APPROVAL" && field === "approvalNote") return main !== undefined && main !== "APPROVED";
  if (step.key === "PAYMENT" && field === "paymentAmount") return main !== undefined && main !== "PENDING";
  if (step.key === "RESERVED" && field === "lockedRoom") return main === "LOCKED";
  if (step.key === "CHECKIN_PREP" && field === "checkinPrepNote") return main === "PENDING";
  if (step.key === "CALL" && field === "callNote") return main === "CONNECTED";
  return true;
}

export const isExtraRequired = requiredExtra;

export const NEXT_ACTIONS = [
  "Send WhatsApp message",
  "Call the customer",
  "Share property options",
  "Schedule the tour",
  "Confirm the tour",
  "Send quotation",
  "Follow up on decision",
  "Chase property approval",
  "Chase payment",
  "Prepare check-in",
];
