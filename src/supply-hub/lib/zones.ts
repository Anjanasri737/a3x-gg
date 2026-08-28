// Supply Hub → zone registry.
// Zones are configurable: the four defaults ship with the app, and ops can add
// their own (e.g. MTPSJR = Manyata + Sarjapur) or override any property manually.
import { useCallback, useSyncExternalStore } from "react";
import type { PG } from "../data/types";

export interface ZoneDef {
  id: string;            // e.g. "MRH"
  label: string;         // display name
  short: string;         // badge text
  cluster: string;       // human description of the catchment
  keywords: string[];    // lowercase match terms (area / locality / name / landmarks)
  accent: string;        // tailwind classes for the badge
  builtin?: boolean;
  core?: boolean;        // day-1 operational zone vs expansion zone
}


export const UNMAPPED = "UNMAPPED";

export const ZONE_ACCENTS = [
  "border-emerald-400/40 bg-emerald-400/10 text-emerald-300",
  "border-sky-400/40 bg-sky-400/10 text-sky-300",
  "border-amber-400/40 bg-amber-400/10 text-amber-300",
  "border-violet-400/40 bg-violet-400/10 text-violet-300",
  "border-cyan-400/40 bg-cyan-400/10 text-cyan-300",
  "border-fuchsia-400/40 bg-fuchsia-400/10 text-fuchsia-300",
  "border-lime-400/40 bg-lime-400/10 text-lime-300",
  "border-orange-400/40 bg-orange-400/10 text-orange-300",
];

export const UNMAPPED_META: ZoneDef = {
  id: UNMAPPED,
  label: "UNMAPPED",
  short: "Unmapped",
  cluster: "Needs a zone owner",
  keywords: [],
  accent: "border-rose-400/40 bg-rose-400/10 text-rose-300",
  builtin: true,
};

