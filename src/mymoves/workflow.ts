// The workflow engine. One config decides: headline, questions, buttons,
// mandatory fields, timer and allowed next stages for every stage.
// The UI renders whatever this returns — it holds no stage logic of its own.
import type { Lead, Stage } from "./types";

export type PromptKind = "choice" | "text" | "number" | "when" | "date";

export interface Prompt {
  id: string;
  q: string;
  kind: PromptKind;
  options?: string[];
  optional?: boolean;
  placeholder?: string;
}

export interface ActionResult {
  patch: Partial<Lead>;
  note: string;
}

export interface ActionDef {
  id: string;
  label: string;
  prompts?: Prompt[];
  /** Hard block: returns the missing things that must exist before this runs. */
  blockedBy?: (lead: Lead) => string[];
  /** Warning: operator may continue, but a reason is required. */
  warnIf?: (lead: Lead) => string | null;
  apply: (lead: Lead, a: Record<string, string>, actor: string) => ActionResult;
}

export const WHEN_OPTIONS = ["NOW", "15 MINUTES", "30 MINUTES", "2 HOURS", "TODAY", "TOMORROW"];

export function resolveWhen(v: string): string {
  const now = Date.now();
  const map: Record<string, number> = {
    NOW: 2, "15 MINUTES": 15, "30 MINUTES": 30, "2 HOURS": 120, TODAY: 240, TOMORROW: 1440,
  };
  const mins = map[v];
  if (mins) return new Date(now + mins * 60_000).toISOString();
  const parsed = Date.parse(v);
  return Number.isNaN(parsed) ? new Date(now + 60 * 60_000).toISOString() : new Date(parsed).toISOString();
}

const NEXT_ACTIONS = ["WHATSAPP", "CALL", "QUALIFY", "SHARE PROPERTY", "SCHEDULE VISIT", "FOLLOW-UP", "NEGOTIATE", "CLOSE"];

const nextActionPrompts: Prompt[] = [
  { id: "next", q: "What are you committing to do next?", kind: "choice", options: NEXT_ACTIONS },
  { id: "when", q: "When?", kind: "when" },
];

const commit = (a: Record<string, string>) => ({
  nextAction: a["next"], nextActionAt: resolveWhen(a["when"] ?? "NOW"),
});

/* ------------------------------------------------------------------ actions */

