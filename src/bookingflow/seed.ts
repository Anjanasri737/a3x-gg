// Deterministic demo universe: one WhatsApp account, 8 handlers, a week of chats,
// and leads sitting at every point of the journey — fresh chats, tours, bookings
// awaiting property approval, payments pending, and customers already checked in.
import type { CapturedRow, FlowLead } from "./types";
import { JOURNEY, isStepDone } from "./journey";
import { HANDLERS } from "./types";

const FIRST = ["Rahul", "Tanvi", "Aditya", "Sneha", "Karan", "Priya", "Rohit", "Meera", "Arjun", "Isha", "Nikhil", "Divya", "Sahil", "Anjali", "Vikram", "Pooja", "Manish", "Ritika", "Suresh", "Neha"];
const LAST = ["Sharma", "Shetty", "Patil", "Verma", "Nair", "Joshi", "Gupta", "Rao", "Singh", "Mehta", "Kulkarni", "Das"];
const AREAS = ["Kharadi", "Hinjewadi", "Baner", "Wakad", "Viman Nagar", "Kothrud", "Magarpatta", "Hadapsar"];
const MSGS = [
  "Bhai room available hai?",
  "Kitna rent hoga single room ka?",
  "Can I visit tomorrow evening?",
  "Photos bhej do please",
  "Deposit kitna lagega?",
  "I need it from 1st next month",
  "Is food included?",
  "Any place near my office?",
  "Parents ko poochh ke batata hu",
  "Thoda discount ho sakta hai?",
  "Girls ke liye hai?",
  "Still looking, please share options",
];
const LABELS = ["Hot", "Follow up", "Tour", "Budget issue", "Parent approval", "New"];

// tiny deterministic PRNG so every reload shows the same universe
function rng(seed: number) {
  let s = seed;
  return () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
}

const iso = (daysAgo: number, hour: number, min: number) => {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, min, 0, 0);
  return d.toISOString();
};

const inDays = (days: number, hour = 11) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
};

const dateOnly = (days: number) => inDays(days).slice(0, 10);

interface Ctx {
  area: string;
  budget: number;
  host: string;
  rand: () => number;
}

/** Fill every journey field up to (not including) index `upto`. */
function fillTo(upto: number, c: Ctx): Record<string, string> {
  const f: Record<string, string> = {};
  const set = (obj: Record<string, string>) => Object.assign(f, obj);
  for (let i = 0; i < upto && i < JOURNEY.length; i++) {
    switch (JOURNEY[i].key) {
      case "CAPTURE": set({ captured: "YES" }); break;
      case "WHERE": set({ where: c.rand() > 0.75 ? "OLD_CHAT" : "ACTIVE_CHAT" }); break;
      case "CHANNEL": set({ channel: c.rand() > 0.5 ? "BOTH" : "WHATSAPP" }); break;
      case "WHEN": set({ when: "TODAY" }); break;
      case "OWN": set({ ownership: "OWN" }); break;
      case "RECON": set({ recon: c.rand() > 0.5 ? "PART_QUALIFIED" : "CONTACTED" }); break;
      case "AREA": set({ area: c.area }); break;
      case "FEASIBLE": set({ feasible: "YES" }); break;
      case "MOVEIN": set({ moveIn: dateOnly(3 + Math.floor(c.rand() * 40)) }); break;
      case "BUDGET": set({ budget: String(c.budget) }); break;
      case "ROOMTYPE": set({ roomType: ["SINGLE", "DOUBLE", "TRIPLE", "ANY"][Math.floor(c.rand() * 4)] }); break;
      case "INTENT": set({ intent: c.rand() > 0.5 ? "HIGH" : "VERY_HIGH" }); break;
      case "CALL": set({ call: "CONNECTED", callNote: "Wants to see the property this week" }); break;
      case "REPLY": set({ reply: "REPLIED" }); break;
      case "MATCH": set({ property: `Gharpayy ${c.area}`, propertyRoom: `Room ${100 + Math.floor(c.rand() * 200)}` }); break;
      case "TOUR_READY": set({ tourReady: "READY" }); break;
      case "TOUR_SLOT": set({ tourAt: inDays(1 + Math.floor(c.rand() * 3), 17), tourHost: c.host }); break;
      case "TOUR_CONFIRM": set({ tourConfirm: "CONFIRMED" }); break;
      case "TOUR_VISIT": set({ tourVisit: "ARRIVED" }); break;
      case "TOUR_FEEDBACK": set({ tourFeedback: "LIKED" }); break;
      case "QUOTE": set({ rent: String(c.budget), deposit: String(c.budget * 2), maintenance: "1000" }); break;
      case "NEGOTIATE": set({ decision: "ACCEPTED" }); break;
      case "BOOKING": set({ bookingAmount: "5000", bookingMoveIn: dateOnly(5 + Math.floor(c.rand() * 20)) }); break;
      case "APPROVAL": set({ approval: "APPROVED", approvalNote: "Room free from the 1st" }); break;
      case "PAYMENT": set({ payment: "RECEIVED", paymentAmount: "5000", paymentMode: "Gharpayy UPI" }); break;
      case "RESERVED": set({ reserved: "LOCKED", lockedRoom: `Room ${100 + Math.floor(c.rand() * 200)} / Bed B` }); break;
      case "CUSTOMER_CONFIRM": set({ customerConfirm: "SENT" }); break;
      case "CHECKIN_PREP": set({ checkinPrep: "READY" }); break;
      case "CHECKIN_DAY": set({ checkinDay: "CHECKED_IN" }); break;
      case "SETTLED": set({ settled: "SETTLED" }); break;
    }
  }
  return f;
}

