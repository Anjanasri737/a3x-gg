// Deterministic demo universe: one WhatsApp account, 8 handlers, a week of chats.
import type { CapturedRow, FlowLead } from "./types";

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

export function seedLeads(): FlowLead[] {
  const r = rng(7);
  const out: FlowLead[] = [];
  for (let i = 0; i < 240; i++) {
    const name = `${FIRST[Math.floor(r() * FIRST.length)]} ${LAST[Math.floor(r() * LAST.length)]}`;
    const daysAgo = Math.floor(r() * 9); // some are older than 7 days
    const lead: FlowLead = {
      id: `bf-${i + 1}`,
      name,
      phone: `+9198${String(10000000 + Math.floor(r() * 89999999)).slice(0, 8)}`,
      waAccount: "Gharpayy Sales 01",
      lastMessage: MSGS[Math.floor(r() * MSGS.length)],
      lastActivityAt: iso(daysAgo, 9 + Math.floor(r() * 11), Math.floor(r() * 60)),
      unread: r() > 0.55 ? 1 + Math.floor(r() * 4) : 0,
      labels: r() > 0.5 ? [LABELS[Math.floor(r() * LABELS.length)]] : [],
      stage: "CAPTURED",
      q: {},
      events: [{ at: iso(daysAgo, 9, 0), actor: "Draft Vision", label: "Chat captured from screenshot" }],
    };
    out.push(lead);
  }
  // a handful of connected leads (same person on two chats / one group requirement)
  out[3].connectedTo = [out[4].id];
  out[4].connectedTo = [out[3].id];
  out[10].connectedTo = [out[11].id, out[12].id];
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
