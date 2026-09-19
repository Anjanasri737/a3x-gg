// What are we calling for? The lead state answers it — the operator only corrects it.
import type { MovementState } from "@/movement/types";
import type { AgendaKey, CallCapture } from "./types";

const hrs = (iso?: string | null) => (iso ? (Date.now() - new Date(iso).getTime()) / 3600000 : Infinity);
const days = (iso?: string | null) => hrs(iso) / 24;

export interface KnownFact {
  label: string;
  value: string;
  known: boolean;
}

const prettyDate = (iso?: string | null) => {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
};

/** Everything the CRM already knows — the operator must never ask these again. */
export function knownFacts(lead: MovementState): KnownFact[] {
  const q = lead.q ?? {};
  const fact = (label: string, value?: string | number | null | boolean) => ({
    label,
    value: value === null || value === undefined || value === "" ? "—" : String(value),
    known: value !== null && value !== undefined && value !== "",
  });
  return [
    fact("Name", lead.name),
    fact("Move-in", prettyDate(q.moveInDate ?? lead.checkInDate)),
    fact("Area", q.location),
    fact("Office / College", q.officeOrCollege),
    fact("Budget", q.budget ? `₹${Number(q.budget).toLocaleString("en-IN")}` : null),
    fact("Room", q.roomType),
    fact("In Bangalore", q.inBangalore === null || q.inBangalore === undefined ? null : q.inBangalore ? "Yes" : "No"),
    fact("For whom", q.forSelf === null || q.forSelf === undefined ? null : q.forSelf ? "Self" : "Someone else"),
    fact("Lead age", `${Math.max(0, Math.round(days(lead.createdAt)))} days`),
    fact("Last customer reply", lead.lastCustomerMsgAt ? new Date(lead.lastCustomerMsgAt).toLocaleString() : null),
  ];
}

export type MissingField = "area" | "moveIn" | "inBangalore" | "forWhom" | "budget" | "roomType" | "office";

/** Progressive profiling order — ask only the next missing thing. */
export const PROFILE_ORDER: MissingField[] = ["area", "moveIn", "budget", "office", "roomType", "inBangalore", "forWhom"];

export function missingFields(lead: MovementState): MissingField[] {
  const q = lead.q ?? {};
  const miss: MissingField[] = [];
  if (!q.location) miss.push("area");
  if (!q.moveInDate && !lead.checkInDate) miss.push("moveIn");
  if (!q.budget) miss.push("budget");
  if (!q.officeOrCollege) miss.push("office");
  if (!q.roomType) miss.push("roomType");
  if (q.inBangalore === null || q.inBangalore === undefined) miss.push("inBangalore");
  if (q.forSelf === null || q.forSelf === undefined) miss.push("forWhom");
  return PROFILE_ORDER.filter((f) => miss.includes(f));
}

export const qualificationComplete = (lead: MovementState) =>
  missingFields(lead).filter((f) => f !== "forWhom" && f !== "office").length === 0;

export interface AgendaSuggestion {
  agenda: AgendaKey;
  why: string;
}

/** CRM proposes the agenda; the operator can override it. */
export function suggestAgenda(lead: MovementState): AgendaSuggestion {
  if (lead.stage === "booked" || lead.stage === "check-in") return { agenda: "check-in", why: "Booked — move-in has to be coordinated" };
  if (lead.prebook?.paymentIntent || lead.stage === "payment" || lead.stage === "negotiation")
    return { agenda: "closing", why: "Payment intent is live" };
  if (lead.tourDoneAt && hrs(lead.tourDoneAt) < 48) return { agenda: "post-tour", why: "Visit completed — decision pending" };
  if (lead.tourAt && !lead.tourConfirmed) return { agenda: "tour-confirm", why: "Tour is booked but not confirmed" };
  if (lead.blocker && lead.blocker !== "none") return { agenda: "objection", why: `Blocker: ${lead.blocker}` };
  if (lead.q?.priceIntent === "no") return { agenda: "alternative", why: "Price rejected — needs another option" };
  if (lead.stage === "quotation") return { agenda: "closing", why: "Quotation is out" };
  if (!qualificationComplete(lead)) return { agenda: "qualification", why: "Requirement is incomplete" };
  if (lead.stage === "matched" && lead.lastOutboundAt && hrs(lead.lastOutboundAt) < 24)
    return { agenda: "property-feedback", why: "Property was shared — reaction unknown" };
  if (lead.stage === "matched") return { agenda: "property-intro", why: "Property shortlisted, not discussed" };
  if (lead.q?.priceIntent === "ok" && !lead.tourAt) return { agenda: "tour-schedule", why: "Price is fine — visit missing" };
  if (days(lead.createdAt) > 15) return { agenda: "future", why: "Old lead — reactivate first" };
  if (lead.stage === "qualified") return { agenda: "property-intro", why: "Qualified — show a property" };
  return { agenda: "follow-up", why: "Waiting for a decision" };
}

