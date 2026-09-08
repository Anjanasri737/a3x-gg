// Movement OS demo seed — guarantees the OS is alive on first load.
// Idempotent via a sentinel key; never overwrites real work.
import { useIdentityStore } from "@/lib/lead-identity/store";
import { useMovement } from "./store";
import { seedWaInbox } from "@/wa/seed";
import type { DraftCode } from "./types";

const SEED_KEY = "gharpayy.movement.seeded.v2";

const EXTRA = [
  { name: "Rohit Nair", phone: "9008078901", location: "BTM Layout", zone: "BTM", budget: "10000", need: "Boys", room: "Shared", type: "Working", moveIn: "5th Sep" },
  { name: "Ananya Das", phone: "9008089012", location: "Marathahalli", zone: "MRT", budget: "13000", need: "Girls", room: "Private", type: "Working", moveIn: "immediate" },
  { name: "Vikram Shetty", phone: "9008090123", location: "Bellandur", zone: "BLD", budget: "16000", need: "Coed", room: "Private", type: "Working", moveIn: "15th Sep" },
  { name: "Priya Iyer", phone: "9008001234", location: "Kalyan Nagar", zone: "KLN", budget: "9500", need: "Girls", room: "Shared", type: "Student", moveIn: "1st Oct" },
  { name: "Sameer Khan", phone: "9008012399", location: "Hebbal", zone: "HBL", budget: "12500", need: "Boys", room: "Private", type: "Working", moveIn: "immediate" },
  { name: "Tanvi Rao", phone: "9008023477", location: "Sarjapur Road", zone: "SJR", budget: "14000", need: "Girls", room: "Private", type: "Working", moveIn: "8th Sep" },
];


/** 4 drafts x 30 chats a day needs a real pool — generate a deep stuck-chat bench. */
const FIRST = ["Aarav","Isha","Karan","Meera","Nikhil","Pooja","Rahul","Sneha","Varun","Divya","Arjun","Kavya","Manish","Ritu","Sahil","Tara","Yash","Zoya","Deepak","Nisha"];
const LAST = ["Sharma","Patel","Reddy","Nair","Gupta","Singh","Iyer","Menon","Joshi","Bose","Rao","Kulkarni","Shetty","Das","Verma"];
const AREAS: Array<[string, string]> = [["Koramangala","KOR"],["HSR Layout","HSR"],["BTM Layout","BTM"],["Indiranagar","IDR"],["Whitefield","WFD"],["Marathahalli","MRT"],["Bellandur","BLD"],["Electronic City","ECT"],["JP Nagar","JPN"],["Sarjapur Road","SJR"]];

function bench(count: number) {
  const out: typeof EXTRA = [];
  for (let i = 0; i < count; i++) {
    const [location, zone] = AREAS[i % AREAS.length];
    out.push({
      name: `${FIRST[i % FIRST.length]} ${LAST[(i * 7) % LAST.length]} ${String(i + 1).padStart(3, "0")}`,
      phone: `9${String(200000000 + i * 137717).slice(0, 9)}`,
      location,
      zone,
      budget: String(8500 + (i % 9) * 900),
      need: i % 3 === 0 ? "Girls" : i % 3 === 1 ? "Boys" : "Coed",
      room: i % 2 ? "Private" : "Shared",
      type: i % 4 ? "Working" : "Student",
      moveIn: i % 5 === 0 ? "immediate" : `${(i % 27) + 1}th Sep`,
    });
  }
  return out;
}

const hrsAgo = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();
const inHrs = (h: number) => new Date(Date.now() + h * 3600_000).toISOString();

