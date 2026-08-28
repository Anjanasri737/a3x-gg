// Demo leads + WA behaviour seed so the inbox is alive on first load.
// Idempotent: keyed by a sentinel lead so it only seeds once.
import { useIdentityStore } from "@/lib/lead-identity/store";
import { useWa } from "./store";

const SEED_KEY = "gharpayy.wa.seeded.v1";

type Draft = {
  name: string; phone: string; email?: string; location: string; areas: string[];
  fullAddress?: string; budget: string; moveIn: string; type: string; room: string;
  need: string; specialReqs: string; inBLR: boolean | null; zone: string; rawSource: string;
};

const DEMO: Draft[] = [
  {
    name: "Karthik R", phone: "9008012345", location: "Koramangala", areas: ["Koramangala", "HSR"],
    fullAddress: "5th Block Koramangala, Bangalore",
    budget: "12000", moveIn: "1st Sep", type: "Working", room: "Private", need: "Boys",
    specialReqs: "Needs parking", inBLR: true, zone: "KOR", rawSource: "WA forward",
  },
  {
    name: "Sneha P", phone: "9008023456", email: "sneha@example.com", location: "HSR Layout",
    areas: ["HSR Layout"], budget: "9000", moveIn: "immediate", type: "Working", room: "Shared",
    need: "Girls", specialReqs: "", inBLR: true, zone: "HSR", rawSource: "FB lead",
  },
  {
    name: "Imran S", phone: "9008034567", location: "Whitefield", areas: ["Whitefield", "ITPL"],
    budget: "15000", moveIn: "10th Sep", type: "Working", room: "Private", need: "Coed",
    specialReqs: "Pet friendly?", inBLR: true, zone: "WFD", rawSource: "Referral",
  },
  {
    name: "Divya M", phone: "9008045678", location: "Indiranagar", areas: ["Indiranagar"],
    budget: "18000", moveIn: "20th Aug", type: "Student", room: "Private", need: "Girls",
    specialReqs: "Near metro", inBLR: true, zone: "IDR", rawSource: "Instagram DM",
  },
  {
    name: "Arjun V", phone: "9008056789", location: "Jayanagar", areas: ["Jayanagar", "JP Nagar"],
    budget: "11000", moveIn: "next month", type: "Working", room: "Both", need: "Boys",
    specialReqs: "", inBLR: true, zone: "JPN", rawSource: "Website form",
  },
  {
    name: "Farhana K", phone: "9008067890", location: "Electronic City", areas: ["Electronic City"],
    budget: "8000", moveIn: "1st Oct", type: "Student", room: "Shared", need: "Girls",
    specialReqs: "Vegetarian only", inBLR: true, zone: "ECT", rawSource: "WA forward",
  },
];

export function seedWaInbox() {
  if (typeof window === "undefined") return;
  if (window.localStorage.getItem(SEED_KEY)) return;

  const id = useIdentityStore.getState();
  const wa = useWa.getState();
  const me = id.currentUser;

  // Don't reseed if leads already exist (avoid duplicates on hot reload).
  if (id.leads.length === 0) {
    for (const d of DEMO) {
      id.createLead({
        name: d.name, phone: d.phone, email: d.email ?? "", location: d.location,
        areas: d.areas, fullAddress: d.fullAddress ?? "", budget: d.budget,
        moveIn: d.moveIn, type: d.type, room: d.room, need: d.need,
        specialReqs: d.specialReqs, inBLR: d.inBLR, zone: d.zone, rawSource: d.rawSource,
      });
    }
  }

  const leads = useIdentityStore.getState().leads;
  const [karthik, sneha, imran, divya, arjun, farhana] = DEMO.map(
    (d) => leads.find((l) => l.name === d.name),
  );

  // Claims: someone owns a few.
  if (karthik) wa.claim(karthik.ulid, "tcm-1", "Aarav Mehta");
  if (sneha) wa.claim(sneha.ulid, me.id, me.name);
  if (imran) wa.claim(imran.ulid, "tcm-4", "Neha Verma");

  // Unread badges with reasons.
  if (karthik) wa.ping(karthik.ulid, "Replied on WhatsApp", 2);
  if (divya) wa.ping(divya.ulid, "New WhatsApp message", 1);
  if (farhana) wa.ping(farhana.ulid, "Missed call callback", 1);

  // Next actions / follow-ups.
  const inHours = (h: number) => new Date(Date.now() + h * 3600_000).toISOString();
  const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();
  if (sneha) wa.setNextAction(sneha.ulid, { dueAt: inHours(2), kind: "call", note: "Confirm tour slot" });
  if (arjun) wa.setNextAction(arjun.ulid, { dueAt: hoursAgo(3), kind: "follow-up", note: "Overdue — re-engage" });

  // Chips.
  if (karthik) { wa.addChip(karthik.ulid, "interested"); wa.addChip(karthik.ulid, "hot"); }
  if (sneha) wa.addChip(sneha.ulid, "tour");
  if (imran) { wa.addChip(imran.ulid, "quote"); }
  if (divya) wa.addChip(divya.ulid, "future");
  if (arjun) wa.addChip(arjun.ulid, "no-answer");

  // Pin Karthik (hot).
  if (karthik) wa.togglePin(karthik.ulid);

  // A pending handover to the current user.
  if (karthik) {
    wa.transfer({
      ulid: karthik.ulid, fromId: "tcm-3", fromName: "Rohan Iyer",
      toId: me.id, toName: me.name,
      message: "Hot lead — moving to BLR today. Take the close, I'm on tours.",
    });
  }

  // Simulate some activity so the chat pane has a timeline.
  const log = (ulid: string | undefined, kind: any, text: string) => {
    if (ulid) useIdentityStore.getState().logActivity(ulid, kind, text);
  };
  if (karthik) {
    log(karthik.ulid, "whatsapp-sent", "Sent 3 Koramangala options with rent + photos");
    log(karthik.ulid, "note-added", "Lead replied — liked 5th block, asked about parking", { reply: true });
    log(karthik.ulid, "call-logged", "Called, discussed move-in date");
  }
  if (sneha) {
    log(sneha.ulid, "whatsapp-sent", "Sent HSR shared room options");
    log(sneha.ulid, "note-added", "Wants immediate move-in, ok with 2 sharing", { reply: true });
  }
  if (imran) {
    log(imran.ulid, "whatsapp-sent", "Sent Whitefield quotation — ₹15k private");
    log(imran.ulid, "note-added", "Checking with family on pet policy", { reply: true });
  }

  window.localStorage.setItem(SEED_KEY, "1");
}
