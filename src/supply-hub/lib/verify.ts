// Verification + availability layer for every Supply Hub property document.
// Both live inside the same Mongo-style `doc` jsonb, so nothing else changes.
import type { PG } from "../data/types";

export interface SectionStamp {
  at: string;
  by?: string;
}

export interface Verification {
  sections: Record<string, SectionStamp>;
  verifiedAt?: string | null;
  verifiedBy?: string | null;
}

export type AvailStatus = "available" | "limited" | "waitlist" | "full";

export interface RoomAvailability {
  type: string; // Single / Double / Triple / custom
  beds: number;
  available: boolean;
  from: string; // YYYY-MM-DD
  lastPrice: number; // best price we can close at
  note: string;
}

export interface Availability {
  status: AvailStatus;
  from: string;
  rooms: RoomAvailability[];
  note: string;
  updatedAt?: string;
}

/** PG document with the verification + availability extras. */
export type PGDoc = PG & {
  verification?: Verification;
  availability?: Availability;
  upgrades?: string[];
};

export const AVAIL_LABEL: Record<AvailStatus, string> = {
  available: "Available now",
  limited: "Few beds left",
  waitlist: "Waitlist / from date",
  full: "Full — no beds",
};

export const AVAIL_TONE: Record<AvailStatus, string> = {
  available: "border-emerald-400/40 text-emerald-400 bg-emerald-400/10",
  limited: "border-amber-400/40 text-amber-400 bg-amber-400/10",
  waitlist: "border-sky-400/40 text-sky-400 bg-sky-400/10",
  full: "border-rose-400/40 text-rose-400 bg-rose-400/10",
};

/* ---------------- field descriptors ---------------- */

export type FieldKind = "text" | "area" | "num" | "list" | "lines";

export interface VField {
  key: string;
  label: string;
  kind: FieldKind;
  get: (p: PGDoc) => string;
  set: (p: PGDoc, v: string) => PGDoc;
}

export interface VSection {
  id: string;
  label: string;
  fields: VField[];
}

const txt = (
  key: string,
  label: string,
  get: (p: PGDoc) => string | number | null | undefined,
  set: (p: PGDoc, v: string) => PGDoc,
  kind: FieldKind = "text",
): VField => ({ key, label, kind, get: (p) => (get(p) == null ? "" : String(get(p))), set });

const list = (
  key: string,
  label: string,
  get: (p: PGDoc) => string[] | undefined,
  set: (p: PGDoc, v: string[]) => PGDoc,
): VField => ({
  key,
  label,
  kind: "list",
  get: (p) => (get(p) ?? []).join(", "),
  set: (p, v) => set(p, v.split(",").map((x) => x.trim()).filter(Boolean)),
});

