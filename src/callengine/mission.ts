// The mission is the operator's script before and during the call.
// It is derived from the customer's state + whatever has already been captured on this call,
// so it keeps updating while the operator works.
import type { MovementState } from "@/movement/types";
import type { AgendaKey, CallCapture } from "./types";
import { agendaDef } from "./types";
import { missingFields, primaryCta, qualificationComplete, type MissingField } from "./infer";

export type ScenarioKey =
  | "S1-in-bangalore"
  | "S2-arriving-soon"
  | "S3-later-move-in"
  | "S4-requirement-unclear"
  | "S5-decision-pending"
  | "S6-gone-cold";

export interface MissionNeed {
  field: MissingField | string;
  label: string;
  done: boolean;
}

export interface CallMission {
  scenario: ScenarioKey;
  headline: string;
  situation: string;
  /** what this call has to achieve, in one line */
  objective: string;
  openWith: string;
  dos: string[];
  donts: string[];
  ctaKey: "visit" | "video-tour" | "future";
  ctaLabel: string;
  ctaHow: string;
  needs: MissionNeed[];
  /** 0–100, how complete the mission is right now */
  progress: number;
}

const FIELD_LABEL: Record<MissingField, string> = {
  area: "Area",
  moveIn: "Move-in date",
  budget: "Budget",
  office: "Office / College",
  roomType: "Room type",
  inBangalore: "In Bangalore now?",
  forWhom: "For whom",
};

const days = (iso?: string | null) => (iso ? (new Date(iso).getTime() - Date.now()) / 86400000 : null);

/** Apply anything captured on this call over the stored state, so the mission updates live. */
function merged(lead: MovementState, cap?: CallCapture): MovementState {
  if (!cap) return lead;
  const q = { ...(lead.q ?? {}) } as NonNullable<MovementState["q"]>;
  if (cap.moveIn) q.moveInDate = cap.moveIn;
  if (cap.area) q.location = cap.area;
  if (cap.officeOrCollege) q.officeOrCollege = cap.officeOrCollege;
  if (cap.budget) q.budget = cap.budget;
  if (cap.roomType) q.roomType = cap.roomType;
  if (cap.inBangalore !== null && cap.inBangalore !== undefined) q.inBangalore = cap.inBangalore;
  if (cap.forWhom) q.forSelf = cap.forWhom === "Self";
  return { ...lead, q };
}

const CTA_LABEL = {
  visit: "Schedule a visit",
  "video-tour": "Video tour, then pre-book",
  future: "Park it as a future follow-up",
} as const;