// Where the demo leads sit. Most are early (that is real life), and a solid
// tail sits in tour, closing, booking, approval, payment and check-in.
const SPREAD: { upto: number; count: number }[] = [
  { upto: 1, count: 70 },   // just captured
  { upto: 4, count: 30 },   // admission answered
  { upto: 6, count: 25 },   // owned, reading the chat
  { upto: 12, count: 30 },  // mid qualification
  { upto: 14, count: 20 },  // qualified, calling
  { upto: 16, count: 15 },  // sharing properties
  { upto: 18, count: 12 },  // tour scheduled
  { upto: 20, count: 10 },  // tour done
  { upto: 22, count: 10 },  // quoted / negotiating
  { upto: 23, count: 8 },   // accepted, booking to create
  { upto: 24, count: 8 },   // booking created, approval pending
  { upto: 25, count: 6 },   // approved, payment pending
  { upto: 27, count: 5 },   // reserved
  { upto: 29, count: 5 },   // check-in prep
  { upto: 31, count: 6 },   // checked in / settled
];

export function seedLeads(): FlowLead[] {
  const r = rng(7);
  const out: FlowLead[] = [];
  let i = 0;
  SPREAD.forEach((band) => {
    for (let n = 0; n < band.count; n++) {
      i += 1;
      const name = `${FIRST[Math.floor(r() * FIRST.length)]} ${LAST[Math.floor(r() * LAST.length)]}`;
      const daysAgo = Math.floor(r() * 9);
      const area = AREAS[Math.floor(r() * AREAS.length)];
      const host = HANDLERS[Math.floor(r() * HANDLERS.length)];
      const f = fillTo(band.upto, { area, budget: 8000 + Math.floor(r() * 9) * 1000, host, rand: r });
      const owned = Boolean(f["ownership"]);
      const cur = JOURNEY.find((s) => !isStepDone(f, s));
      const done = JOURNEY.filter((s) => isStepDone(f, s));
      // most owned leads have a next step; a few deliberately do not, and a few are overdue
      const gap = n % 7;
      const nextAction = owned && gap !== 3 ? "Call the customer" : undefined;
      const nextActionAt = owned && gap !== 3 ? (gap === 5 ? iso(1, 12, 0) : inDays(gap === 1 ? 0 : 1, 12)) : undefined;
      out.push({
        id: `bf-${i}`,
        name,
        phone: `+9198${String(10000000 + Math.floor(r() * 89999999)).slice(0, 8)}`,
        waAccount: "Gharpayy Sales 01",
        lastMessage: MSGS[Math.floor(r() * MSGS.length)],
        lastActivityAt: iso(daysAgo, 9 + Math.floor(r() * 11), Math.floor(r() * 60)),
        lastEvidenceAt: iso(Math.min(daysAgo, 2), 10, 0),
        lastActionAt: owned ? iso(Math.floor(r() * 3), 12, 0) : undefined,
        unread: r() > 0.55 ? 1 + Math.floor(r() * 4) : 0,
        labels: r() > 0.5 ? [LABELS[Math.floor(r() * LABELS.length)]] : [],
        stage: cur ? cur.key : "SETTLED",
        owner: owned ? host : undefined,
        handler: owned ? host : undefined,
        ownedAt: owned ? iso(daysAgo, 10, 0) : undefined,
        nextAction,
        nextActionAt,
        f,
        q: {},
        events: [
          { at: iso(daysAgo, 9, 0), actor: "Draft Vision", label: "Chat captured from screenshot" },
          ...done.slice(1).map((s, k) => ({
            at: iso(Math.max(daysAgo - k, 0), 10, Math.min(k * 3, 59)),
            actor: owned ? host : "System",
            label: s.title,
            detail: f[s.field],
          })),
        ],
      });
    }
  });
  // a handful of connected leads (same person on two chats / one group requirement)
  if (out[3] && out[4]) {
    out[3].connectedTo = [out[4].id];
    out[4].connectedTo = [out[3].id];
  }
  if (out[10] && out[11] && out[12]) out[10].connectedTo = [out[11].id, out[12].id];
  return out;
}

export function seedCapturedRows(): CapturedRow[] {
  const r = rng(21);
  return Array.from({ length: 14 }).map((_, i) => {
    const name = `${FIRST[Math.floor(r() * FIRST.length)]} ${LAST[Math.floor(r() * LAST.length)]}`;
    const h = 9 + Math.floor(r() * 11);
    return {
      id: `row-${i + 1}`,
      screenshot: `screenshot-${1 + Math.floor(i / 6)}.jpg`,
      name,
      phone: `+9199${String(10000000 + Math.floor(r() * 89999999)).slice(0, 8)}`,
      lastMessage: `${MSGS[Math.floor(r() * MSGS.length)]}${r() > 0.8 ? ` (${AREAS[Math.floor(r() * AREAS.length)]})` : ""}`,
      time: `${String(h).padStart(2, "0")}:${String(Math.floor(r() * 60)).padStart(2, "0")}`,
      unread: r() > 0.5 ? 1 + Math.floor(r() * 5) : 0,
      labels: r() > 0.55 ? [LABELS[Math.floor(r() * LABELS.length)]] : [],
      outgoing: r() > 0.7,
      status: "NEW",
    };
  });
}