export const ACTIONS: Record<string, ActionDef> = {
  /* Stage 1 — capture & identity */
  SAME_REQUIREMENT: {
    id: "SAME_REQUIREMENT", label: "SAME REQUIREMENT",
    apply: () => ({ patch: { stage: "IDENTIFIED", duplicateOf: [] }, note: "Existing lead updated — no duplicate customer created" }),
  },
  NEW_REQUIREMENT: {
    id: "NEW_REQUIREMENT", label: "NEW REQUIREMENT",
    apply: () => ({ patch: { stage: "IDENTIFIED", duplicateOf: [] }, note: "New opportunity created under the same customer" }),
  },
  RESOLVE_IDENTITY: {
    id: "RESOLVE_IDENTITY", label: "RESOLVE IDENTITY",
    prompts: [
      { id: "phone", q: "Confirmed phone number", kind: "text", placeholder: "+91…" },
      { id: "name", q: "Customer name", kind: "text" },
      { id: "verified", q: "Manually verified?", kind: "choice", options: ["YES", "NO"] },
    ],
    apply: (_l, a) => a["verified"] === "YES"
      ? { patch: { stage: "IDENTIFIED", phone: a["phone"] ?? _l.phone, name: a["name"] ?? _l.name, identityNote: undefined }, note: `Identity resolved — ${a["name"]} ${a["phone"]}` }
      : { patch: { identityNote: "Still unverified" }, note: "Identity still unresolved — no customer contact allowed" },
  },
  MERGE_DUPLICATE: {
    id: "MERGE_DUPLICATE", label: "Merge duplicate",
    prompts: [{ id: "keep", q: "Which record survives?", kind: "choice", options: ["THIS LEAD", "THE OLDER LEAD"] }],
    apply: (_l, a) => ({ patch: { duplicateOf: [], stage: "IDENTIFIED" }, note: `Duplicates merged — kept ${a["keep"]}` }),
  },

  /* Stage 2 — WhatsApp presence */
  SET_PRESENCE: {
    id: "SET_PRESENCE", label: "WHERE IS THE CHAT?",
    prompts: [{
      id: "p", q: "Where is the customer's conversation?", kind: "choice",
      options: ["ACTIVE WHATSAPP CHAT FOUND", "OLD WHATSAPP CHAT FOUND", "WAITING FOR FIRST REPLY", "NO CHAT FOUND", "NUMBER NOT ON WHATSAPP", "CHAT ON ANOTHER GHARPAYY NUMBER", "MULTIPLE WHATSAPP CHATS FOUND"],
    }],
    apply: (_l, a) => {
      const map: Record<string, Lead["waPresence"]> = {
        "ACTIVE WHATSAPP CHAT FOUND": "ACTIVE_CHAT",
        "OLD WHATSAPP CHAT FOUND": "OLD_CHAT",
        "WAITING FOR FIRST REPLY": "AWAITING_FIRST_RESPONSE",
        "NO CHAT FOUND": "NO_CHAT",
        "NUMBER NOT ON WHATSAPP": "NOT_ON_WHATSAPP",
        "CHAT ON ANOTHER GHARPAYY NUMBER": "OTHER_GHARPAYY_NUMBER",
        "MULTIPLE WHATSAPP CHATS FOUND": "MULTIPLE_CHATS",
      };
      return { patch: { waPresence: map[a["p"] ?? ""] ?? "NO_CHAT" }, note: `WhatsApp presence: ${a["p"]}` };
    },
  },
  OLD_CHAT_STILL_ACTIVE: {
    id: "OLD_CHAT_STILL_ACTIVE", label: "REQUIREMENT STILL ACTIVE?",
    prompts: [{ id: "r", q: "Is the customer's requirement still active?", kind: "choice", options: ["YES", "UNKNOWN", "NO"] }],
    apply: (_l, a) => {
      if (a["r"] === "YES") return { patch: { waPresence: "ACTIVE_CHAT", stage: "UNOWNED" }, note: "Old chat reactivated — requirement is live" };
      if (a["r"] === "UNKNOWN") return {
        patch: { waPresence: "AWAITING_FIRST_RESPONSE", nextAction: "FOLLOW-UP", nextActionAt: resolveWhen("2 HOURS") },
        note: "Reactivation message sent — follow-up timer started",
      };
      return { patch: { stage: "LOST", lostReason: "Requirement closed by customer" }, note: "Old requirement closed" };
    },
  },
  CONTINUE_WITH_OWNER: {
    id: "CONTINUE_WITH_OWNER", label: "CONTINUE WITH EXISTING OWNER",
    apply: (l) => ({ patch: { waPresence: "ACTIVE_CHAT" }, note: `Existing owner ${l.owner ?? "on the other number"} keeps the customer — no parallel contact` }),
  },
  FORMAL_TRANSFER: {
    id: "FORMAL_TRANSFER", label: "REQUEST FORMAL TRANSFER",
    prompts: [{ id: "to", q: "Transfer to", kind: "text", placeholder: "Operator name" }],
    apply: (_l, a) => ({ patch: { handoverTo: a["to"] }, note: `Handover requested to ${a["to"]} — previous owner stays accountable until accepted` }),
  },
  ACCEPT_HANDOVER: {
    id: "ACCEPT_HANDOVER", label: "ACCEPT HANDOVER",
    apply: (l, _a, actor) => ({ patch: { owner: actor, ownerSince: new Date().toISOString(), handoverTo: undefined }, note: `${actor} accepted the handover from ${l.owner ?? "unowned"}` }),
  },

  /* Stage 3 — ownership gate */
  CLAIM_AND_WORK: {
    id: "CLAIM_AND_WORK", label: "CLAIM & WORK",
    prompts: nextActionPrompts,
    apply: (_l, a, actor) => ({
      patch: { owner: actor, ownerSince: new Date().toISOString(), stage: "QUALIFYING", labels: { ..._l.labels, journey: "QUALIFYING" }, ...commit(a) },
      note: `${actor} claimed the lead — committed to ${a["next"]} ${a["when"]}`,
    }),
  },
  NEED_HELP: {
    id: "NEED_HELP", label: "NEED HELP",
    prompts: [{ id: "why", q: "What do you need help with?", kind: "choice", options: ["PROPERTY KNOWLEDGE", "INVENTORY", "PRICING", "CUSTOMER OBJECTION", "LOCATION", "TECHNICAL ISSUE", "OTHER"] }],
    apply: (_l, a) => ({ patch: { blocker: `HELP: ${a["why"]}` }, note: `Help requested — ${a["why"]} (ownership unchanged)` }),
  },
  REASSIGN: {
    id: "REASSIGN", label: "REASSIGN",
    prompts: [
      { id: "why", q: "Reason for reassignment", kind: "choice", options: ["WRONG ZONE", "CAPACITY FULL", "LANGUAGE", "AREA EXPERTISE", "SHIFT ENDING", "INCORRECT ASSIGNMENT", "OTHER"] },
      { id: "to", q: "Reassign to", kind: "text", placeholder: "Operator name" },
    ],
    apply: (_l, a) => ({ patch: { handoverTo: a["to"], blocker: `REASSIGN: ${a["why"]}` }, note: `Formal transfer requested to ${a["to"]} — ${a["why"]}` }),
  },
  NOT_ACTIONABLE: {
    id: "NOT_ACTIONABLE", label: "NOT A LEAD",
    prompts: [{ id: "why", q: "Why is this not actionable?", kind: "choice", options: ["SPAM", "WRONG NUMBER", "NOT A CUSTOMER", "TEST", "OTHER"] }],
    apply: (_l, a) => ({ patch: { stage: "INVALID", lostReason: a["why"] }, note: `Marked invalid — ${a["why"]}` }),
  },

  /* Stage 4 — reconstruction */
  CONFIRM_RECONSTRUCTION: {
    id: "CONFIRM_RECONSTRUCTION", label: "RECONSTRUCTION IS CORRECT",
    apply: () => ({ patch: { reconstructionVerified: true }, note: "WhatsApp reconstruction verified — no repeat questions to the customer" }),
  },
  EDIT_RECONSTRUCTION: {
    id: "EDIT_RECONSTRUCTION", label: "EDIT RECONSTRUCTION",
    prompts: [
      { id: "field", q: "Which captured detail is wrong?", kind: "choice", options: ["AREA", "OFFICE/COLLEGE", "MOVE-IN", "BUDGET", "ROOM TYPE", "DURATION", "FOOD", "PARKING"] },
      { id: "value", q: "Correct value", kind: "text" },
    ],
    apply: (l, a) => {
      const key = ({ AREA: "area", "OFFICE/COLLEGE": "officeOrCollege", "MOVE-IN": "moveIn", BUDGET: "budget", "ROOM TYPE": "roomType", DURATION: "duration", FOOD: "food", PARKING: "parking" } as Record<string, string>)[a["field"] ?? ""];
      const v = a["value"] ?? "";
      return {
        patch: { requirement: { ...l.requirement, [key]: key === "budget" ? Number(v.replace(/\D/g, "")) : v } },
        note: `Reconstruction corrected — ${a["field"]} = ${v}`,
      };
    },
  },

  /* Stage 7 — qualification, one missing answer at a time */
  ANSWER_QUALIFICATION: {
    id: "ANSWER_QUALIFICATION", label: "CONTINUE QUALIFICATION",
    apply: () => ({ patch: {}, note: "Qualification answer captured" }),
  },

  /* Stage 8 — feasibility */
  SET_FEASIBILITY: {
    id: "SET_FEASIBILITY", label: "FEASIBILITY",
    prompts: [{ id: "f", q: "What does inventory say?", kind: "choice", options: ["PERFECT FIT", "GOOD FIT", "FIT WITH NEARBY AREA", "FIT WITH DIFFERENT ROOM TYPE", "NO CURRENT INVENTORY", "NOT FEASIBLE"] }],
    apply: (_l, a) => {
      const f = a["f"] ?? "";
      if (f === "NO CURRENT INVENTORY") return { patch: { feasibility: f, blocker: "No matching inventory", labels: { ..._l.labels, problem: "INVENTORY" }, nextAction: "FOLLOW-UP", nextActionAt: resolveWhen("TOMORROW") }, note: "No inventory — customer offered closest alternative or supply alert" };
      if (f === "NOT FEASIBLE") return { patch: { feasibility: f, blocker: "Budget gap", labels: { ..._l.labels, problem: "BUDGET" } }, note: "Not feasible — no irrelevant properties will be sent" };
      return { patch: { feasibility: f, stage: "MATCHING", labels: { ..._l.labels, journey: "PROPERTY_OPTIONS" } }, note: `Feasibility: ${f}` };
    },
  },

  /* Stage 9 — matching */
  SHARE_PROPERTY: {
    id: "SHARE_PROPERTY", label: "SHARE PROPERTY",
    blockedBy: (l) => (l.matches.length ? [] : ["No matching property yet"]),
    prompts: [
      { id: "property", q: "Which property?", kind: "text", placeholder: "Property name" },
      { id: "include", q: "Include", kind: "choice", options: ["PHOTOS + PRICE + LOCATION", "PHOTOS ONLY", "PRICE ONLY", "EVERYTHING"] },
      ...nextActionPrompts,
    ],
    apply: (l, a) => {
      const match = l.matches.find((m) => m.name.toLowerCase() === (a["property"] ?? "").toLowerCase()) ?? l.matches[0];
      return {
        patch: {
          stage: "PROPERTY_SHARED", selectedPropertyId: match?.id,
          engagement: { ...l.engagement, propertyShared: true, mediaShared: true, priceDiscussed: true },
          lastTeamMsgAt: new Date().toISOString(), ...commit(a),
        },
        note: `${match?.name ?? a["property"]} shared on WhatsApp (${a["include"]})`,
      };
    },
  },
  REJECT_PROPERTY: {
    id: "REJECT_PROPERTY", label: "CUSTOMER REJECTED",
    prompts: [{ id: "why", q: "What specifically doesn't work?", kind: "choice", options: ["PRICE", "LOCATION", "ROOM", "PROPERTY QUALITY", "FOOD", "AMENITY", "OTHER"] }],
    apply: (l, a) => ({
      patch: { stage: "MATCHING", rejectionReason: a["why"], selectedPropertyId: undefined, labels: { ...l.labels, problem: (a["why"] === "PRICE" ? "PRICE" : a["why"] === "LOCATION" ? "LOCATION" : "OTHER") } },
      note: `Property rejected — ${a["why"]}; rematching on that reason`,
    }),
  },

  /* Stage 10 — execution */
  CALL: {
    id: "CALL", label: "CALL",
    prompts: [
      { id: "outcome", q: "Call outcome", kind: "choice", options: ["CONNECTED", "NO ANSWER", "BUSY", "CALL BACK", "NOT INTERESTED"] },
      { id: "what", q: "What happened?", kind: "choice", options: ["QUALIFIED", "PROPERTY INTERESTED", "TOUR READY", "NEGOTIATING", "OTHER"], optional: true },
      ...nextActionPrompts,
    ],
    apply: (l, a) => {
      const patch: Partial<Lead> = {
        engagement: { ...l.engagement, callDone: true },
        lastTeamMsgAt: new Date().toISOString(), ...commit(a),
      };
      if (a["outcome"] === "NOT INTERESTED") { patch.stage = "LOST"; patch.lostReason = "Not interested"; }
      else if (a["what"] === "TOUR READY") { patch.stage = "TOUR_READY"; patch.labels = { ...l.labels, journey: "TOUR_READY" }; }
      else if (a["what"] === "NEGOTIATING") { patch.stage = "NEGOTIATING"; patch.labels = { ...l.labels, journey: "NEGOTIATING" }; }
      else if (a["outcome"] === "NO ANSWER" || a["outcome"] === "BUSY") patch.labels = { ...l.labels, problem: "NO_RESPONSE" };
      return { patch, note: `Call — ${a["outcome"]}${a["what"] ? ` · ${a["what"]}` : ""}` };
    },
  },
  WHATSAPP: {
    id: "WHATSAPP", label: "WHATSAPP",
    prompts: [{ id: "text", q: "What did you send?", kind: "text" }, ...nextActionPrompts],
    apply: (_l, a) => ({
      patch: { lastTeamMsgAt: new Date().toISOString(), ...commit(a) },
      note: `WhatsApp sent — “${a["text"]}”`,
    }),
  },
  LOG_ACTIVITY: {
    id: "LOG_ACTIVITY", label: "LOG ACTIVITY",
    prompts: [
      { id: "type", q: "Activity", kind: "choice", options: ["CALL", "WHATSAPP", "QUALIFICATION", "PROPERTY", "VISIT", "NEGOTIATION", "CLOSE", "OTHER"] },
      { id: "outcome", q: "What happened?", kind: "text" },
      { id: "stage", q: "Where is the customer now?", kind: "choice", options: ["QUALIFYING", "MATCHING", "PROPERTY_SHARED", "CALL_REQUIRED", "TOUR_READY", "TOUR_SCHEDULED", "POST_TOUR", "NEGOTIATING", "QUOTE_SENT", "TOKEN_PENDING", "BOOKING_CREATED", "FUTURE", "LOST"] },
      ...nextActionPrompts,
    ],
    apply: (_l, a) => ({
      patch: { stage: a["stage"] as Stage, ...commit(a) },
      note: `${a["type"]} logged — ${a["outcome"]} → ${a["stage"]}`,
    }),
  },
  ANSWER_QUESTION: {
    id: "ANSWER_QUESTION", label: "ANSWER OPEN QUESTION",
    prompts: [{ id: "ans", q: "Your answer to the customer", kind: "text" }],
    apply: (_l, a) => ({ patch: { openQuestion: undefined, lastTeamMsgAt: new Date().toISOString() }, note: `Open question answered — ${a["ans"]}` }),
  },
  RESOLVE_OBJECTION: {
    id: "RESOLVE_OBJECTION", label: "RESOLVE OBJECTION",
    prompts: [{ id: "how", q: "How was it resolved?", kind: "text" }],
    apply: (l, a) => ({ patch: { openObjection: undefined, blocker: undefined, labels: { ...l.labels, problem: "NONE" } }, note: `Objection resolved — ${a["how"]}` }),
  },
  UPLOAD_SCREENSHOT: {
    id: "UPLOAD_SCREENSHOT", label: "Upload screenshot",
    apply: () => ({ patch: { lastScreenshotAt: new Date().toISOString() }, note: "Conversation evidence refreshed" }),
  },
  ADD_NOTE: {
    id: "ADD_NOTE", label: "Add note",
    prompts: [{ id: "text", q: "Note", kind: "text" }],
    apply: (_l, a) => ({ patch: {}, note: `Note — ${a["text"]}` }),
  },
  SET_LABELS: {
    id: "SET_LABELS", label: "Label the lead",
    prompts: [
      { id: "timing", q: "Timing", kind: "choice", options: ["IMMEDIATE", "TODAY", "THIS_WEEK", "FUTURE"] },
      { id: "likelihood", q: "Closing likelihood", kind: "choice", options: ["VERY_HIGH", "HIGH", "MEDIUM", "LOW"] },
      { id: "problem", q: "Problem label", kind: "choice", options: ["NONE", "NO_RESPONSE", "PRICE", "BUDGET", "LOCATION", "INVENTORY", "ROOM_TYPE", "PARENT_APPROVAL", "DECISION_DELAY", "TRY_NEARBY", "OTHER"] },
    ],
    apply: (l, a) => ({
      patch: { labels: { ...l.labels, timing: a["timing"] as Lead["labels"]["timing"], likelihood: a["likelihood"] as Lead["labels"]["likelihood"], problem: a["problem"] as Lead["labels"]["problem"] } },
      note: `Labels set — ${a["timing"]} · ${a["likelihood"]} · ${a["problem"]}`,
    }),
  },

  /* Stage 11-12 — tour */
  SCHEDULE_TOUR: {
    id: "SCHEDULE_TOUR", label: "SCHEDULE TOUR",
    blockedBy: (l) => {
      const p = l.matches.find((m) => m.id === l.selectedPropertyId);
      const missing: string[] = [];
      if (!p) missing.push("Property not selected");
      if (!l.requirement.moveIn) missing.push("Move-in date");
      if (!l.requirement.budget) missing.push("Budget");
      if (p && !p.rent) missing.push("Rent");
      if (p && !p.deposit) missing.push("Deposit");
      if (p && !p.maintenance) missing.push("Maintenance");
      if (p && !p.bookingAmount) missing.push("Booking amount");
      return missing;
    },
    prompts: [
      { id: "room", q: "Which room?", kind: "text", placeholder: "203 Double" },
      { id: "date", q: "Which date?", kind: "date" },
      { id: "time", q: "What time?", kind: "text", placeholder: "6:00 PM" },
      { id: "handler", q: "Who handles the tour?", kind: "choice", options: ["I WILL HANDLE", "TCM WILL HANDLE"] },
      { id: "tcm", q: "TCM name (if TCM handles)", kind: "text", optional: true },
    ],
    apply: (l, a, actor) => {
      const p = l.matches.find((m) => m.id === l.selectedPropertyId)!;
      const tcm = a["handler"] === "TCM WILL HANDLE";
      return {
        patch: {
          stage: "TOUR_SCHEDULED", labels: { ...l.labels, journey: "TOUR_SCHEDULED" },
          engagement: { ...l.engagement, tourDiscussed: true, tourScheduled: true },
          tour: {
            propertyId: p.id, propertyName: p.name, room: a["room"] ?? p.room ?? "—",
            at: `${a["date"]} ${a["time"]}`, handledBy: tcm ? "TCM" : "OPERATOR",
            tourOwner: tcm ? (a["tcm"] || "TCM") : actor, handoverAccepted: !tcm,
            propertyInformed: false, propertyAcknowledged: false,
          },
          nextAction: tcm ? "TCM must accept handover" : "Inform property", nextActionAt: resolveWhen("15 MINUTES"),
        },
        note: `Tour scheduled — ${p.name} ${a["date"]} ${a["time"]}, handled by ${tcm ? a["tcm"] || "TCM" : actor}`,
      };
    },
  },
  INFORM_PROPERTY: {
    id: "INFORM_PROPERTY", label: "INFORM PROPERTY",
    apply: (l) => ({
      patch: { tour: { ...l.tour!, propertyInformed: true }, nextAction: "Property acknowledgement", nextActionAt: resolveWhen("15 MINUTES") },
      note: "Property manager informed — commercials stay with the Gharpayy POC",
    }),
  },
  PROPERTY_ACK: {
    id: "PROPERTY_ACK", label: "PROPERTY ACKNOWLEDGED",
    apply: (l) => ({ patch: { tour: { ...l.tour!, propertyAcknowledged: true }, nextAction: "Pre-tour confirmation", nextActionAt: resolveWhen("2 HOURS") }, note: "Property acknowledged the visit" }),
  },
  PRE_TOUR_CONFIRM: {
    id: "PRE_TOUR_CONFIRM", label: "CONFIRM WITH CUSTOMER",
    prompts: [
      { id: "r", q: "Are you still on track for the visit?", kind: "choice", options: ["YES", "RUNNING LATE", "RESCHEDULE", "CANCEL"] },
      { id: "detail", q: "ETA / new date-time / cancellation reason", kind: "text", optional: true },
    ],
    apply: (l, a) => {
      const t = l.tour!;
      if (a["r"] === "YES") return { patch: { stage: "EN_ROUTE", tour: { ...t, customerConfirmed: "YES" } }, note: "Customer confirmed — en route" };
      if (a["r"] === "RUNNING LATE") return { patch: { stage: "EN_ROUTE", tour: { ...t, customerConfirmed: "LATE", eta: a["detail"] } }, note: `Running late — ETA ${a["detail"]}, property updated` };
      if (a["r"] === "RESCHEDULE") return { patch: { stage: "TOUR_SCHEDULED", tour: { ...t, customerConfirmed: "RESCHEDULE", at: a["detail"] ?? t.at } }, note: `Visit rescheduled to ${a["detail"]}` };
      return { patch: { stage: "MATCHING", tour: { ...t, customerConfirmed: "CANCEL" }, blocker: a["detail"] }, note: `Visit cancelled — ${a["detail"]} (visit history kept)` };
    },
  },
  MARK_ARRIVED: {
    id: "MARK_ARRIVED", label: "MARK ARRIVED",
    prompts: [{ id: "met", q: "Has the customer met the property representative?", kind: "choice", options: ["YES", "NO"] }],
    apply: (l, a) => ({
      patch: { stage: "ARRIVED", tour: { ...l.tour!, metRepresentative: a["met"] === "YES" }, nextAction: a["met"] === "YES" ? "Start tour" : "Alert property manager", nextActionAt: resolveWhen("NOW") },
      note: a["met"] === "YES" ? "Customer arrived and met the representative" : "Customer arrived but nobody received them — property alerted",
    }),
  },
  START_TOUR: {
    id: "START_TOUR", label: "START TOUR",
    apply: (l) => ({ patch: { stage: "TOUR_LIVE", tour: { ...l.tour!, startedAt: new Date().toISOString() } }, note: "Tour live" }),
  },
  TOUR_ISSUE: {
    id: "TOUR_ISSUE", label: "RAISE ISSUE",
    prompts: [{ id: "kind", q: "What is happening?", kind: "choice", options: ["ROOM ISSUE", "PROPERTY ISSUE", "CUSTOMER NEEDS HELP", "PRICE QUESTION", "ALTERNATIVE ROOM", "ALTERNATIVE PROPERTY"] }],
    apply: (_l, a) => ({ patch: { blocker: a["kind"], nextAction: "Resolve live issue", nextActionAt: resolveWhen("NOW") }, note: `Live visit issue — ${a["kind"]}` }),
  },
  COMPLETE_TOUR: {
    id: "COMPLETE_TOUR", label: "COMPLETE TOUR",
    prompts: [
      { id: "reaction", q: "How did the customer react?", kind: "choice", options: ["LOVED IT", "LIKED IT", "UNSURE", "DID NOT LIKE"] },
      { id: "room", q: "Which room did they prefer?", kind: "text", optional: true },
      { id: "blocker", q: "Main blocker?", kind: "choice", options: ["NONE", "PRICE", "ROOM", "DEPOSIT", "FOOD", "LOCATION", "PARENT APPROVAL", "COMPARING", "PROPERTY QUALITY", "MOVE-IN", "OTHER"] },
    ],
    apply: (l, a) => {
      const reaction = (a["reaction"] ?? "").replace(/ /g, "_") as NonNullable<Lead["tour"]>["reaction"];
      const stage: Stage = a["reaction"] === "DID NOT LIKE" ? "MATCHING" : "POST_TOUR";
      return {
        patch: {
          stage, labels: { ...l.labels, journey: "POST_TOUR" },
          engagement: { ...l.engagement, tourCompleted: true, objectionIdentified: a["blocker"] !== "NONE" },
          tour: { ...l.tour!, completedAt: new Date().toISOString(), reaction, preferredRoom: a["room"], blocker: a["blocker"] },
          blocker: a["blocker"] === "NONE" ? undefined : a["blocker"],
          openObjection: a["blocker"] === "NONE" ? undefined : a["blocker"],
          nextAction: a["reaction"] === "LOVED IT" ? "SEND QUOTE" : a["reaction"] === "DID NOT LIKE" ? "SHOW ALTERNATIVE" : "Resolve blocker",
          nextActionAt: resolveWhen("15 MINUTES"),
        },
        note: `Tour completed — ${a["reaction"]}, room ${a["room"] || "—"}, blocker ${a["blocker"]}`,
      };
    },
  },
  CLOSE_AS_LOST: {
    id: "CLOSE_AS_LOST", label: "Mark lost",
    prompts: [
      { id: "why", q: "Lost reason", kind: "choice", options: ["BUDGET", "LOCATION", "NO INVENTORY", "BOOKED ELSEWHERE", "PROPERTY QUALITY", "ROOM", "FOOD", "DEPOSIT", "PARENT REJECTED", "CHANGED CITY", "MOVE-IN POSTPONED", "NO RESPONSE", "DUPLICATE", "OTHER"] },
      { id: "competitor", q: "Competitor / property, if known", kind: "text", optional: true },
    ],
    apply: (_l, a) => ({ patch: { stage: "LOST", lostReason: `${a["why"]}${a["competitor"] ? ` — ${a["competitor"]}` : ""}`, nextAction: undefined, nextActionAt: undefined }, note: `Lost — ${a["why"]}${a["competitor"] ? ` (${a["competitor"]})` : ""}` }),
  },
  MARK_FUTURE: {
    id: "MARK_FUTURE", label: "Mark future",
    prompts: [
      { id: "moveIn", q: "Move-in date", kind: "date" },
      { id: "decision", q: "Expected decision date", kind: "date" },
      { id: "followUp", q: "Next follow-up date", kind: "date" },
      { id: "why", q: "Reason", kind: "text" },
    ],
    apply: (l, a) => ({
      patch: {
        stage: "FUTURE", requirement: { ...l.requirement, moveIn: a["moveIn"] },
        futureDecisionAt: a["decision"], followUpAt: a["followUp"],
        nextAction: "FOLLOW-UP", nextActionAt: resolveWhen(a["followUp"] ?? "TOMORROW"),
        labels: { ...l.labels, timing: "FUTURE" }, blocker: a["why"],
      },
      note: `Future lead — move-in ${a["moveIn"]}, decision ${a["decision"]}, follow-up ${a["followUp"]}`,
    }),
  },

  /* Stage 17-18 — quote & negotiation */
  SEND_QUOTE: {
    id: "SEND_QUOTE", label: "SEND QUOTE",
    blockedBy: (l) => {
      const p = l.matches.find((m) => m.id === l.selectedPropertyId);
      const missing: string[] = [];
      if (!p) missing.push("Property not selected");
      if (p && !p.deposit) missing.push("Deposit");
      if (p && !p.bookingAmount) missing.push("Booking amount");
      if (!l.requirement.moveIn) missing.push("Move-in date");
      return missing;
    },
    prompts: [
      { id: "offer", q: "Offered rent", kind: "number" },
      { id: "valid", q: "Offer valid until", kind: "text", placeholder: "8 PM today" },
    ],
    apply: (l, a) => {
      const p = l.matches.find((m) => m.id === l.selectedPropertyId)!;
      const offer = Number(a["offer"]) || p.rent;
      return {
        patch: {
          stage: "QUOTE_SENT", labels: { ...l.labels, journey: "NEGOTIATING" },
          engagement: { ...l.engagement, quotationSent: true },
          quote: {
            id: `Q-${Date.now().toString().slice(-5)}`, propertyId: p.id, room: l.tour?.preferredRoom ?? p.room ?? "—",
            roomType: p.roomType, actualRent: p.rent, offerRent: offer, deposit: p.deposit ?? 0,
            maintenance: p.maintenance ?? 0, lockIn: "6 months", notice: "1 month",
            bookingAmount: p.bookingAmount ?? 5000, validUntil: a["valid"] ?? "today",
            moveIn: l.requirement.moveIn ?? "—", sentAt: new Date().toISOString(),
          },
          nextAction: "Quote response", nextActionAt: resolveWhen("30 MINUTES"),
        },
        note: `Quote sent — ${p.name} at ₹${offer.toLocaleString("en-IN")}, valid until ${a["valid"]}`,
      };
    },
  },
  QUOTE_OUTCOME: {
    id: "QUOTE_OUTCOME", label: "WHAT HAPPENED?",
    prompts: [
      { id: "o", q: "Quote outcome", kind: "choice", options: ["ACCEPTED", "PRICE OBJECTION", "DEPOSIT OBJECTION", "NEEDS APPROVAL", "NEEDS TIME", "NO RESPONSE", "REJECTED"] },
      { id: "detail", q: "Expected price / who approves / when to reconnect", kind: "text", optional: true },
    ],
    apply: (l, a) => {
      const o = a["o"] ?? "";
      const q = l.quote ? { ...l.quote, outcome: o } : undefined;
      if (o === "ACCEPTED") return { patch: { stage: "TOKEN_PENDING", quote: q, labels: { ...l.labels, journey: "TOKEN_PENDING" }, nextAction: "Create booking", nextActionAt: resolveWhen("15 MINUTES") }, note: "Quote accepted" };
      if (o === "REJECTED") return { patch: { stage: "MATCHING", quote: q, blocker: "Quote rejected" }, note: `Quote rejected — ${a["detail"] ?? ""}` };
      const problem: Lead["labels"]["problem"] = o === "PRICE OBJECTION" ? "PRICE" : o === "NEEDS APPROVAL" ? "PARENT_APPROVAL" : o === "NO RESPONSE" ? "NO_RESPONSE" : "DECISION_DELAY";
      return {
        patch: {
          stage: "NEGOTIATING", quote: q, openObjection: o, blocker: o,
          expectedPrice: o === "PRICE OBJECTION" ? Number((a["detail"] ?? "").replace(/\D/g, "")) || undefined : undefined,
          labels: { ...l.labels, journey: "NEGOTIATING", problem },
          nextAction: o === "NEEDS TIME" || o === "NEEDS APPROVAL" ? "FOLLOW-UP" : "NEGOTIATE",
          nextActionAt: resolveWhen(a["detail"] && Date.parse(a["detail"]) ? a["detail"] : "2 HOURS"),
        },
        note: `Quote outcome — ${o}${a["detail"] ? ` (${a["detail"]})` : ""}`,
      };
    },
  },
  NEGOTIATE: {
    id: "NEGOTIATE", label: "NEGOTIATE",
    prompts: [
      { id: "price", q: "What price is the customer expecting?", kind: "number" },
      { id: "authority", q: "Your discount authority", kind: "choice", options: ["OPERATOR ₹500", "CLOSER ₹1,500", "MANAGER"] },
    ],
    apply: (l, a) => {
      const expected = Number(a["price"]) || 0;
      const cap = a["authority"] === "OPERATOR ₹500" ? 500 : a["authority"] === "CLOSER ₹1,500" ? 1500 : 100000;
      const gap = (l.quote?.offerRent ?? 0) - expected;
      if (gap > cap) return {
        patch: { approvalRequested: true, expectedPrice: expected, nextAction: "Approval required", nextActionAt: resolveWhen("30 MINUTES") },
        note: `₹${gap.toLocaleString("en-IN")} discount exceeds authority — approval requested, no verbal promise made`,
      };
      return {
        patch: {
          quote: l.quote ? { ...l.quote, offerRent: expected, outcome: "REVISED" } : undefined,
          openObjection: undefined, blocker: undefined, approvalRequested: false,
          stage: "QUOTE_SENT", nextAction: "Quote response", nextActionAt: resolveWhen("30 MINUTES"),
        },
        note: `Revised quote at ₹${expected.toLocaleString("en-IN")} — within authority`,
      };
    },
  },
  APPROVE_DISCOUNT: {
    id: "APPROVE_DISCOUNT", label: "APPROVE DISCOUNT",
    apply: (l) => ({
      patch: { approvalRequested: false, quote: l.quote ? { ...l.quote, offerRent: l.expectedPrice ?? l.quote.offerRent, outcome: "REVISED" } : undefined, stage: "QUOTE_SENT" },
      note: `Discount approved at ₹${(l.expectedPrice ?? 0).toLocaleString("en-IN")}`,
    }),
  },

  /* Stage 19-22 — booking & property approval */
  CREATE_BOOKING: {
    id: "CREATE_BOOKING", label: "CREATE BOOKING",
    blockedBy: (l) => (l.quote ? [] : ["No quotation to freeze"]),
    apply: (l, _a, actor) => {
      const q = l.quote!;
      const p = l.matches.find((m) => m.id === q.propertyId);
      return {
        patch: {
          stage: "BOOKING_CREATED",
          booking: {
            id: `GP-${Math.floor(10000 + Math.random() * 89999)}`, propertyId: q.propertyId,
            propertyName: p?.name ?? "—", room: q.room, roomType: q.roomType,
            rent: q.offerRent, deposit: q.deposit, maintenance: q.maintenance,
            bookingAmount: q.bookingAmount, discount: q.actualRent - q.offerRent,
            moveIn: q.moveIn, lockIn: q.lockIn, notice: q.notice, quoteId: q.id,
            leadOwner: l.owner ?? actor, tourOwner: l.tour?.tourOwner, createdBy: actor,
            createdAt: new Date().toISOString(), inventoryApproval: "PENDING", commercialApproval: "PENDING",
          },
          nextAction: "Send for property approval", nextActionAt: resolveWhen("15 MINUTES"),
        },
        note: "Booking created — commercial terms frozen",
      };
    },
  },
  TOKEN_COMING: {
    id: "TOKEN_COMING", label: "TOKEN IN A FEW MINUTES",
    prompts: [{ id: "when", q: "By when?", kind: "when" }],
    apply: (_l, a) => ({ patch: { stage: "TOKEN_PENDING", nextAction: "Collect token", nextActionAt: resolveWhen(a["when"] ?? "30 MINUTES") }, note: `Token promised ${a["when"]}` }),
  },
  FINAL_QUESTION_PENDING: {
    id: "FINAL_QUESTION_PENDING", label: "FINAL CONFIRMATION PENDING",
    prompts: [{ id: "what", q: "What exactly remains unresolved?", kind: "text" }],
    apply: (_l, a) => ({ patch: { blocker: a["what"], nextAction: "Resolve final question", nextActionAt: resolveWhen("2 HOURS") }, note: `Final confirmation pending — ${a["what"]}` }),
  },
  SEND_FOR_APPROVAL: {
    id: "SEND_FOR_APPROVAL", label: "SEND FOR PROPERTY APPROVAL",
    apply: (l) => ({ patch: { stage: "APPROVAL_PENDING", booking: { ...l.booking! }, nextAction: "Property approval", nextActionAt: resolveWhen("30 MINUTES") }, note: "Approval request sent to the property manager" }),
  },
  PROPERTY_APPROVAL: {
    id: "PROPERTY_APPROVAL", label: "RECORD PROPERTY RESPONSE",
    prompts: [
      { id: "inventory", q: "Is this room actually available for this move-in?", kind: "choice", options: ["YES", "NO", "DIFFERENT ROOM AVAILABLE"] },
      { id: "reason", q: "If no — reason", kind: "choice", optional: true, options: ["ALREADY BOOKED", "MAINTENANCE", "TENANT EXTENDED", "WRONG AVAILABILITY", "MOVE-IN IMPOSSIBLE", "OTHER"] },
      { id: "commercial", q: "Are the commercial details correct?", kind: "choice", options: ["YES", "CORRECTION REQUIRED"] },
      { id: "correction", q: "If correction — what changes?", kind: "text", optional: true },
    ],
    apply: (l, a) => {
      const b = l.booking!;
      const inv = a["inventory"] === "YES" ? "YES" : a["inventory"] === "NO" ? "NO" : "DIFFERENT_ROOM";
      const com = a["commercial"] === "YES" ? "YES" : "CORRECTION_REQUIRED";
      if (inv === "YES" && com === "YES") return {
        patch: { booking: { ...b, inventoryApproval: "YES", commercialApproval: "YES" }, nextAction: "Lock room", nextActionAt: resolveWhen("15 MINUTES") },
        note: "Booking approved — inventory and commercials confirmed",
      };
      if (inv === "NO") return {
        patch: { booking: { ...b, inventoryApproval: "NO", approvalNote: a["reason"] }, blocker: `Room unavailable: ${a["reason"]}`, nextAction: "Offer alternative", nextActionAt: resolveWhen("NOW") },
        note: `Room unavailable — ${a["reason"]}; alternative flow opened`,
      };
      return {
        patch: {
          booking: { ...b, inventoryApproval: inv as "DIFFERENT_ROOM", commercialApproval: com, approvalNote: a["correction"] },
          blocker: com === "CORRECTION_REQUIRED" ? `Commercial correction: ${a["correction"]}` : "Alternative room offered",
          nextAction: "Customer must approve the change", nextActionAt: resolveWhen("30 MINUTES"),
        },
        note: `Property responded — ${a["inventory"]} / ${a["commercial"]} ${a["correction"] ?? ""}`.trim(),
      };
    },
  },
  CUSTOMER_APPROVES_CHANGE: {
    id: "CUSTOMER_APPROVES_CHANGE", label: "CUSTOMER APPROVED THE CHANGE",
    prompts: [{ id: "detail", q: "What did the customer approve?", kind: "text" }],
    apply: (l) => ({
      patch: { booking: { ...l.booking!, inventoryApproval: "YES", commercialApproval: "YES", customerConfirmed: true }, blocker: undefined, nextAction: "Lock room", nextActionAt: resolveWhen("15 MINUTES") },
      note: "Customer approved the amended booking — history preserved",
    }),
  },
  LOCK_ROOM: {
    id: "LOCK_ROOM", label: "LOCK ROOM",
    blockedBy: (l) => (l.booking?.inventoryApproval === "YES" && l.booking?.commercialApproval === "YES" ? [] : ["Property approval incomplete"]),
    prompts: [{ id: "hold", q: "Hold expires", kind: "when" }],
    apply: (l, a) => ({
      patch: { stage: "ROOM_HELD", booking: { ...l.booking!, roomHeldUntil: resolveWhen(a["hold"] ?? "2 HOURS") }, nextAction: "Collect payment", nextActionAt: resolveWhen(a["hold"] ?? "2 HOURS") },
      note: `Room ${l.booking?.room} held until ${new Date(resolveWhen(a["hold"] ?? "2 HOURS")).toLocaleTimeString()}`,
    }),
  },

  /* Stage 23-26 — payment, reservation, confirmation */
  LOG_PAYMENT: {
    id: "LOG_PAYMENT", label: "LOG PAYMENT",
    prompts: [
      { id: "amount", q: "How much did the customer pay?", kind: "number" },
      { id: "paidTo", q: "Paid to whom?", kind: "choice", options: ["GHARPAYY", "PROPERTY", "SPLIT"] },
      { id: "mode", q: "Payment mode", kind: "choice", options: ["UPI", "BANK", "CASH", "OTHER"] },
      { id: "proof", q: "Proof available?", kind: "choice", options: ["YES", "NO"] },
      { id: "verified", q: "Verified?", kind: "choice", options: ["YES", "NO"] },
      { id: "balanceWhen", q: "If partial — balance by when?", kind: "when", optional: true },
    ],
    apply: (l, a) => {
      const amount = Number(a["amount"]) || 0;
      const payment = {
        id: `P-${Date.now().toString().slice(-5)}`, amount,
        paidTo: (a["paidTo"] ?? "GHARPAYY") as "GHARPAYY", mode: (a["mode"] ?? "UPI") as "UPI",
        proof: a["proof"] === "YES", verified: a["verified"] === "YES", at: new Date().toISOString(),
      };
      const payments = [...l.payments, payment];
      const received = payments.filter((p) => p.verified).reduce((s, p) => s + p.amount, 0);
      const required = l.booking?.bookingAmount ?? 0;
      const stage: Stage = received >= required && required > 0 ? "PAYMENT_PENDING" : "PAYMENT_PENDING";
      return {
        patch: {
          stage, payments,
          blocker: !payment.verified && payment.proof ? "PAYMENT VERIFICATION PENDING" : received < required ? `Balance ₹${(required - received).toLocaleString("en-IN")} pending` : undefined,
          nextAction: received >= required ? "Confirm reservation" : "Collect balance",
          nextActionAt: resolveWhen(a["balanceWhen"] || "30 MINUTES"),
        },
        note: `₹${amount.toLocaleString("en-IN")} ${a["mode"]} to ${a["paidTo"]} — proof ${a["proof"]}, verified ${a["verified"]}`,
      };
    },
  },
  VERIFY_PAYMENT: {
    id: "VERIFY_PAYMENT", label: "VERIFY PAYMENT",
    apply: (l) => ({
      patch: { payments: l.payments.map((p) => ({ ...p, verified: true })), blocker: undefined, nextAction: "Confirm reservation", nextActionAt: resolveWhen("15 MINUTES") },
      note: "Payment verified against the account — not just a screenshot",
    }),
  },
  CONFIRM_RESERVATION: {
    id: "CONFIRM_RESERVATION", label: "CONFIRM RESERVATION",
    blockedBy: (l) => {
      const missing: string[] = [];
      const received = l.payments.filter((p) => p.verified).reduce((s, p) => s + p.amount, 0);
      if (l.booking?.inventoryApproval !== "YES" || l.booking?.commercialApproval !== "YES") missing.push("Property approval");
      if (!l.booking?.roomHeldUntil) missing.push("Room hold");
      if (received < (l.booking?.bookingAmount ?? 0)) missing.push("Verified booking amount");
      return missing;
    },
    apply: (l) => ({
      patch: { stage: "RESERVED", booking: { ...l.booking!, customerConfirmed: true }, blocker: undefined, nextAction: "Final room lock with property", nextActionAt: resolveWhen("15 MINUTES"), labels: { ...l.labels, journey: "BOOKED" } },
      note: "RESERVED — approval, hold, verified payment and customer confirmation all in place",
    }),
  },
  FINAL_ROOM_LOCK: {
    id: "FINAL_ROOM_LOCK", label: "FINAL ROOM LOCK CONFIRMED",
    apply: (l) => ({ patch: { booking: { ...l.booking!, finalRoomLock: true }, nextAction: "Send customer confirmation", nextActionAt: resolveWhen("15 MINUTES") }, note: "Second property confirmation — room can no longer be sold to anyone else" }),
  },
  SEND_CUSTOMER_CONFIRMATION: {
    id: "SEND_CUSTOMER_CONFIRMATION", label: "SEND BOOKING CONFIRMATION",
    apply: (l) => ({ patch: { nextAction: "Check-in readiness", nextActionAt: resolveWhen("TOMORROW") }, note: `Booking confirmation sent — ${l.booking?.id}, move-in ${l.booking?.moveIn}` }),
  },

  /* Stage 27-30 — check-in and settlement */
  CHECKIN_CHECKLIST: {
    id: "CHECKIN_CHECKLIST", label: "SEND PROPERTY CHECKLIST",
    prompts: [
      { id: "room", q: "Room ready?", kind: "choice", options: ["YES", "NO"] },
      { id: "cleaning", q: "Cleaning completed?", kind: "choice", options: ["YES", "NO"] },
      { id: "bed", q: "Bed / mattress ready?", kind: "choice", options: ["YES", "NO"] },
      { id: "cupboard", q: "Cupboard ready?", kind: "choice", options: ["YES", "NO"] },
      { id: "wifi", q: "Wi-Fi / access ready?", kind: "choice", options: ["YES", "NO"] },
      { id: "keys", q: "Keys ready?", kind: "choice", options: ["YES", "NO"] },
      { id: "maintenance", q: "Any maintenance issue?", kind: "choice", options: ["NO", "YES"] },
      { id: "balance", q: "Balance amount at check-in", kind: "number", optional: true },
    ],
    apply: (l, a) => {
      const c = {
        roomReady: a["room"] === "YES", cleaning: a["cleaning"] === "YES", bed: a["bed"] === "YES",
        cupboard: a["cupboard"] === "YES", wifi: a["wifi"] === "YES", keys: a["keys"] === "YES",
        maintenanceIssue: a["maintenance"] === "YES", balanceKnown: !!a["balance"], balanceAmount: Number(a["balance"]) || 0,
      };
      const green = c.roomReady && c.cleaning && c.bed && c.cupboard && c.wifi && c.keys && !c.maintenanceIssue;
      return {
        patch: {
          stage: "CHECKIN_READY", checkin: { ...l.checkin, ...c },
          blocker: green ? undefined : "Room not ready — escalate before the customer arrives",
          nextAction: green ? "Check-in day contact" : "Fix before check-in / alternative room", nextActionAt: resolveWhen(green ? "TOMORROW" : "NOW"),
        },
        note: green ? "CHECK-IN READY — every item green" : "Check-in readiness failed — escalated",
      };
    },
  },
  CHECKIN_DAY: {
    id: "CHECKIN_DAY", label: "CHECK-IN DAY CONTACT",
    prompts: [
      { id: "status", q: "Are you on the way?", kind: "choice", options: ["YES", "DELAYED", "RESCHEDULED", "ISSUE"] },
      { id: "eta", q: "ETA / new date", kind: "text", optional: true },
    ],
    apply: (l, a) => ({
      patch: { checkin: { ...l.checkin, customerEta: a["eta"] }, blocker: a["status"] === "ISSUE" ? "Customer reported an issue before check-in" : undefined, nextAction: "Room handover", nextActionAt: resolveWhen("2 HOURS") },
      note: `Check-in day — ${a["status"]}${a["eta"] ? ` ETA ${a["eta"]}` : ""}`,
    }),
  },
  HANDOVER_ROOM: {
    id: "HANDOVER_ROOM", label: "ROOM HANDOVER",
    prompts: [
      { id: "reached", q: "Customer reached?", kind: "choice", options: ["YES", "NO"] },
      { id: "handed", q: "Room handed over?", kind: "choice", options: ["YES", "NO"] },
      { id: "inspected", q: "Customer inspected the room?", kind: "choice", options: ["YES", "NO"] },
      { id: "balance", q: "Pending amount collected?", kind: "choice", options: ["YES", "NO", "NOT APPLICABLE"] },
      { id: "issue", q: "Any issue?", kind: "choice", options: ["NO ISSUE", "ROOM CLEANLINESS", "WRONG ROOM", "AMENITIES", "PAYMENT CONFUSION", "PROPERTY BEHAVIOUR", "ACCESS", "FOOD", "OTHER"] },
    ],
    apply: (l, a) => {
      const clean = a["issue"] === "NO ISSUE" && a["handed"] === "YES";
      return {
        patch: {
          checkin: { ...l.checkin, handedOver: a["handed"] === "YES", inspected: a["inspected"] === "YES", balanceCollected: a["balance"] === "YES", issue: clean ? undefined : a["issue"] },
          blocker: clean ? undefined : `CHECK-IN RESOLUTION: ${a["issue"]}`,
          nextAction: clean ? "Mark checked in" : "Resolve check-in issue", nextActionAt: resolveWhen("NOW"),
        },
        note: clean ? "Room handed over, no issues" : `Check-in issue opened — ${a["issue"]}`,
      };
    },
  },
  MARK_CHECKED_IN: {
    id: "MARK_CHECKED_IN", label: "MARK CHECKED IN",
    blockedBy: (l) => (l.checkin?.handedOver ? [] : ["Room not handed over"]),
    apply: () => ({
      patch: { stage: "CHECKED_IN", nextAction: undefined, nextActionAt: undefined, blocker: undefined },
      note: "CHECKED IN — lead pipeline ends, booking moves to active stay",
    }),
  },
  SETTLE: {
    id: "SETTLE", label: "SETTLE",
    prompts: [
      { id: "gharpayy", q: "Customer paid Gharpayy", kind: "number" },
      { id: "property", q: "Customer paid property", kind: "number" },
      { id: "commission", q: "Commission", kind: "number" },
    ],
    apply: (_l, a) => ({
      patch: {
        stage: "SETTLED",
        settlement: {
          paidToGharpayy: Number(a["gharpayy"]) || 0, paidToProperty: Number(a["property"]) || 0,
          owedToProperty: 0, owedToGharpayy: 0, commission: Number(a["commission"]) || 0, status: "SETTLED",
        },
      },
      note: "SETTLED — moved to the historical ledger",
    }),
  },
  REVIVE_FUTURE: {
    id: "REVIVE_FUTURE", label: "BRING BACK TO ACTIVE QUEUE",
    prompts: nextActionPrompts,
    apply: (l, a) => ({ patch: { stage: "QUALIFYING", labels: { ...l.labels, timing: "TODAY" }, ...commit(a) }, note: "Future follow-up due — lead returned to the active queue" }),
  },
};