// Order matters — first keyword hit wins, so the most specific belts come first.
export const DEFAULT_ZONES: ZoneDef[] = [
  {
    id: "WFD",
    label: "Whitefield",
    short: "WFD",
    cluster: "Whitefield · ITPL · Hoodi · Hope Farm · Kadugodi · EPIP",
    keywords: [
      "whitefield", "wfd", "itpl", "epip", "hope farm", "kadugodi", "hoodi",
      "nallurhalli", "pattandur", "seegehalli", "varthur", "prestige shantiniketan", "vr bengaluru",
    ],
    accent: ZONE_ACCENTS[1],
    builtin: true,
    core: true,
  },
  {
    id: "MRH",
    label: "Marathahalli–Mahadevapura",
    short: "MRH",
    cluster: "Marathahalli · Brookefield · AECS · Kundalahalli · Doddanekkundi · Mahadevapura",
    keywords: [
      "marathahalli", "marathalli", "brookefield", "brookfield", "brookfeild", "aecs", "aces",
      "kundalahalli", "kundanhalli", "mahadevapura", "mahadevpura", "madadevpura", "doddanekkundi",
      "munnekollal", "chinnapanahalli", "chinnapannahalli", "spice garden", "bagmane", "phoenix marketcity",
      "mwb", "bgm",
    ],
    accent: ZONE_ACCENTS[7],
    builtin: true,
    core: true,
  },
  {
    id: "BLR",
    label: "Bellandur",
    short: "BLR",
    cluster: "Bellandur · Kadubeesanahalli · Green Glen · Ecospace / Ecoworld belt",
    keywords: [
      "bellandur", "kadubees", "kadubeshanalli", "kadubeensanhalli", "kadubeesanahalli",
      "devarabeesanahalli", "green glen", "glen green", "kariyammana", "panathur", "yemalur",
      "ecospace", "ecoworld", "embassy techvillage", "sjr", "sarjapur", "outer ring road", "orr",
    ],
    accent: ZONE_ACCENTS[4],
    builtin: true,
    core: true,
  },
  {
    id: "HSR",
    label: "HSR–BTM",
    short: "HSR",
    cluster: "HSR Sector 1–7 · BTM · Silk Board · Bommanahalli · Kudlu",
    keywords: [
      "hsr", "btm", "agara", "somasundarapalya", "haralur", "kudlu", "singasandra",
      "silk board", "bommanahalli",
    ],
    accent: ZONE_ACCENTS[5],
    builtin: true,
    core: true,
  },
  {
    id: "KOR",
    label: "Koramangala Core",
    short: "KOR",
    cluster: "Koramangala 1st–8th · SG Palya · Tavarekere · Ejipura · Adugodi · Madiwala",
    keywords: [
      "koramangala", "koramangla", "sg palya", "sg palaya", "s.g palya", "sgpalya", "ejipura",
      "tavarekere", "dairy circle", "adugodi", "audugodi", "madiwala", "st john", "christ university",
      "forum mall", "nexus koramangala",
    ],
    accent: ZONE_ACCENTS[0],
    builtin: true,
    core: true,
  },
  {
    id: "MTP",
    label: "Manyata–North",
    short: "MTP",
    cluster: "Manyata · Nagawara · Thanisandra · Hebbal · HBR / Kalyan Nagar",
    keywords: [
      "manyata", "mtp", "nagawara", "nagwara", "thanisandra", "hebbal", "hennur", "bhartiya",
      "hbr", "hrbr", "kalyan nagar", "veerannapalya", "jakkur", "kasturi nagar",
    ],
    accent: ZONE_ACCENTS[2],
    builtin: true,
    core: true,
  },
  {
    id: "YPR",
    label: "Yeshwanthpur–Ramaiah",
    short: "YPR",
    cluster: "Yeshwanthpur · Mathikere · MS Ramaiah · BEL Road · Malleswaram · Peenya",
    keywords: [
      "ypr", "yeshwanthpur", "yeshwantpur", "christ yesh", "christ campus", "mathikere",
      "ramaiah", "bel road", "malleshwaram", "malleswaram", "rajajinagar", "jalahalli", "peenya",
      "nagasandra", "ikea",
    ],
    accent: ZONE_ACCENTS[3],
    builtin: true,
    core: true,
  },
  {
    id: "IDR",
    label: "Indiranagar–Central East",
    short: "IDR",
    cluster: "Indiranagar · Domlur · Ulsoor · CV Raman Nagar · MG Road belt",
    keywords: [
      "indiranagar", "indranagar", "domlur", "ulsoor", "halasur", "thippasandra", "cv raman",
      "kaggadasapura", "gm palya", "baiyappanahalli", "mg road", "richmond", "shanti nagar",
      "shanthinagar", "vasanth nagar", "wilson garden", "sampangi", "ub city", "brigade road",
    ],
    accent: ZONE_ACCENTS[6],
    builtin: true,
  },
  {
    id: "JPN",
    label: "JP Nagar–Bannerghatta",
    short: "JPN",
    cluster: "JP Nagar · Bannerghatta Road · Jayanagar · Arekere · Hulimavu",
    keywords: [
      "jp nagar", "jayanagar", "bannerghatta", "arekere", "hulimavu", "bilekahalli",
      "gottigere", "dollars colony",
    ],
    accent: ZONE_ACCENTS[3],
    builtin: true,
  },
  {
    id: "ECT",
    label: "Electronic City",
    short: "ECT",
    cluster: "Electronic City Phase 1 & 2 · Neeladri · Doddathoguru · Hosa Road",
    keywords: [
      "electronic city", "e city", "ecity", "neeladri", "doddathoguru", "konappana", "hosa road",
    ],
    accent: ZONE_ACCENTS[5],
    builtin: true,
  },
];

const ZONES_KEY = "gharpayy.supply.zones.v3";
const OVERRIDES_KEY = "gharpayy.supply.zone-overrides.v1";


const canStore = () => typeof window !== "undefined";

function readZones(): ZoneDef[] {
  if (!canStore()) return DEFAULT_ZONES;
  try {
    const raw = window.localStorage.getItem(ZONES_KEY);
    if (!raw) return DEFAULT_ZONES;
    const parsed = JSON.parse(raw) as ZoneDef[];
    return Array.isArray(parsed) && parsed.length ? parsed : DEFAULT_ZONES;
  } catch {
    return DEFAULT_ZONES;
  }
}

