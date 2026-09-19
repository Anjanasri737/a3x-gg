// Every call produces three outputs: the message to send now, the conditional follow-up,
// and the next step with an SLA. The operator only edits — never writes from scratch.
import type { MovementState, NextActionKind } from "@/movement/types";
import { primaryCta } from "./infer";
import type {
  AgendaKey, CallCapture, CallOutputs, FollowUpPlan, MovementClass, NextStepPlan, OutcomeKind,
} from "./types";

const inHours = (h: number) => new Date(Date.now() + h * 3600000).toISOString();
const money = (n?: number | null) => (n ? `₹${Number(n).toLocaleString("en-IN")}` : null);

function facts(lead: MovementState, c: CallCapture) {
  const q = lead.q ?? {};
  return {
    name: lead.name ?? "there",
    area: c.area ?? q.location ?? "your area",
    office: c.officeOrCollege ?? q.officeOrCollege ?? "",
    budget: money(c.budget ?? q.budget) ?? "your budget",
    room: c.roomType ?? q.roomType ?? "the room type you wanted",
    moveIn: c.moveIn ?? q.moveInDate ?? lead.checkInDate ?? "",
    property: c.propertyName ?? c.price?.propertyName ?? lead.tourProperty ?? "the property",
  };
}

const dateText = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "";
const timeText = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "";

/** Did this call actually change the customer's state? */
export function classifyMovement(c: CallCapture, outcome: OutcomeKind): MovementClass {
  if (outcome !== "connected") return c.promises.length || c.mediaCount ? "data" : "none";
  if (c.activities.some((a) => ["Booking discussed", "Pre-book discussed", "Quotation explained"].includes(a))) return "booking";
  if (c.tourAt || c.activities.includes("Tour scheduled")) return "tour";
  if (c.price || c.activities.some((a) => ["Price quoted", "Discount quoted", "Negotiation happened", "Deposit discussed"].includes(a)))
    return "commercial";
  if (c.reaction || c.seen || c.activities.some((a) => a.startsWith("Property") || a.includes("explained"))) return "property";
  if (c.moveIn || c.area || c.budget || c.roomType || c.inBangalore !== undefined || c.officeOrCollege) return "data";
  return "none";
}

/** Calls that only re-collected what the CRM already had. */
export function wasteFlags(lead: MovementState, c: CallCapture, movement: MovementClass): string[] {
  const out: string[] = [];
  if (movement === "none") out.push("Call with no data or action");
  const q = lead.q ?? {};
  if (c.area && q.location && c.area === q.location) out.push("Question repeated despite CRM having the answer");
  if (c.budget && q.budget && Number(c.budget) === Number(q.budget)) out.push("Repeat data collection");
  return out;
}

