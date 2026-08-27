// Property Truth & Availability Control.
// Four independent states per property: VERIFIED · AVAILABLE · SELLABLE · ENABLED.
// Everything lives inside the same Mongo-style `doc` jsonb, so no schema change.
import { VERIFY_SECTIONS, type PGDoc, type SectionStamp } from "./verify";
import { gapReport } from "./gaps";

/* ------------------------------------------------------------------ types */

export type BedState =
  | "available"
  | "available_from"
  | "occupied"
  | "notice"
  | "hold"
  | "booked"
  | "blocked";

export interface Bed {
  id: string;
  label: string;
  state: BedState;
  from?: string; // YYYY-MM-DD — when it frees up
  asking: number;
  target: number;
  floor: number;
  note?: string;
}

export interface InvRoom {
  id: string;
  floor: string;
  room: string;
  type: string; // Single / Double / Triple / Private
  beds: Bed[];
}

export interface Inventory {
  rooms: InvRoom[];
  lastCheckedAt?: string;
  lastCheckedBy?: string;
  source?: EvidenceSource;
}

export type EvidenceSource = "manager" | "call" | "whatsapp" | "visit" | "photo" | "portal";

export interface Charges {
  deposit: string;
  maintenance: string;
  food: string;
  setup: string;
  discount: string;
  joiningOffer: string;
  longStay: string;
  immediateMove: string;
}

export interface ChangeLog {
  at: string;
  by?: string;
  what: string;
  from?: string;
  to?: string;
}

export type PGX = PGDoc & {
  inventory?: Inventory;
  charges?: Partial<Charges>;
  history?: ChangeLog[];
  media?: { photos?: string[]; videos?: string[] };
};

/* ------------------------------------------------------- expiry policy */

/** Hours a section stays trustworthy after it is verified. */
export const SECTION_TTL_HOURS: Record<string, number> = {
  location: 24 * 365,
  commute: 24 * 90,
  pricing: 48,
  food: 24 * 7,
  lifestyle: 24 * 30,
  persona: 24 * 120,
  safety: 24 * 30,
  messages: 24 * 30,
  coldpitch: 24 * 120,
  upgrades: 24 * 30,
};

export const INVENTORY_TTL_HOURS = 24;

/** Sections that must be green before a property can be GHARPAYY VERIFIED. */
export const MANDATORY_SECTIONS = [
  "location",
  "commute",
  "pricing",
  "food",
  "lifestyle",
  "safety",
  "persona",
  "messages",
];

export type SectionState = "verified" | "review" | "changed" | "missing";

export const SECTION_STATE_LABEL: Record<SectionState, string> = {
  verified: "Verified",
  review: "Needs review",
  changed: "Changed after verification",
  missing: "Missing data",
};

export const SECTION_STATE_TONE: Record<SectionState, string> = {
  verified: "border-emerald-400/40 bg-emerald-400/10 text-emerald-400",
  review: "border-amber-400/40 bg-amber-400/10 text-amber-400",
  changed: "border-sky-400/40 bg-sky-400/10 text-sky-400",
  missing: "border-rose-400/40 bg-rose-400/10 text-rose-400",
};

/* ------------------------------------------------------------- helpers */

const HOUR = 3600_000;

export function hoursSince(iso?: string | null): number {
  if (!iso) return Infinity;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return Infinity;
  return (Date.now() - t) / HOUR;
}