/** The visit rule: check-in date + Bangalore status decide the CTA. */
export function primaryCta(lead: MovementState, capture?: CallCapture): "visit" | "video-tour" | "future" {
  const inBlr = capture?.inBangalore ?? lead.q?.inBangalore ?? null;
  if (inBlr) return "visit";
  const moveIn = capture?.moveIn ?? lead.q?.moveInDate ?? lead.checkInDate ?? null;
  if (!moveIn) return "future";
  const inDays = (new Date(moveIn).getTime() - Date.now()) / 86400000;
  return inDays <= 7 ? "video-tour" : "future";
}

export type NoAnswerCondition = "C1" | "C2" | "C2.1" | "C3" | "C3.1";

export interface NoAnswerPlan {
  condition: NoAnswerCondition;
  title: string;
  ask: string;
  options: string[];
  /** which missing field this attempt is chasing */
  chasing: MissingField | null;
  attempt: number;
}

/** One button — the system decides which message the silence deserves. */
export function noAnswerPlan(lead: MovementState, attempt: number): NoAnswerPlan {
  const moveIn = lead.q?.moveInDate ?? lead.checkInDate ?? null;
  const overdue = moveIn ? (Date.now() - new Date(moveIn).getTime()) / 86400000 : 0;
  const miss = missingFields(lead);
  const complete = qualificationComplete(lead);
  const area = lead.q?.location ?? "your area";

  if (complete && overdue > 15)
    return {
      condition: "C3", attempt, chasing: null,
      title: "Old lead — move-in passed 15+ days ago",
      ask: `Hi ${lead.name ?? "there"}, are you still looking for the right accommodation, or have you already found a stay?`,
      options: ["Still Looking", "Already Found", "Need Later"],
    };

  if (complete && overdue >= 10)
    return {
      condition: "C3.1", attempt, chasing: null,
      title: "Move-in date was 10–15 days ago",
      ask: `Hey ${lead.name ?? "there"}, just checking in. Did you find your stay, or are you still looking?`,
      options: ["Still Looking", "Already Found", "Need Something Better"],
    };

  if (complete) {
    if (attempt <= 1)
      return {
        condition: "C1", attempt, chasing: null,
        title: "Everything known — no reply yet",
        ask: `Hey ${lead.name ?? "there"}, are you currently in Bangalore?`,
        options: ["Yes", "No", "No Reply"],
      };
    if (attempt === 2)
      return {
        condition: "C1", attempt, chasing: null,
        title: "Attempt 2 — change the hook",
        ask: `Are you looking for something different or more affordable? We have multiple options across ${area}.`,
        options: ["Different Room", "More Affordable", "Different Location", "Current Option Is Fine"],
      };
    return {
      condition: "C1", attempt, chasing: null,
      title: "Attempt 3 — help / objection discovery",
      ask: "Do you need any more information or have any questions about the options I shared? We're here to help.",
      options: ["Have a question", "All clear", "Not looking now"],
    };
  }

  const next = miss[0] ?? "area";
  const partial = miss.length < 3;
  const asks: Record<MissingField, { ask: string; options: string[] }> = {
    area: { ask: "Which location are you looking for? You can also share your office or college name and I'll find the closest options.", options: ["Share location", "Share office", "Share college"] },
    moveIn: { ask: "When are you planning to move to Bangalore?", options: ["Already Here", "This Week", "Next Week", "This Month", "Later"] },
    budget: { ask: "What monthly budget works for you? I'll filter only the stays inside it.", options: ["<10K", "10–15K", "15–20K", "20–25K", "25K+"] },
    office: { ask: "Which office or college should the stay be close to?", options: ["Share office", "Share college"] },
    roomType: { ask: "Do you prefer a private room or sharing?", options: ["Private", "2 Sharing", "3 Sharing", "Flexible"] },
    inBangalore: { ask: "Are you currently in Bangalore?", options: ["Yes", "No"] },
    forWhom: { ask: "Is the accommodation for you or someone else?", options: ["For Me", "Friend", "Family Member"] },
  };

  return {
    condition: partial ? "C2.1" : "C2",
    attempt,
    chasing: next,
    title: partial ? "Partial information — ask only the next field" : "Not enough information yet",
    ask: asks[next].ask,
    options: asks[next].options,
  };
}