/* ------------------------------------------------------------------ stages */

export interface StageConfig {
  headline: (l: Lead) => string;
  sub?: (l: Lead) => string;
  primary: string[];
  secondary: string[];
  requiredFields: string[];
  nextStages: Stage[];
  slaSeconds: number;
  group: "capture" | "work" | "tour" | "close" | "booking" | "checkin" | "closed";
}

const UNIVERSAL = ["CALL", "WHATSAPP", "LOG_ACTIVITY"];

export const WORKFLOW: Record<Stage, StageConfig> = {
  CAPTURED: {
    headline: () => "New customer found — is this someone we already know?",
    sub: (l) => `Source ${l.channel} · ${l.waAccount}`,
    primary: ["SAME_REQUIREMENT", "NEW_REQUIREMENT"], secondary: ["SET_PRESENCE", "NOT_ACTIONABLE"],
    requiredFields: ["identity", "whatsapp source"], nextStages: ["IDENTIFIED", "DUPLICATE_REVIEW", "IDENTITY_RESOLUTION", "INVALID"], slaSeconds: 300, group: "capture",
  },
  DUPLICATE_REVIEW: {
    headline: () => "DUPLICATE REVIEW — do not contact the customer until this is resolved",
    sub: (l) => `${l.duplicateOf?.length ?? 0} possible matches on this number`,
    primary: ["MERGE_DUPLICATE", "SAME_REQUIREMENT", "NEW_REQUIREMENT"], secondary: ["ADD_NOTE"],
    requiredFields: ["duplicate decision"], nextStages: ["IDENTIFIED", "INVALID"], slaSeconds: 900, group: "capture",
  },
  IDENTITY_RESOLUTION: {
    headline: () => "IDENTITY RESOLUTION — find the number before anyone calls",
    sub: (l) => l.identityNote ?? "Phone, WhatsApp and name must be confirmed manually",
    primary: ["RESOLVE_IDENTITY"], secondary: ["UPLOAD_SCREENSHOT", "NOT_ACTIONABLE"],
    requiredFields: ["phone", "name", "manual verification"], nextStages: ["IDENTIFIED", "INVALID"], slaSeconds: 1800, group: "capture",
  },
  IDENTIFIED: {
    headline: () => "Where is the customer's conversation?",
    primary: ["SET_PRESENCE", "OLD_CHAT_STILL_ACTIVE", "CONTINUE_WITH_OWNER", "FORMAL_TRANSFER"], secondary: ["UPLOAD_SCREENSHOT"],
    requiredFields: ["whatsapp presence"], nextStages: ["UNOWNED", "LOST"], slaSeconds: 600, group: "capture",
  },
  UNOWNED: {
    headline: () => "Can you personally take responsibility for progressing this customer?",
    sub: (l) => `WhatsApp: ${l.waPresence.replace(/_/g, " ")}`,
    primary: ["CLAIM_AND_WORK"], secondary: ["NEED_HELP", "REASSIGN", "NOT_ACTIONABLE"],
    requiredFields: ["owner", "next action", "deadline"], nextStages: ["QUALIFYING", "INVALID"], slaSeconds: 600, group: "capture",
  },
  QUALIFYING: {
    headline: (l) => (l.reconstructionVerified ? "Ask only what is still missing" : "Read what already happened before asking anything"),
    primary: ["ANSWER_QUALIFICATION", "CONFIRM_RECONSTRUCTION", "EDIT_RECONSTRUCTION", "SET_FEASIBILITY"],
    secondary: [...UNIVERSAL, "SET_LABELS", "ANSWER_QUESTION", "MARK_FUTURE"],
    requiredFields: ["area", "move-in", "room type", "budget", "intent"], nextStages: ["MATCHING", "FUTURE", "LOST"], slaSeconds: 900, group: "work",
  },
  MATCHING: {
    headline: (l) => `${l.matches.length} best matches found — which one do we discuss first?`,
    primary: ["SHARE_PROPERTY"], secondary: [...UNIVERSAL, "SET_FEASIBILITY", "REJECT_PROPERTY", "MARK_FUTURE", "CLOSE_AS_LOST"],
    requiredFields: ["feasibility", "matched property"], nextStages: ["PROPERTY_SHARED", "FUTURE", "LOST"], slaSeconds: 900, group: "work",
  },
  PROPERTY_SHARED: {
    headline: () => "Property shared — has the customer engaged?",
    primary: ["CALL", "SCHEDULE_TOUR"], secondary: [...UNIVERSAL, "REJECT_PROPERTY", "ANSWER_QUESTION", "RESOLVE_OBJECTION", "MARK_FUTURE"],
    requiredFields: ["customer response"], nextStages: ["CALL_REQUIRED", "TOUR_READY", "MATCHING", "LOST"], slaSeconds: 900, group: "work",
  },
  CALL_REQUIRED: {
    headline: () => "Call the customer — property shared but no engagement",
    primary: ["CALL"], secondary: [...UNIVERSAL, "MARK_FUTURE", "CLOSE_AS_LOST"],
    requiredFields: ["call outcome"], nextStages: ["TOUR_READY", "NEGOTIATING", "FUTURE", "LOST"], slaSeconds: 900, group: "work",
  },
  TOUR_READY: {
    headline: () => "Customer is ready to visit",
    sub: (l) => l.matches.find((m) => m.id === l.selectedPropertyId)?.name ?? "Select the property first",
    primary: ["SCHEDULE_TOUR"], secondary: [...UNIVERSAL, "REJECT_PROPERTY", "MARK_FUTURE"],
    requiredFields: ["property", "availability", "rent", "deposit", "maintenance", "booking amount", "tour owner"],
    nextStages: ["TOUR_SCHEDULED", "MATCHING", "LOST"], slaSeconds: 900, group: "tour",
  },
  TOUR_SCHEDULED: {
    headline: (l) => `Visit ${l.tour?.at ?? ""} — confirm the property and the customer`,
    primary: ["INFORM_PROPERTY", "PROPERTY_ACK", "PRE_TOUR_CONFIRM", "ACCEPT_HANDOVER"], secondary: [...UNIVERSAL, "CLOSE_AS_LOST"],
    requiredFields: ["property informed", "property acknowledged", "customer confirmation"], nextStages: ["EN_ROUTE", "MATCHING"], slaSeconds: 900, group: "tour",
  },
  EN_ROUTE: {
    headline: (l) => `Customer en route${l.tour?.eta ? ` — ETA ${l.tour.eta}` : ""}`,
    primary: ["MARK_ARRIVED"], secondary: [...UNIVERSAL, "PRE_TOUR_CONFIRM", "TOUR_ISSUE"],
    requiredFields: ["arrival"], nextStages: ["ARRIVED", "TOUR_SCHEDULED"], slaSeconds: 300, group: "tour",
  },
  ARRIVED: {
    headline: () => "Customer arrived — start the tour",
    primary: ["START_TOUR"], secondary: [...UNIVERSAL, "TOUR_ISSUE"],
    requiredFields: ["met representative"], nextStages: ["TOUR_LIVE"], slaSeconds: 300, group: "tour",
  },
  TOUR_LIVE: {
    headline: () => "Tour live",
    primary: ["COMPLETE_TOUR"], secondary: [...UNIVERSAL, "TOUR_ISSUE"],
    requiredFields: ["tour outcome"], nextStages: ["POST_TOUR", "MATCHING"], slaSeconds: 3600, group: "tour",
  },
  POST_TOUR: {
    headline: (l) => `Tour ${l.tour?.reaction?.replace(/_/g, " ").toLowerCase() ?? "completed"} — quotation now`,
    primary: ["SEND_QUOTE"], secondary: [...UNIVERSAL, "RESOLVE_OBJECTION", "REJECT_PROPERTY", "MARK_FUTURE", "CLOSE_AS_LOST"],
    requiredFields: ["tour feedback", "blocker", "quotation"], nextStages: ["QUOTE_SENT", "NEGOTIATING", "MATCHING", "LOST"], slaSeconds: 600, group: "close",
  },
  QUOTE_SENT: {
    headline: (l) => `Quote sent${l.quote?.sentAt ? ` ${Math.round((Date.now() - Date.parse(l.quote.sentAt)) / 60000)} min ago` : ""} — what happened?`,
    primary: ["QUOTE_OUTCOME"], secondary: [...UNIVERSAL, "NEGOTIATE", "MARK_FUTURE", "CLOSE_AS_LOST"],
    requiredFields: ["quote outcome"], nextStages: ["TOKEN_PENDING", "NEGOTIATING", "MATCHING", "LOST"], slaSeconds: 1800, group: "close",
  },
  NEGOTIATING: {
    headline: (l) => `Open blocker: ${l.openObjection ?? l.blocker ?? "objection"}`,
    primary: ["NEGOTIATE", "RESOLVE_OBJECTION", "APPROVE_DISCOUNT"], secondary: [...UNIVERSAL, "SEND_QUOTE", "MARK_FUTURE", "CLOSE_AS_LOST"],
    requiredFields: ["expected price or decision date"], nextStages: ["QUOTE_SENT", "TOKEN_PENDING", "FUTURE", "LOST"], slaSeconds: 900, group: "close",
  },
  TOKEN_PENDING: {
    headline: () => "Quote accepted — ready to reserve the room now?",
    primary: ["CREATE_BOOKING"], secondary: [...UNIVERSAL, "TOKEN_COMING", "FINAL_QUESTION_PENDING", "CLOSE_AS_LOST"],
    requiredFields: ["booking decision", "deadline"], nextStages: ["BOOKING_CREATED", "NEGOTIATING", "LOST"], slaSeconds: 900, group: "booking",
  },
  BOOKING_CREATED: {
    headline: (l) => `Booking ${l.booking?.id} created — send it for property approval`,
    primary: ["SEND_FOR_APPROVAL"], secondary: [...UNIVERSAL, "ADD_NOTE"],
    requiredFields: ["property approval"], nextStages: ["APPROVAL_PENDING"], slaSeconds: 900, group: "booking",
  },
  APPROVAL_PENDING: {
    headline: () => "Waiting on the property: inventory and commercials",
    primary: ["PROPERTY_APPROVAL"], secondary: [...UNIVERSAL, "CUSTOMER_APPROVES_CHANGE", "ADD_NOTE"],
    requiredFields: ["inventory approval", "commercial approval"], nextStages: ["ROOM_HELD", "MATCHING", "LOST"], slaSeconds: 1800, group: "booking",
  },
  ROOM_HELD: {
    headline: (l) => `Room ${l.booking?.room} held${l.booking?.roomHeldUntil ? ` until ${new Date(l.booking.roomHeldUntil).toLocaleTimeString()}` : ""}`,
    primary: ["LOG_PAYMENT"], secondary: [...UNIVERSAL, "LOCK_ROOM", "CLOSE_AS_LOST"],
    requiredFields: ["booking amount"], nextStages: ["PAYMENT_PENDING", "RESERVED", "LOST"], slaSeconds: 1800, group: "booking",
  },
  PAYMENT_PENDING: {
    headline: (l) => {
      const rec = l.payments.filter((p) => p.verified).reduce((s, p) => s + p.amount, 0);
      const req = l.booking?.bookingAmount ?? 0;
      return `₹${rec.toLocaleString("en-IN")} of ₹${req.toLocaleString("en-IN")} received${rec < req ? ` · ₹${(req - rec).toLocaleString("en-IN")} pending` : ""}`;
    },
    primary: ["LOG_PAYMENT", "VERIFY_PAYMENT", "CONFIRM_RESERVATION"], secondary: [...UNIVERSAL, "CLOSE_AS_LOST"],
    requiredFields: ["verified booking amount"], nextStages: ["RESERVED", "LOST"], slaSeconds: 1800, group: "booking",
  },
  RESERVED: {
    headline: () => "Reserved — lock the room with the property and confirm to the customer",
    primary: ["FINAL_ROOM_LOCK", "SEND_CUSTOMER_CONFIRMATION"], secondary: [...UNIVERSAL, "LOG_PAYMENT"],
    requiredFields: ["final room lock", "customer confirmation"], nextStages: ["CHECKIN_READY"], slaSeconds: 1800, group: "checkin",
  },
  CHECKIN_READY: {
    headline: (l) => (l.checkin?.roomReady ? "Check-in ready" : "Check-in readiness — room must be ready before the customer arrives"),
    primary: ["CHECKIN_CHECKLIST", "CHECKIN_DAY", "HANDOVER_ROOM", "MARK_CHECKED_IN"], secondary: [...UNIVERSAL, "ADD_NOTE"],
    requiredFields: ["room ready", "keys", "balance"], nextStages: ["CHECKED_IN"], slaSeconds: 3600, group: "checkin",
  },
  CHECKED_IN: {
    headline: () => "Checked in — active stay",
    primary: ["SETTLE"], secondary: ["ADD_NOTE"],
    requiredFields: [], nextStages: ["SETTLED"], slaSeconds: 0, group: "closed",
  },
  SETTLED: {
    headline: () => "Settled — historical ledger",
    primary: [], secondary: ["ADD_NOTE"], requiredFields: [], nextStages: [], slaSeconds: 0, group: "closed",
  },
  FUTURE: {
    headline: (l) => `Future lead — follow up ${l.followUpAt ?? "date required"}`,
    primary: ["REVIVE_FUTURE"], secondary: [...UNIVERSAL, "MARK_FUTURE", "CLOSE_AS_LOST"],
    requiredFields: ["move-in", "decision date", "follow-up date", "reason"], nextStages: ["QUALIFYING", "LOST"], slaSeconds: 0, group: "closed",
  },
  LOST: {
    headline: (l) => `Lost — ${l.lostReason ?? "reason required"}`,
    primary: [], secondary: ["ADD_NOTE", "REVIVE_FUTURE"], requiredFields: ["lost reason"], nextStages: ["QUALIFYING"], slaSeconds: 0, group: "closed",
  },
  INVALID: {
    headline: (l) => `Invalid — ${l.lostReason ?? "reason required"}`,
    primary: [], secondary: ["ADD_NOTE"], requiredFields: ["reason"], nextStages: [], slaSeconds: 0, group: "closed",
  },
};

export const MORE_ACTIONS = ["FORMAL_TRANSFER", "NEED_HELP", "MARK_FUTURE", "CLOSE_AS_LOST", "MERGE_DUPLICATE", "ADD_NOTE", "UPLOAD_SCREENSHOT", "SET_LABELS"];

export const STAGE_ORDER: Stage[] = [
  "CAPTURED", "IDENTITY_RESOLUTION", "DUPLICATE_REVIEW", "IDENTIFIED", "UNOWNED", "QUALIFYING", "MATCHING",
  "PROPERTY_SHARED", "CALL_REQUIRED", "TOUR_READY", "TOUR_SCHEDULED", "EN_ROUTE", "ARRIVED", "TOUR_LIVE",
  "POST_TOUR", "NEGOTIATING", "QUOTE_SENT", "TOKEN_PENDING", "BOOKING_CREATED", "APPROVAL_PENDING",
  "ROOM_HELD", "PAYMENT_PENDING", "RESERVED", "CHECKIN_READY", "CHECKED_IN", "SETTLED", "FUTURE", "LOST", "INVALID",
];