export const VERIFY_SECTIONS: VSection[] = [
  {
    id: "location",
    label: "Location",
    fields: [
      txt("area", "Area", (p) => p.area, (p, v) => ({ ...p, area: v })),
      txt("locality", "Locality", (p) => p.locality, (p, v) => ({ ...p, locality: v })),
      txt("mapsLink", "Google Maps link", (p) => p.mapsLink, (p, v) => ({ ...p, mapsLink: v })),
      txt("lat", "Latitude", (p) => p.lat, (p, v) => ({ ...p, lat: v ? Number(v) : null }), "num"),
      txt("lng", "Longitude", (p) => p.lng, (p, v) => ({ ...p, lng: v ? Number(v) : null }), "num"),
      list("landmarksInline", "Landmarks", (p) => p.landmarksInline, (p, v) => ({ ...p, landmarksInline: v })),
    ],
  },
  {
    id: "commute",
    label: "Commute & connectivity",
    fields: [
      {
        key: "nearbyLandmarks",
        label: "Nearby (one per line: Name | Type | km | walk mins)",
        kind: "lines",
        get: (p) => (p.nearbyLandmarks ?? []).map((l) => `${l.n} | ${l.t} | ${l.d} | ${l.w}`).join("\n"),
        set: (p, v) => ({
          ...p,
          nearbyLandmarks: v
            .split("\n")
            .map((line) => line.split("|").map((x) => x.trim()))
            .filter((parts) => parts[0])
            .map((parts) => ({
              n: parts[0] ?? "",
              t: parts[1] ?? "",
              d: Number(parts[2]) || 0,
              w: Number(parts[3]) || 0,
            })),
        }),
      },
    ],
  },
  {
    id: "pricing",
    label: "Pricing breakdown",
    fields: [
      txt("single", "Single ₹/mo", (p) => p.prices.single || "", (p, v) => ({ ...p, prices: { ...p.prices, single: Number(v) || 0 } }), "num"),
      txt("double", "Double ₹/mo", (p) => p.prices.double || "", (p, v) => ({ ...p, prices: { ...p.prices, double: Number(v) || 0 } }), "num"),
      txt("triple", "Triple ₹/mo", (p) => p.prices.triple || "", (p, v) => ({ ...p, prices: { ...p.prices, triple: Number(v) || 0 } }), "num"),
      txt("deposit", "Deposit", (p) => p.deposit, (p, v) => ({ ...p, deposit: v })),
      txt("minStay", "Minimum stay", (p) => p.minStay, (p, v) => ({ ...p, minStay: v })),
      txt("utilities", "Utilities / bills", (p) => p.utilities, (p, v) => ({ ...p, utilities: v })),
      txt("rooms", "Room types", (p) => p.rooms, (p, v) => ({ ...p, rooms: v })),
      txt("furnishing", "Furnishing", (p) => p.furnishing, (p, v) => ({ ...p, furnishing: v })),
    ],
  },
  {
    id: "food",
    label: "Food",
    fields: [
      txt("foodType", "Food type", (p) => p.foodType, (p, v) => ({ ...p, foodType: v })),
      txt("mealsIncluded", "Meals included", (p) => p.mealsIncluded, (p, v) => ({ ...p, mealsIncluded: v })),
    ],
  },
  {
    id: "lifestyle",
    label: "Lifestyle",
    fields: [
      txt("vibe", "Vibe", (p) => p.vibe, (p, v) => ({ ...p, vibe: v })),
      txt("noise", "Noise", (p) => p.noise, (p, v) => ({ ...p, noise: v })),
      txt("cleaning", "Cleaning", (p) => p.cleaning, (p, v) => ({ ...p, cleaning: v })),
      list("amenities", "Amenities", (p) => p.amenities, (p, v) => ({ ...p, amenities: v })),
      txt("rules", "House rules", (p) => p.rules, (p, v) => ({ ...p, rules: v }), "area"),
    ],
  },
  {
    id: "persona",
    label: "Persona targeting",
    fields: [
      txt("archetype", "Archetype", (p) => p.persona?.archetype, (p, v) => ({ ...p, persona: { ...p.persona, archetype: v } })),
      txt("ageRange", "Age range", (p) => p.persona?.ageRange, (p, v) => ({ ...p, persona: { ...p.persona, ageRange: v } })),
      txt("salary", "Salary band", (p) => p.persona?.salary, (p, v) => ({ ...p, persona: { ...p.persona, salary: v } })),
      txt("likelyCompanies", "Likely companies", (p) => p.persona?.likelyCompanies, (p, v) => ({ ...p, persona: { ...p.persona, likelyCompanies: v } })),
      list("painPoints", "Pain points", (p) => p.persona?.painPoints, (p, v) => ({ ...p, persona: { ...p.persona, painPoints: v } })),
      list("pitchAngle", "Pitch angles", (p) => p.persona?.pitchAngle, (p, v) => ({ ...p, persona: { ...p.persona, pitchAngle: v } })),
      list("qualifyingQuestions", "Qualifying questions", (p) => p.persona?.qualifyingQuestions, (p, v) => ({ ...p, persona: { ...p.persona, qualifyingQuestions: v } })),
      list("doNot", "Do not say", (p) => p.persona?.doNot, (p, v) => ({ ...p, persona: { ...p.persona, doNot: v } })),
      txt("decisionMaker", "Decision maker", (p) => p.persona?.decisionMaker, (p, v) => ({ ...p, persona: { ...p.persona, decisionMaker: v } })),
      txt("conversionProbability", "Conversion probability", (p) => p.persona?.conversionProbability, (p, v) => ({ ...p, persona: { ...p.persona, conversionProbability: v } })),
    ],
  },
  {
    id: "safety",
    label: "Household & safety",
    fields: [
      list("safety", "Safety features", (p) => p.safety, (p, v) => ({ ...p, safety: v })),
      txt("managerName", "Manager name", (p) => p.manager?.name, (p, v) => ({ ...p, manager: { ...p.manager, name: v } })),
      txt("managerPhone", "Manager phone", (p) => p.manager?.phone, (p, v) => ({ ...p, manager: { ...p.manager, phone: v } })),
      txt("ownerName", "Owner name", (p) => p.owner?.name, (p, v) => ({ ...p, owner: { ...p.owner, name: v } })),
      txt("ownerPhone", "Owner phone", (p) => p.owner?.phone, (p, v) => ({ ...p, owner: { ...p.owner, phone: v } })),
      txt("groupName", "Owner group", (p) => p.groupName, (p, v) => ({ ...p, groupName: v })),
    ],
  },
  {
    id: "messages",
    label: "Copy-paste messages",
    fields: [
      txt("location_card", "Location message (verbatim)", (p) => p.location_card, (p, v) => ({ ...p, location_card: v }), "area"),
      txt("wa_card", "Pricing message (verbatim)", (p) => p.wa_card, (p, v) => ({ ...p, wa_card: v }), "area"),
    ],
  },
  {
    id: "coldpitch",
    label: "Cold pitch script",
    fields: [
      txt("goal", "Call goal", (p) => p.scripts?.call1?.goal, (p, v) => ({ ...p, scripts: { ...p.scripts, call1: { ...p.scripts.call1, goal: v } } })),
      txt("opening", "Opening line", (p) => p.scripts?.call1?.opening, (p, v) => ({ ...p, scripts: { ...p.scripts, call1: { ...p.scripts.call1, opening: v } } }), "area"),
      list("questions", "Discovery questions", (p) => p.scripts?.call1?.questions, (p, v) => ({ ...p, scripts: { ...p.scripts, call1: { ...p.scripts.call1, questions: v } } })),
      txt("hook", "Hook", (p) => p.scripts?.call1?.hook, (p, v) => ({ ...p, scripts: { ...p.scripts, call1: { ...p.scripts.call1, hook: v } } }), "area"),
      txt("close", "Close", (p) => p.scripts?.call1?.close, (p, v) => ({ ...p, scripts: { ...p.scripts, call1: { ...p.scripts.call1, close: v } } }), "area"),
      {
        key: "objections",
        label: "Objections (one per line: objection | response)",
        kind: "lines",
        get: (p) => (p.scripts?.call2?.objections ?? []).map((o) => `${o.obj} | ${o.resp}`).join("\n"),
        set: (p, v) => ({
          ...p,
          scripts: {
            ...p.scripts,
            call2: {
              ...p.scripts.call2,
              objections: v
                .split("\n")
                .map((l) => l.split("|").map((x) => x.trim()))
                .filter((parts) => parts[0])
                .map((parts) => ({ obj: parts[0] ?? "", resp: parts[1] ?? "" })),
            },
          },
        }),
      },
    ],
  },
  {
    id: "upgrades",
    label: "Alternatives & upgrades",
    fields: [
      txt("usp", "USP", (p) => p.usp, (p, v) => ({ ...p, usp: v }), "area"),
      txt("lows", "Lows (internal)", (p) => p.lows, (p, v) => ({ ...p, lows: v }), "area"),
      list("upgrades", "Alternative / upgrade properties", (p) => p.upgrades, (p, v) => ({ ...p, upgrades: v })),
    ],
  },
];