function readOverrides(): Record<string, string> {
  if (!canStore()) return {};
  try {
    return JSON.parse(window.localStorage.getItem(OVERRIDES_KEY) || "{}") as Record<string, string>;
  } catch {
    return {};
  }
}

let ZONE_LIST: ZoneDef[] = readZones();
let OVERRIDES: Record<string, string> = readOverrides();
let SNAPSHOT = { zones: ZONE_LIST, overrides: OVERRIDES };

const listeners = new Set<() => void>();
function emit() {
  SNAPSHOT = { zones: ZONE_LIST, overrides: OVERRIDES };
  listeners.forEach((l) => l());
}

export function listZones(): ZoneDef[] {
  return ZONE_LIST;
}

export function zoneMeta(id: string): ZoneDef {
  return ZONE_LIST.find((z) => z.id === id) ?? UNMAPPED_META;
}

const propKey = (pg: { name: string }) => (pg.name || "").trim().toUpperCase();
const norm = (s: string) => (s || "").toLowerCase().replace(/\s+/g, " ");

export function zoneOfPG(pg: Pick<PG, "area" | "locality" | "name"> & { landmarksInline?: string[] }): string {
  const override = OVERRIDES[propKey(pg)];
  if (override && (override === UNMAPPED || ZONE_LIST.some((z) => z.id === override))) return override;
  const hay = norm([pg.area, pg.locality, pg.name, (pg.landmarksInline || []).join(" ")].join(" | "));
  for (const z of ZONE_LIST) {
    if (z.keywords.some((k) => k && hay.includes(k.toLowerCase()))) return z.id;
  }
  return UNMAPPED;
}

export function zoneCounts(pgs: PG[]): Record<string, number> {
  const out: Record<string, number> = {};
  [...ZONE_LIST.map((z) => z.id), UNMAPPED].forEach((id) => { out[id] = 0; });
  pgs.forEach((p) => {
    const z = zoneOfPG(p);
    out[z] = (out[z] || 0) + 1;
  });
  return out;
}

/** Learning-plan numbers derived from live property counts. */
export function zonePlan(id: string, properties: number) {
  const meta = zoneMeta(id);
  return {
    ...meta,
    properties,
    pages: 8,
    mcqSets: "7 × 30 MCQ formal",
    masteryBar: "80% D1–D3; 70%+ after two-property reasoning",
    coverageQs: properties * 4,
  };
}

// ---- mutations ----------------------------------------------------------

function persistZones() {
  if (canStore()) window.localStorage.setItem(ZONES_KEY, JSON.stringify(ZONE_LIST));
  emit();
}

function persistOverrides() {
  if (canStore()) window.localStorage.setItem(OVERRIDES_KEY, JSON.stringify(OVERRIDES));
  emit();
}

export function upsertZone(zone: ZoneDef) {
  const idx = ZONE_LIST.findIndex((z) => z.id === zone.id);
  ZONE_LIST = idx >= 0
    ? ZONE_LIST.map((z, i) => (i === idx ? { ...z, ...zone } : z))
    : [zone, ...ZONE_LIST];
  persistZones();
}

export function removeZone(id: string) {
  ZONE_LIST = ZONE_LIST.filter((z) => z.id !== id);
  persistZones();
}

export function moveZone(id: string, dir: -1 | 1) {
  const i = ZONE_LIST.findIndex((z) => z.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= ZONE_LIST.length) return;
  const next = [...ZONE_LIST];
  [next[i], next[j]] = [next[j], next[i]];
  ZONE_LIST = next;
  persistZones();
}

/** Drag-and-drop reorder: move the zone at `from` to index `to`. */
export function reorderZones(from: number, to: number) {
  if (from === to || from < 0 || to < 0 || from >= ZONE_LIST.length || to >= ZONE_LIST.length) return;
  const next = [...ZONE_LIST];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  ZONE_LIST = next;
  persistZones();
}

export function resetZones() {
  ZONE_LIST = DEFAULT_ZONES;
  persistZones();
}