function connectedMessage(lead: MovementState, agenda: AgendaKey, c: CallCapture): string {
  const f = facts(lead, c);
  const cta = primaryCta(lead, c);
  const ctaLine =
    cta === "visit"
      ? "You're in Bangalore, so once you check these I can fix a visit for the one you like most."
      : cta === "video-tour"
        ? "Since you're reaching Bangalore shortly, I can take you through a video tour and hold the room for you."
        : "I'll keep the best-fit options ready for you and reconnect closer to your move-in.";

  switch (agenda) {
    case "qualification":
      return [
        `Hi ${f.name}, great speaking with you.`,
        "",
        "As discussed, you're looking for:",
        `📍 ${f.area}`,
        `🏠 ${f.room}`,
        `💰 Around ${f.budget}`,
        f.moveIn ? `📅 Move-in: ${dateText(f.moveIn)}` : "",
        f.office ? `🏢 Near ${f.office}` : "",
        "",
        "I'm checking the best matching available options for you and will share them here.",
      ].filter(Boolean).join("\n");

    case "property-intro":
      return [
        `Hi ${f.name}, as discussed, this is the ${f.room} option at ${f.property}, ${f.area}.`,
        "",
        c.price?.quoted ? `• Rent: ${money(c.price.quoted)}` : "",
        "• Food and housekeeping included",
        f.office ? `• Close to ${f.office}` : "",
        f.moveIn ? `• Move-in availability: ${dateText(f.moveIn)}` : "",
        "",
        "I'm sharing the property photos and videos here as well. Have a look once and tell me whether this works for you.",
      ].filter(Boolean).join("\n");

    case "property-feedback":
      if (c.reaction === "loved" || c.reaction === "liked-comparing")
        return [
          `Hi ${f.name}, glad you liked ${f.property}.`,
          "",
          `As discussed, the next step is to ${cta === "visit" ? "visit the property" : cta === "video-tour" ? "take the video tour" : "lock the final pricing"}.`,
          "I'll help you take this forward from here.",
        ].join("\n");
      return [
        `Hi ${f.name}, understood.`,
        "",
        `The previous option wasn't right because of ${c.dislikeReason ?? "the fit"}.`,
        `I'll now filter options that are better for ${f.area} around ${f.budget}.`,
        "",
        "Sharing a more relevant option next.",
      ].join("\n");

    case "price":
      return [
        `Hi ${f.name}, as discussed for ${c.price?.propertyName ?? f.property}:`,
        "",
        `Room Type: ${c.price?.roomType ?? f.room}`,
        `Rent: ${money(c.price?.quoted) ?? f.budget}`,
        c.price?.deposit ? `Deposit: ${money(c.price.deposit)}` : "",
        c.price?.maintenance ? `Maintenance: ${money(c.price.maintenance)}` : "",
        f.moveIn ? `Move-in: ${dateText(f.moveIn)}` : "",
        "",
        c.price?.validity ? `This offer and availability are valid until ${c.price.validity}.` : "",
        "If this works for you, I can help you with the next step.",
      ].filter(Boolean).join("\n");

    case "tour-schedule":
    case "tour-confirm":
      return [
        `Hi ${f.name}, as discussed, your visit is confirmed.`,
        "",
        `📍 ${f.property}`,
        c.tourAt ? `📅 ${dateText(c.tourAt)}` : "",
        c.tourAt ? `⏰ ${new Date(c.tourAt).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}` : "",
        `🏠 ${f.room}`,
        "",
        "I'll share the exact location and property details here. Please message me if your timing changes.",
      ].filter(Boolean).join("\n");

    case "post-tour":
      return [
        `Hi ${f.name}, great speaking with you after the visit.`,
        "",
        `As discussed, you liked ${f.property} and we're checking the final availability for ${f.room}.`,
        "I'll share the final booking details here so you can take the next step.",
      ].join("\n");

    case "closing":
      return [
        `Hi ${f.name}, here are the final details for ${f.property}:`,
        "",
        `Room: ${f.room}`,
        c.price?.listed ? `Actual rent: ${money(c.price.listed)}` : "",
        `Your price: ${money(c.price?.quoted) ?? f.budget}`,
        c.price?.deposit ? `Deposit: ${money(c.price.deposit)}` : "",
        c.price?.maintenance ? `Maintenance: ${money(c.price.maintenance)}` : "",
        c.price?.validity ? `Valid till: ${c.price.validity}` : "",
        "",
        "Confirm here and I'll block the room for you right away.",
      ].filter(Boolean).join("\n");

    case "objection":
      return [
        `Hi ${f.name}, thanks for being clear about ${c.dislikeReason ?? "what's holding this up"}.`,
        "",
        "Here's what I can do about it, and I'm sharing the option that fixes exactly that.",
      ].join("\n");

    case "alternative":
      return [
        `Hi ${f.name}, understood — that option wasn't right because of ${c.dislikeReason ?? "the fit"}.`,
        "",
        `I'm filtering stays around ${f.area} within ${f.budget} and sharing the strongest match next.`,
      ].join("\n");

    case "future":
      return [
        `Hi ${f.name}, noted — I'll reconnect closer to your move-in${f.moveIn ? ` around ${dateText(f.moveIn)}` : ""}.`,
        "",
        "Meanwhile I'll keep the best-fit stays in your area reserved on my list.",
      ].join("\n");

    case "check-in":
      return [
        `Hi ${f.name}, your move-in to ${f.property} is on track.`,
        "",
        f.moveIn ? `📅 Move-in: ${dateText(f.moveIn)}` : "",
        "Please carry your ID proof. I'll share the warden's contact and the exact entry details here.",
      ].filter(Boolean).join("\n");

    default:
      return [
        `Hi ${f.name}, great speaking with you.`,
        "",
        `I'm sharing the best matching options in ${f.area} around ${f.budget} here.`,
        "",
        ctaLine,
      ].join("\n");
  }
}