export function blankAvailability(pg: PGDoc): Availability {
  const today = new Date().toISOString().slice(0, 10);
  const rooms: RoomAvailability[] = (
    [
      ["Single", pg.prices?.single ?? 0],
      ["Double", pg.prices?.double ?? 0],
      ["Triple", pg.prices?.triple ?? 0],
    ] as [string, number][]
  )
    .filter(([, price]) => price > 0)
    .map(([type, price]) => ({ type, beds: 0, available: true, from: today, lastPrice: price, note: "" }));
  return { status: "available", from: today, rooms, note: "" };
}

export function verifiedSectionCount(pg: PGDoc): number {
  const s = pg.verification?.sections ?? {};
  return VERIFY_SECTIONS.filter((sec) => !!s[sec.id]).length;
}

export function isFullyVerified(pg: PGDoc): boolean {
  return !!pg.verification?.verifiedAt && verifiedSectionCount(pg) === VERIFY_SECTIONS.length;
}

export function availabilityLine(pg: PGDoc): string {
  const a = pg.availability;
  if (!a) return "Availability not set";
  const rooms = (a.rooms ?? [])
    .map((r) => `${r.type}: ${r.available ? `from ${r.from}` : "full"}${r.lastPrice ? ` · best ₹${r.lastPrice.toLocaleString("en-IN")}` : ""}`)
    .join("\n");
  return [`${AVAIL_LABEL[a.status]}${a.from ? ` (from ${a.from})` : ""}`, rooms, a.note].filter(Boolean).join("\n");
}