export function ago(iso?: string | null): string {
  const h = hoursSince(iso);
  if (!Number.isFinite(h)) return "never";
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} min ago`;
  if (h < 48) return `${Math.round(h)} hr ago`;
  return `${Math.round(h / 24)} d ago`;
}

/** Stable fingerprint of a section's current values — detects silent edits. */
export function sectionHash(pg: PGX, sectionId: string): string {
  const sec = VERIFY_SECTIONS.find((s) => s.id === sectionId);
  if (!sec) return "";
  const raw = sec.fields.map((f) => f.get(pg)).join("¦");
  let h = 5381;
  for (let i = 0; i < raw.length; i += 1) h = ((h << 5) + h + raw.charCodeAt(i)) | 0;
  return String(h >>> 0);
}

export function sectionFilled(pg: PGX, sectionId: string): boolean {
  const sec = VERIFY_SECTIONS.find((s) => s.id === sectionId);
  if (!sec) return false;
  return sec.fields.some((f) => f.get(pg).trim().length > 0);
}

export type Stamp = SectionStamp & { hash?: string; source?: EvidenceSource; evidence?: string };

export function stampOf(pg: PGX, sectionId: string): Stamp | undefined {
  return (pg.verification?.sections ?? {})[sectionId] as Stamp | undefined;
}

export function sectionState(pg: PGX, sectionId: string): SectionState {
  const stamp = stampOf(pg, sectionId);
  if (!sectionFilled(pg, sectionId)) return "missing";
  if (!stamp) return "review";
  if (stamp.hash && stamp.hash !== sectionHash(pg, sectionId)) return "changed";
  const ttl = SECTION_TTL_HOURS[sectionId] ?? 24 * 30;
  if (hoursSince(stamp.at) > ttl) return "review";
  return "verified";
}

export function nextDue(pg: PGX, sectionId: string): string {
  const stamp = stampOf(pg, sectionId);
  const ttl = SECTION_TTL_HOURS[sectionId] ?? 24 * 30;
  if (!stamp) return "now";
  const due = Date.parse(stamp.at) + ttl * HOUR;
  if (due < Date.now()) return "overdue";
  const h = (due - Date.now()) / HOUR;
  return h < 24 ? `in ${Math.round(h)} hr` : `in ${Math.round(h / 24)} d`;
}

/* --------------------------------------------------------- verification */

export interface VerifySummary {
  pct: number;
  verified: number;
  total: number;
  states: Record<string, SectionState>;
  mandatoryOk: boolean;
  expired: string[];
  changed: string[];
  missing: string[];
}

export function verifySummary(pg: PGX): VerifySummary {
  const states: Record<string, SectionState> = {};
  for (const s of VERIFY_SECTIONS) states[s.id] = sectionState(pg, s.id);
  const list = VERIFY_SECTIONS.map((s) => s.id);
  const verified = list.filter((id) => states[id] === "verified").length;
  return {
    states,
    verified,
    total: list.length,
    pct: Math.round((verified / list.length) * 100),
    mandatoryOk: MANDATORY_SECTIONS.every((id) => states[id] === "verified"),
    expired: list.filter((id) => states[id] === "review"),
    changed: list.filter((id) => states[id] === "changed"),
    missing: list.filter((id) => states[id] === "missing"),
  };
}

/* ------------------------------------------------------------ inventory */

export const BED_STATE_LABEL: Record<BedState, string> = {
  available: "Available now",
  available_from: "Available from",
  occupied: "Occupied",
  notice: "Notice given",
  hold: "On hold",
  booked: "Booked",
  blocked: "Blocked",
};

export const BED_STATE_TONE: Record<BedState, string> = {
  available: "border-emerald-400/40 bg-emerald-400/10 text-emerald-400",
  available_from: "border-sky-400/40 bg-sky-400/10 text-sky-400",
  occupied: "border-muted-foreground/30 bg-muted text-muted-foreground",
  notice: "border-amber-400/40 bg-amber-400/10 text-amber-400",
  hold: "border-violet-400/40 bg-violet-400/10 text-violet-400",
  booked: "border-primary/40 bg-primary/10 text-primary",
  blocked: "border-rose-400/40 bg-rose-400/10 text-rose-400",
};

export interface InvSummary {
  beds: number;
  availableNow: number;
  next7: number;
  next30: number;
  hold: number;
  occupied: number;
  earliest: string | null;
  fromPrice: number;
  floorPrice: number;
  fresh: boolean;
  checkedAgo: string;
}

const day = (d: string) => Date.parse(`${d}T00:00:00`);

export function invSummary(pg: PGX): InvSummary {
  const rooms = pg.inventory?.rooms ?? [];
  const beds = rooms.flatMap((r) => r.beds);
  const now = Date.now();
  const freeNow = beds.filter((b) => b.state === "available");
  const soon = beds.filter(
    (b) => (b.state === "available_from" || b.state === "notice") && b.from,
  );
  const within = (d: number) =>
    soon.filter((b) => day(b.from!) - now <= d * 86400_000).length;
  const sellable = [...freeNow, ...soon];
  const dates = [
    ...freeNow.map(() => new Date().toISOString().slice(0, 10)),
    ...soon.map((b) => b.from!),
  ].sort();
  const prices = sellable.map((b) => b.asking).filter((x) => x > 0);
  const floors = sellable.map((b) => b.floor || b.target || b.asking).filter((x) => x > 0);
  const checked = pg.inventory?.lastCheckedAt;
  return {
    beds: beds.length,
    availableNow: freeNow.length,
    next7: within(7),
    next30: within(30),
    hold: beds.filter((b) => b.state === "hold" || b.state === "booked").length,
    occupied: beds.filter((b) => b.state === "occupied").length,
    earliest: dates[0] ?? null,
    fromPrice: prices.length ? Math.min(...prices) : 0,
    floorPrice: floors.length ? Math.min(...floors) : 0,
    fresh: hoursSince(checked) <= INVENTORY_TTL_HOURS,
    checkedAgo: ago(checked),
  };
}

/** Seed a floor→room→bed grid from the legacy price fields. */
export function seedInventory(pg: PGX): Inventory {
  const today = new Date().toISOString().slice(0, 10);
  const specs: [string, number, number][] = [
    ["Single", pg.prices?.single ?? 0, 1],
    ["Double", pg.prices?.double ?? 0, 2],
    ["Triple", pg.prices?.triple ?? 0, 3],
  ];
  const rooms: InvRoom[] = [];
  let n = 101;
  for (const [type, price, count] of specs) {
    if (!price) continue;
    const id = `${type.toLowerCase()}-${n}`;
    rooms.push({
      id,
      floor: "1",
      room: String(n),
      type,
      beds: Array.from({ length: count }, (_, i) => ({
        id: `${id}-${i}`,
        label: count === 1 ? "Private" : `Bed ${String.fromCharCode(65 + i)}`,
        state: "available" as BedState,
        from: today,
        asking: price,
        target: Math.round(price * 0.94),
        floor: Math.round(price * 0.88),
      })),
    });
    n += 1;
  }
  return { rooms, lastCheckedAt: new Date().toISOString(), source: "manager" };
}

/* ------------------------------------------------------- price control */

export type PriceBand = "instant" | "specialist" | "approval";

export const PRICE_BAND_LABEL: Record<PriceBand, string> = {
  instant: "Team can close instantly",
  specialist: "Closing specialist can approve",
  approval: "Needs management approval",
};

export const PRICE_BAND_TONE: Record<PriceBand, string> = {
  instant: "border-emerald-400/40 bg-emerald-400/10 text-emerald-400",
  specialist: "border-amber-400/40 bg-amber-400/10 text-amber-400",
  approval: "border-rose-400/40 bg-rose-400/10 text-rose-400",
};

export function priceBand(quote: number, bed: Pick<Bed, "target" | "floor">): PriceBand {
  if (quote >= (bed.target || 0)) return "instant";
  if (quote >= (bed.floor || 0)) return "specialist";
  return "approval";
}

/** A bed whose ladder is broken (floor above target, target above asking). */
export function priceConflict(pg: PGX): boolean {
  return (pg.inventory?.rooms ?? []).some((r) =>
    r.beds.some((b) => b.asking > 0 && (b.floor > b.target || b.target > b.asking)),
  );
}

/* --------------------------------------------------------- sellability */

export type Verdict = "sell_now" | "caution" | "do_not_sell";

export interface Sellability {
  verdict: Verdict;
  score: number;
  reasons: string[];
  checks: { label: string; ok: boolean; note?: string }[];
}

export function sellability(pg: PGX, enabled: boolean): Sellability {
  const v = verifySummary(pg);
  const inv = invSummary(pg);
  const checks = [
    { label: "Data verified", ok: v.mandatoryOk, note: v.mandatoryOk ? "All mandatory sections green" : `${v.expired.length + v.changed.length + v.missing.length} sections open` },
    { label: "Beds available", ok: inv.availableNow + inv.next7 > 0, note: `${inv.availableNow} now · ${inv.next7} in 7d` },
    { label: "Inventory confirmed today", ok: inv.fresh, note: `checked ${inv.checkedAgo}` },
    { label: "Price confirmed", ok: sectionState(pg, "pricing") === "verified" && inv.floorPrice > 0 && !priceConflict(pg), note: inv.floorPrice ? `floor ₹${inv.floorPrice.toLocaleString("en-IN")}` : "no floor price" },
    { label: "Manager confirmed", ok: !!pg.manager?.phone && sectionState(pg, "safety") !== "missing", note: pg.manager?.name || "no manager on file" },
    { label: "Media valid", ok: (pg.media?.photos?.length ?? 0) > 0, note: `${pg.media?.photos?.length ?? 0} photos` },
    { label: "Enabled", ok: enabled, note: enabled ? "Active in Gharpayy" : "Disabled by admin" },
  ];
  const reasons = checks.filter((c) => !c.ok).map((c) => c.label);
  const score = Math.round((checks.filter((c) => c.ok).length / checks.length) * 100);
  const hard = !enabled || inv.availableNow + inv.next7 === 0 || priceConflict(pg) || sectionState(pg, "pricing") === "missing";
  const verdict: Verdict = hard ? "do_not_sell" : reasons.length === 0 ? "sell_now" : "caution";
  return { verdict, score, reasons, checks };
}

export const VERDICT_LABEL: Record<Verdict, string> = {
  sell_now: "SELL NOW",
  caution: "SELL WITH CAUTION",
  do_not_sell: "DO NOT SELL",
};

export const VERDICT_TONE: Record<Verdict, string> = {
  sell_now: "border-emerald-400/50 bg-emerald-400/10 text-emerald-400",
  caution: "border-amber-400/50 bg-amber-400/10 text-amber-400",
  do_not_sell: "border-rose-400/50 bg-rose-400/10 text-rose-400",
};

/* -------------------------------------------------------- health score */

export function healthScore(pg: PGX, enabled: boolean): number {
  const v = verifySummary(pg);
  const inv = invSummary(pg);
  const data = gapReport(pg).score;
  const priceFresh = sectionState(pg, "pricing") === "verified" ? 1 : sectionState(pg, "pricing") === "changed" ? 0.5 : 0;
  const invFresh = inv.fresh ? 1 : hoursSince(pg.inventory?.lastCheckedAt) < 72 ? 0.5 : 0;
  const media = Math.min(1, (pg.media?.photos?.length ?? 0) / 4);
  const mgr = pg.manager?.phone ? 1 : 0;
  const score =
    v.pct * 0.4 + data * 0.15 + priceFresh * 15 + invFresh * 20 + media * 5 + mgr * 5;
  return Math.max(0, Math.min(100, Math.round(score * (enabled ? 1 : 0.9))));
}

/* -------------------------------------------------------- control tower */

export interface TowerStats {
  properties: number;
  verified: number;
  sellable: number;
  beds: number;
  expired: number;
  priceConflicts: number;
  inventoryConflicts: number;
  disabled: number;
}

export interface TruthRow {
  pg: PGX;
  enabled: boolean;
  verify: VerifySummary;
  inv: InvSummary;
  sell: Sellability;
  health: number;
  avail: AvailClass;
}

export function truthRow(pg: PGX, enabled: boolean): TruthRow {
  const inv = invSummary(pg);
  return {
    pg,
    enabled,
    verify: verifySummary(pg),
    inv,
    avail: availClass(inv),
    sell: sellability(pg, enabled),
    health: healthScore(pg, enabled),
  };
}

export function towerStats(rows: TruthRow[]): TowerStats {
  return {
    properties: rows.length,
    verified: rows.filter((r) => r.verify.mandatoryOk).length,
    sellable: rows.filter((r) => r.sell.verdict === "sell_now").length,
    beds: rows.reduce((s, r) => s + r.inv.availableNow, 0),
    expired: rows.filter((r) => r.verify.expired.length > 0 || r.verify.changed.length > 0).length,
    priceConflicts: rows.filter((r) => priceConflict(r.pg)).length,
    inventoryConflicts: rows.filter((r) => (r.pg.inventory?.rooms?.length ?? 0) > 0 && !r.inv.fresh).length,
    disabled: rows.filter((r) => !r.enabled).length,
  };
}

export type TowerFilter =
  | "all"
  | "verified"
  | "sellable"
  | "beds"
  | "expired"
  | "price_conflicts"
  | "inventory_conflicts"
  | "disabled";

export function applyTowerFilter(rows: TruthRow[], f: TowerFilter): TruthRow[] {
  switch (f) {
    case "verified": return rows.filter((r) => r.verify.mandatoryOk);
    case "sellable": return rows.filter((r) => r.sell.verdict === "sell_now");
    case "beds": return rows.filter((r) => r.inv.availableNow > 0);
    case "expired": return rows.filter((r) => r.verify.expired.length > 0 || r.verify.changed.length > 0);
    case "price_conflicts": return rows.filter((r) => priceConflict(r.pg));
    case "inventory_conflicts": return rows.filter((r) => (r.pg.inventory?.rooms?.length ?? 0) > 0 && !r.inv.fresh);
    case "disabled": return rows.filter((r) => !r.enabled);
    default: return rows;
  }
}

/* ------------------------------------------------------------- history */

export function pushHistory(pg: PGX, entry: Omit<ChangeLog, "at">): PGX {
  const history = [{ at: new Date().toISOString(), ...entry }, ...(pg.history ?? [])].slice(0, 200);
  return { ...pg, history };
}

export function pushHistoryMany(pg: PGX, entries: Omit<ChangeLog, "at">[]): PGX {
  if (!entries.length) return pg;
  const at = new Date().toISOString();
  const history = [...entries.map((e) => ({ at, ...e })), ...(pg.history ?? [])].slice(0, 200);
  return { ...pg, history };
}

/* --------------------------------------------------- availability class */

export type AvailClass = "available" | "limited" | "waitlist" | "full";

export const AVAIL_CLASS_LABEL: Record<AvailClass, string> = {
  available: "Available",
  limited: "Limited",
  waitlist: "Waitlist",
  full: "Full",
};

export const AVAIL_CLASS_TONE: Record<AvailClass, string> = {
  available: "border-emerald-400/40 bg-emerald-400/10 text-emerald-400",
  limited: "border-amber-400/40 bg-amber-400/10 text-amber-400",
  waitlist: "border-sky-400/40 bg-sky-400/10 text-sky-400",
  full: "border-rose-400/40 bg-rose-400/10 text-rose-400",
};

/** Derive the four availability buckets straight from the bed grid. */
export function availClass(inv: InvSummary): AvailClass {
  if (inv.availableNow >= 3) return "available";
  if (inv.availableNow > 0) return "limited";
  if (inv.next30 > 0) return "waitlist";
  return "full";
}

/* -------------------------------------------------------- verify gates */

export interface Gate {
  ok: boolean;
  issues: string[];
}

/**
 * A property cannot be verified until every room has a complete, consistent
 * availability date and a last-best (floor) price per bed.
 */
export function inventoryGate(pg: PGX): Gate {
  const rooms = pg.inventory?.rooms ?? [];
  const issues: string[] = [];
  if (rooms.length === 0) issues.push("No room/bed inventory — seed it from the price list first");
  for (const r of rooms) {
    const where = `${r.floor ? `F${r.floor} ` : ""}${r.room || r.type || "room"}`;
    if (r.beds.length === 0) issues.push(`${where}: no beds added`);
    for (const b of r.beds) {
      const at = `${where} · ${b.label}`;
      if (b.state !== "occupied" && b.state !== "blocked" && !b.from) issues.push(`${at}: available-from date missing`);
      if (b.asking <= 0) issues.push(`${at}: asking price missing`);
      if (b.floor <= 0) issues.push(`${at}: last best price (floor) missing`);
      else if (b.target <= 0) issues.push(`${at}: target price missing`);
      else if (b.floor > b.target || b.target > b.asking) issues.push(`${at}: price ladder inconsistent (asking ≥ target ≥ floor)`);
    }
  }
  return { ok: issues.length === 0, issues };
}

/** Gate applied before a given section can be stamped verified. */
export function sectionGate(pg: PGX, sectionId: string): Gate {
  if (sectionId === "pricing") return inventoryGate(pg);
  if (!sectionFilled(pg, sectionId)) return { ok: false, issues: ["Section has no data yet — fill it before verifying"] };
  return { ok: true, issues: [] };
}

/** Gate applied before the whole property can be verified in one shot. */
export function propertyGate(pg: PGX): Gate {
  const issues = [...inventoryGate(pg).issues];
  for (const id of MANDATORY_SECTIONS) {
    if (!sectionFilled(pg, id)) {
      const label = VERIFY_SECTIONS.find((s) => s.id === id)?.label ?? id;
      issues.push(`${label}: no data on file`);
    }
  }
  return { ok: issues.length === 0, issues };
}

/* ----------------------------------------------------------- audit log */

const money = (n: number) => `₹${(n || 0).toLocaleString("en-IN")}`;

/** Diff two property docs and produce audit entries for price + availability moves. */
export function auditDiff(prev: PGX, next: PGX, by: string): Omit<ChangeLog, "at">[] {
  const out: Omit<ChangeLog, "at">[] = [];
  const index = (p: PGX) => {
    const m = new Map<string, { bed: Bed; where: string }>();
    for (const r of p.inventory?.rooms ?? []) {
      for (const b of r.beds) m.set(b.id, { bed: b, where: `${r.room || r.type} ${b.label}` });
    }
    return m;
  };
  const a = index(prev);
  const b = index(next);
  for (const [id, cur] of b) {
    const old = a.get(id);
    if (!old) { out.push({ by, what: `Bed added · ${cur.where}`, to: BED_STATE_LABEL[cur.bed.state] }); continue; }
    if (old.bed.state !== cur.bed.state || old.bed.from !== cur.bed.from) {
      out.push({
        by,
        what: `Availability changed · ${cur.where}`,
        from: `${BED_STATE_LABEL[old.bed.state]}${old.bed.from ? ` ${old.bed.from}` : ""}`,
        to: `${BED_STATE_LABEL[cur.bed.state]}${cur.bed.from ? ` ${cur.bed.from}` : ""}`,
      });
    }
    if (old.bed.asking !== cur.bed.asking || old.bed.target !== cur.bed.target || old.bed.floor !== cur.bed.floor) {
      out.push({
        by,
        what: `Price changed · ${cur.where}`,
        from: `${money(old.bed.asking)} → ${money(old.bed.target)} → ${money(old.bed.floor)}`,
        to: `${money(cur.bed.asking)} → ${money(cur.bed.target)} → ${money(cur.bed.floor)}`,
      });
    }
  }
  for (const [id, old] of a) if (!b.has(id)) out.push({ by, what: `Bed removed · ${old.where}` });

  const ca = availClass(invSummary(prev));
  const cb = availClass(invSummary(next));
  if (ca !== cb) out.push({ by, what: "Availability status", from: AVAIL_CLASS_LABEL[ca], to: AVAIL_CLASS_LABEL[cb] });
  return out;
}

/** Stamp every section verified (used by the row + bulk actions). */
export function verifyAllSections(pg: PGX, by: string, source: EvidenceSource): PGX {
  const now = new Date().toISOString();
  const sections: Record<string, Stamp> = { ...(pg.verification?.sections ?? {}) } as Record<string, Stamp>;
  for (const s of VERIFY_SECTIONS) {
    if (!sectionFilled(pg, s.id)) continue;
    sections[s.id] = { at: now, by, source, hash: sectionHash(pg, s.id) };
  }
  const withInv: PGX = {
    ...pg,
    verification: { ...pg.verification, sections, verifiedAt: now, verifiedBy: by },
    inventory: { ...(pg.inventory ?? { rooms: [] }), lastCheckedAt: now, lastCheckedBy: by, source },
  };
  return pushHistory(withInv, { by, what: "All sections verified", to: source });
}


/* ------------------------------------------------------- WhatsApp block */

export function truthBlock(row: TruthRow): string {
  const { pg, inv, verify, sell, health } = row;
  const money = inv.fromPrice ? `₹${inv.fromPrice.toLocaleString("en-IN")} onwards · floor ₹${inv.floorPrice.toLocaleString("en-IN")}` : "Pricing not confirmed";
  return [
    `${pg.name} — ${health}/100`,
    `${verify.mandatoryOk ? "✓ GHARPAYY VERIFIED" : `⚠ Verification ${verify.pct}%`} · ${VERDICT_LABEL[sell.verdict]} · ${row.enabled ? "Enabled" : "Disabled"}`,
    `${inv.availableNow} beds now · ${inv.next7} in 7 days${inv.earliest ? ` · earliest ${inv.earliest}` : ""}`,
    money,
    `Inventory checked ${inv.checkedAgo}`,
    sell.reasons.length ? `Open: ${sell.reasons.join(", ")}` : "",
  ].filter(Boolean).join("\n");
}