function followUpFor(
  lead: MovementState,
  agenda: AgendaKey,
  c: CallCapture,
  outcome: OutcomeKind,
  noAnswerNext?: string,
): FollowUpPlan {
  const f = facts(lead, c);
  // Unanswered calls only ever use the approved message list — never a composed line.
  if (outcome !== "connected")
    return {
      text: noAnswerNext ?? "",
      dueAt: inHours(3),
      trigger: "Only if the customer has not replied",
    };

  const map: Partial<Record<AgendaKey, FollowUpPlan>> = {
    qualification: {
      text: `Hi ${f.name}, were you able to check the options I shared? Which one feels closer to what you're looking for? If neither works, tell me what you'd like changed and I'll find a better match.`,
      dueAt: inHours(4), trigger: "Only if no reply to the shared options",
    },
    "property-intro": {
      text: `Hi ${f.name}, did you get a chance to check ${f.property}?\n\n1. You like it\n2. You want something more affordable\n3. You want a different location or property\n\nJust reply with 1, 2 or 3.`,
      dueAt: inHours(4), trigger: "Only if no reaction received",
    },
    "property-feedback": {
      text: `Hi ${f.name}, should I help you take the next step for ${f.property}? We can either arrange the visit or go through the final availability and pricing.`,
      dueAt: inHours(5), trigger: "Only if no decision received",
    },
    price: {
      text: `Hi ${f.name}, just checking regarding the ${money(c.price?.quoted) ?? "price"} option we discussed. Is the pricing working for you, or should I check something closer to your budget?`,
      dueAt: inHours(5), trigger: "Only if price is not accepted yet",
    },
    "tour-schedule": {
      text: `Hi ${f.name}, your visit to ${f.property} is scheduled for ${timeText(c.tourAt)}. Are you on track for the visit?\n\nReply: Yes / Running late / Need to reschedule`,
      dueAt: c.tourAt ? new Date(new Date(c.tourAt).getTime() - 2 * 3600000).toISOString() : inHours(6),
      trigger: "Only if the tour is not confirmed",
    },
    "post-tour": {
      text: `Hi ${f.name}, regarding the property you visited, would you like me to reserve the available room for you? If anything is stopping you from deciding, tell me and I'll help resolve it.`,
      dueAt: inHours(6), trigger: "Only if no booking decision",
    },
    closing: {
      text: `Hi ${f.name}, just checking on the room we discussed at ${f.property}. The current room and price are held only till ${c.price?.validity ?? "tonight"}. If you want to proceed, I can complete the booking while it's still available.`,
      dueAt: inHours(4), trigger: "Only if payment is not received",
    },
  } as Partial<Record<AgendaKey, FollowUpPlan>>;

  return (
    map[agenda] ?? {
      text: `Hi ${f.name}, any update from your side on the ${f.area} stay? I'll keep the best option held for you till then.`,
      dueAt: inHours(6),
      trigger: "Only if the customer has not moved forward",
    }
  );
}

function nextStepFor(lead: MovementState, agenda: AgendaKey, c: CallCapture, outcome: OutcomeKind): NextStepPlan {
  const cta = primaryCta(lead, c);
  const step = (kind: NextActionKind, label: string, h: number): NextStepPlan => ({ kind, label, dueAt: inHours(h) });

  if (outcome === "not-relevant") return step("recheck-later", "Close — not relevant", 720);
  if (outcome === "call-later") return step("call", "Call back at the agreed time", 3);
  if (outcome === "no-answer") return step("call", "Retry call after the WhatsApp attempt", 3);

  switch (agenda) {
    case "qualification": return step("send-property", "Find and send matching properties", 1);
    case "property-intro": return step("call", "Property feedback call", 4);
    case "property-feedback":
      if (c.reaction === "loved" || c.reaction === "liked-comparing")
        return cta === "visit" ? step("confirm-tour", "Schedule the tour", 3) : step("send-quote", "Share pricing and hold the room", 3);
      return step("send-property", "Send an alternative property", 2);
    case "price":
      if (c.priceReaction === "accepted" || c.priceReaction === "reasonable")
        return cta === "visit" ? step("confirm-tour", "Schedule the tour", 3) : step("collect-payment", "Pre-book the room", 4);
      if (c.priceReaction === "too-expensive") return step("send-property", "Send a more affordable option", 2);
      return step("call", "Price decision follow-up call", 5);
    case "tour-schedule": return step("confirm-tour", "Confirm attendance before the visit", 4);
    case "tour-confirm": return step("post-tour-call", "Post-tour feedback call", 8);
    case "post-tour": return step("send-quote", "Send the quotation", 2);
    case "closing": return step("collect-payment", "Collect the booking amount", 4);
    case "objection": return step("call", "Resolution follow-up", 5);
    case "alternative": return step("send-property", "Send the alternative option", 1);
    case "future": return step("recheck-later", "Reconnect near the move-in date", 168);
    case "check-in": return step("recheck-later", "Confirm the move-in happened", 24);
    default: return step("call", "Follow-up call", 6);
  }
}

export function buildOutputs(
  lead: MovementState,
  agenda: AgendaKey,
  capture: CallCapture,
  outcome: OutcomeKind,
  noAnswerAsk?: string,
  noAnswerNext?: string,
): CallOutputs {
  const movement = classifyMovement(capture, outcome);
  // Unanswered call → send the approved message for this condition, exactly as written.
  const now = outcome === "connected" ? connectedMessage(lead, agenda, capture) : (noAnswerAsk ?? "");

  return {
    now,
    followUp: followUpFor(lead, agenda, capture, outcome, noAnswerNext),
    nextStep: nextStepFor(lead, agenda, capture, outcome),
    movement,
    mediaHint:
      capture.mediaCount && capture.mediaCount > 0
        ? `${capture.mediaCount} matching property media selected`
        : outcome === "connected" && agenda === "qualification"
          ? "Attach 3 matching property photos before sending"
          : outcome !== "connected"
            ? "Send matching media first, then the message"
            : null,
  };
}