export function callMission(lead: MovementState, agenda: AgendaKey, cap?: CallCapture): CallMission {
  const live = merged(lead, cap);
  const def = agendaDef(agenda);
  const cta = primaryCta(live, cap);
  const miss = missingFields(live);
  const complete = qualificationComplete(live);
  const moveInDays = days(live.q?.moveInDate ?? live.checkInDate);
  const inBlr = live.q?.inBangalore ?? null;

  // Needs: the requirement gaps first, then whatever this agenda must bring back.
  const needs: MissionNeed[] = [
    ...(["moveIn", "area", "budget", "roomType", "inBangalore"] as MissingField[]).map((f) => ({
      field: f,
      label: FIELD_LABEL[f],
      done: !miss.includes(f),
    })),
    ...def.needs
      .filter((n) => !["Move-in", "Area", "Budget", "Room", "Bangalore status"].includes(n))
      .map((n) => ({ field: n, label: n, options: undefined, done: false }) as MissionNeed),
  ];
  const progress = Math.round((needs.filter((n) => n.done).length / Math.max(1, needs.length)) * 100);

  const name = live.name ?? "there";
  const area = live.q?.location ?? "your area";

  let scenario: ScenarioKey;
  let headline: string;
  let situation: string;
  let openWith: string;
  let dos: string[];
  let donts: string[];
  let ctaHow: string;

  if (moveInDays !== null && moveInDays < -10) {
    scenario = "S6-gone-cold";
    headline = "Gone cold — reactivate before anything else";
    situation = `The move-in date passed ${Math.abs(Math.round(moveInDays))} days ago. They may already have a stay.`;
    openWith = `Hi ${name}, are you still looking, or have you already found a place?`;
    dos = [
      "First question decides everything: still looking, already found, or need it later.",
      "If already found — close the lead cleanly and ask when they might need it next.",
      "If still looking — ask what went wrong last time before offering anything.",
    ];
    donts = ["Do not pitch a property in the first minute.", "Do not re-read the old requirement back at them — it has probably changed."];
    ctaHow = "Only after they say 'still looking' do you move to a visit or a video tour.";
  } else if (!complete) {
    scenario = "S4-requirement-unclear";
    headline = "Requirement is incomplete — this call is for understanding, not selling";
    situation = `Missing: ${miss.map((f) => FIELD_LABEL[f]).join(", ")}.`;
    openWith = `Hi ${name}, I just need two quick things so I only send you stays that actually fit.`;
    dos = [
      "Ask the missing fields in this order and tick each one as they answer.",
      "Confirm what is already on screen instead of asking again — tick to verify.",
      "End with one clear next step, even if nothing else moved.",
    ];
    donts = [
      "Do not ask anything the screen already shows.",
      "Do not quote a price before the budget and area are confirmed.",
      "Do not end the call without a date they can be contacted on.",
    ];
    ctaHow = "Once the requirement is complete, offer the CTA below in the same call.";
  } else if (inBlr === true) {
    scenario = "S1-in-bangalore";
    headline = "They are in Bangalore — get a visit on the calendar";
    situation = `Requirement is complete and they are in the city. A visit today or tomorrow is realistic.`;
    openWith = `Hi ${name}, I have options ready in ${area}. Can you see one today or tomorrow?`;
    dos = [
      "Offer two specific slots, never an open 'when are you free'.",
      "Confirm the property name and the exact address on the call.",
      "Say who will meet them at the property.",
    ];
    donts = ["Do not send more options before the visit is fixed.", "Do not leave the slot vague."];
    ctaHow = "Fix a date and time now and schedule it on this screen — it arms the confirmation follow-up.";
  } else if (moveInDays !== null && moveInDays <= 7) {
    scenario = "S2-arriving-soon";
    headline = "Arriving within a week — video tour, then hold the room";
    situation = `Move-in is in ${Math.max(0, Math.round(moveInDays))} days and they are not in Bangalore yet.`;
    openWith = `Hi ${name}, since you arrive soon, I can show you the place on a video call and hold the room for you.`;
    dos = [
      "Offer the video tour as the substitute for a physical visit.",
      "Explain the pre-book: the room is held, and it is adjustable.",
      "Fix the exact arrival date and who is travelling with them.",
    ];
    donts = ["Do not ask them to visit — they are not in the city.", "Do not push payment before the video tour."];
    ctaHow = "Book the video tour slot, then explain pre-booking in the same breath.";
  } else if (live.stage === "matched" || live.stage === "quotation" || live.tourDoneAt) {
    scenario = "S5-decision-pending";
    headline = "Options already shared — this call is for the decision";
    situation = `They have seen options. The job is to find the real objection and close it.`;
    openWith = `Hi ${name}, did you get a chance to look at what I sent? What did you think?`;
    dos = [
      "Ask for the reaction before you defend the price.",
      "Write down the exact objection in their words.",
      "Offer one alternative only if the objection is about the property, not the price.",
    ];
    donts = ["Do not repeat the pitch they already heard.", "Do not discount before you know the real blocker."];
    ctaHow = "Convert the reaction into a visit, a video tour or a dated follow-up — never 'I'll check back'.";
  } else {
    scenario = "S3-later-move-in";
    headline = "Move-in is far out — keep it warm, do not burn it";
    situation = moveInDays !== null ? `Move-in is roughly ${Math.round(moveInDays)} days away.` : "No near-term move-in date.";
    openWith = `Hi ${name}, keeping your requirement ready for ${area} — shall I check back closer to your date?`;
    dos = [
      "Confirm the date they actually want to be contacted on.",
      "Send one or two options so they remember us, nothing more.",
      "Set the follow-up before ending the call.",
    ];
    donts = ["Do not chase a visit for a distant date.", "Do not call them again before the agreed date."];
    ctaHow = "Agree a date, set the follow-up, and stop there.";
  }

  return {
    scenario,
    headline,
    situation,
    objective: def.objective,
    openWith,
    dos,
    donts,
    ctaKey: cta,
    ctaLabel: CTA_LABEL[cta],
    ctaHow,
    needs,
    progress,
  };
}