export function seedMovement() {
  if (typeof window === "undefined") return;
  seedWaInbox();
  backfillIdentity();
  if (window.localStorage.getItem(SEED_KEY)) return;


  const id = useIdentityStore.getState();
  const existing = new Set(id.leads.map((l) => l.name));
  for (const d of [...EXTRA, ...bench(132)]) {
    if (existing.has(d.name)) continue;
    id.createLead({
      name: d.name, phone: d.phone, email: "", location: d.location,
      areas: [d.location], fullAddress: "", budget: d.budget, moveIn: d.moveIn,
      type: d.type, room: d.room, need: d.need, specialReqs: "",
      inBLR: true, zone: d.zone, rawSource: "Demo seed",
    });
  }

  const leads = useIdentityStore.getState().leads;
  const m = useMovement.getState();

  m.ensureMany(
    leads.map((l, i) => ({
      ulid: l.ulid,
      name: l.name,
      phone: l.phoneE164 || l.phoneRaw,
      zone: l.zone ?? undefined,
      location: l.area ?? null,
      ownerId: l.assigneeId ?? "u-self",
      ownerName: l.assigneeName ?? (i % 3 === 0 ? "You" : i % 3 === 1 ? "Aarav Mehta" : "Neha Verma"),
      unread: 0,
      lastCustomerMsgAt: hrsAgo(i + 1),
      checkInDate: l.earliestCheckIn ?? null,
    })),
  );


  const drafts: DraftCode[] = ["D1", "D1", "D2", "D2", "D3", "D1", "D2", "D4", "D3", "D1", "D2", "D1"];

  leads.slice(0, 26).forEach((l, i) => {
    const s = useMovement.getState();
    const u = l.ulid;
    const code = drafts[i % drafts.length];

    // Two leads stay undrafted so the Drafting queue has real work.
    if (i % 6 !== 5) s.draft(u, code);
    else s.markWaDraft(u, code); // WhatsApp marked, CRM out of sync

    const lane = i % 6;

    if (lane === 0) {
      // Customer waiting — P0
      s.customerReplied(u, "Bhai is the room still available?");
      s.customerReplied(u, "Can I visit today evening?");
    } else if (lane === 1) {
      // Tour scheduled + confirmed
      s.qualify(u, true, new Date(Date.now() + 5 * 864e5).toISOString().slice(0, 10));
      s.setStage(u, "matched", "3 verified PGs shared");
      s.scheduleTour(u, inHrs(6 + i), "Gharpayy Koramangala 5th Block");
      s.confirmTour(u);
      s.setNextAction(u, {
        kind: "confirm-tour", dueAt: inHrs(2), ownerId: "u-self", ownerName: "You",
        note: "Reconfirm 2 hours before the visit",
      });
    } else if (lane === 2) {
      // Tour done → quotation → negotiation
      s.qualify(u, true);
      s.scheduleTour(u, hrsAgo(20), "Gharpayy HSR 27th Main");
      s.confirmTour(u);
      s.tourDone(u);
      s.tourOutcome(u, "positive");
      s.sendQuote(u);
      s.setBlocker(u, "price");
      s.setNextAction(u, {
        kind: "send-quote", dueAt: inHrs(-1), ownerId: "u-self", ownerName: "You",
        note: "Revised quote with 1 month deposit",
      });
    } else if (lane === 3) {
      // Money now
      s.qualify(u, true);
      s.scheduleTour(u, hrsAgo(30));
      s.tourDone(u);
      s.tourOutcome(u, "positive");
      s.sendQuote(u);
      s.prebook(u, "payment-intent");
      s.setNextAction(u, {
        kind: "collect-payment", dueAt: inHrs(3), ownerId: "u-self", ownerName: "You",
        note: "Token ₹5,000 — send payment link",
      });
    } else if (lane === 4) {
      // Future / recovery
      s.qualify(u, false);
      s.setNextAction(u, {
        kind: "recheck-later", dueAt: inHrs(72), ownerId: "u-self", ownerName: "You",
        note: "Moving only next month",
      });
    } else {
      // Booked + one loss so dashboards are not flat
      if (i % 12 === 5) {
        s.qualify(u, true);
        s.scheduleTour(u, hrsAgo(60));
        s.tourDone(u);
        s.tourOutcome(u, "positive");
        s.sendQuote(u);
        s.collectPayment(u, 5000);
        s.book(u);
      } else {
        s.exit(u, "no-response", "3 calls, 2 WhatsApps, no reply in 6 days");
      }
    }
  });

  // Unmatched WhatsApp conversations
  m.addUnmatched({ phoneRaw: "+91 90080 55511", waAccount: "Gharpayy Sales 1", name: "Unknown", lastMessage: "PG near Ecospace?", reason: "No CRM record for this number" });
  m.addUnmatched({ phoneRaw: "+91 90080 55512", waAccount: "Gharpayy Sales 2", lastMessage: "Rent kitna hai", reason: "Number matched 2 leads — needs manual pick" });

  m.snapshot({
    label: "1PM",
    operatorId: "u-self",
    totals: { drafted: leads.length - 2, active: 13, tours: 3, payments: 1 },
    required: { drafted: 30, calls: 20, tours: 4, booked: 2 },
    status: "BEHIND",
    mainLeak: "Tours not confirmed",
    inference: "Drafting on pace, tour confirmations lagging",
  });

  window.localStorage.setItem(SEED_KEY, "1");
}

/** Names and phone numbers must exist on every movement record — last-4 search needs them. */
function backfillIdentity() {
  const m = useMovement.getState();
  for (const l of useIdentityStore.getState().leads) {
    const st = m.states[l.ulid];
    if (!st) continue;
    if (!st.name || !st.phone) {
      m.patch(l.ulid, { name: st.name ?? l.name, phone: st.phone ?? (l.phoneE164 || l.phoneRaw), zone: st.zone || (l.zone ?? "") });
    }
  }
}