/** Rename a zone: change its code/label/badge and carry every manual override across. */
export function renameZone(oldId: string, next: { id: string; label?: string; short?: string }) {
  const newId = next.id.trim().toUpperCase();
  if (!newId || newId === UNMAPPED) return { ok: false, error: "Invalid zone code" };
  if (newId !== oldId && ZONE_LIST.some((z) => z.id === newId)) {
    return { ok: false, error: `${newId} already exists — merge instead` };
  }
  ZONE_LIST = ZONE_LIST.map((z) =>
    z.id === oldId
      ? { ...z, id: newId, label: next.label?.trim() || newId, short: next.short?.trim() || newId }
      : z,
  );
  if (newId !== oldId) {
    const remapped: Record<string, string> = {};
    Object.entries(OVERRIDES).forEach(([k, v]) => { remapped[k] = v === oldId ? newId : v; });
    OVERRIDES = remapped;
    if (canStore()) window.localStorage.setItem(OVERRIDES_KEY, JSON.stringify(OVERRIDES));
  }
  persistZones();
  return { ok: true as const };
}

/**
 * Merge two zones into one. Keywords are unioned, manual overrides pointing at the
 * source zone are repointed at the target, and the source zone is removed.
 */
export function mergeZones(sourceId: string, targetId: string, opts?: { id?: string; label?: string; short?: string; cluster?: string }) {
  if (sourceId === targetId) return { ok: false, error: "Pick two different zones" };
  const source = ZONE_LIST.find((z) => z.id === sourceId);
  const target = ZONE_LIST.find((z) => z.id === targetId);
  if (!source || !target) return { ok: false, error: "Zone not found" };

  const mergedId = (opts?.id?.trim().toUpperCase() || target.id);
  if (mergedId !== target.id && mergedId !== source.id && ZONE_LIST.some((z) => z.id === mergedId)) {
    return { ok: false, error: `${mergedId} already exists` };
  }

  const keywords = Array.from(new Set([...target.keywords, ...source.keywords]));
  const merged: ZoneDef = {
    ...target,
    id: mergedId,
    label: opts?.label?.trim() || (mergedId === target.id ? target.label : mergedId),
    short: opts?.short?.trim() || (mergedId === target.id ? target.short : mergedId),
    cluster: opts?.cluster?.trim() || `${target.cluster} + ${source.cluster}`,
    keywords,
    core: target.core || source.core,
  };

  ZONE_LIST = ZONE_LIST.filter((z) => z.id !== sourceId).map((z) => (z.id === targetId ? merged : z));

  const remapped: Record<string, string> = {};
  Object.entries(OVERRIDES).forEach(([k, v]) => {
    remapped[k] = v === sourceId || v === targetId ? mergedId : v;
  });
  OVERRIDES = remapped;
  if (canStore()) window.localStorage.setItem(OVERRIDES_KEY, JSON.stringify(OVERRIDES));
  persistZones();
  return { ok: true as const, id: mergedId };
}


export function setZoneOverride(pg: { name: string }, zoneId: string | null) {
  const key = propKey(pg);
  const next = { ...OVERRIDES };
  if (!zoneId) delete next[key];
  else next[key] = zoneId;
  OVERRIDES = next;
  persistOverrides();
}

export function zoneOverrideOf(pg: { name: string }): string | null {
  return OVERRIDES[propKey(pg)] ?? null;
}

// ---- react binding ------------------------------------------------------

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

const serverSnapshot = { zones: DEFAULT_ZONES, overrides: {} as Record<string, string> };

export function useZones() {
  const snap = useSyncExternalStore(subscribe, () => SNAPSHOT, () => serverSnapshot);
  const addZone = useCallback((z: Omit<ZoneDef, "accent"> & { accent?: string }) => {
    upsertZone({ ...z, accent: z.accent ?? ZONE_ACCENTS[ZONE_LIST.length % ZONE_ACCENTS.length] });
  }, []);
  return {
    zones: snap.zones,
    overrides: snap.overrides,
    addZone,
    upsertZone,
    removeZone,
    moveZone,
    reorderZones,
    resetZones,
    renameZone,
    mergeZones,
    setZoneOverride,
  };
}

