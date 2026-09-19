// Deep layer of the Admin Draft Control room.
// Everything here is derived from the same company record: no invented numbers.
import type { ControlData } from "@/lib/admin-control/data.functions";
import type { Derived, CustomerRow } from "./derive";

const now = () => Date.now();
const ts = (v?: string | null) => (v ? Date.parse(v) : 0);
const hrs = (ms: number) => ms / 3_600_000;

/** Rough commercial weight per stage, used only to rank what is worth saving first. */
const STAGE_VALUE: Record<string, number> = {
  NEW: 1000,
  CONTACTED: 2000,
  QUALIFIED: 5000,
  MATCHED: 8000,
  TOUR_SCHEDULED: 14000,
  TOUR_DONE: 18000,
  QUOTATION: 22000,
  NEGOTIATION: 25000,
  BOOKING_REQUESTED: 30000,
  BOOKED: 0,
};
const valueOf = (r: CustomerRow) => STAGE_VALUE[r.stage] ?? 3000;

export const SLA_BANDS: Array<[string, number, number]> = [
  ["On time", -1e9, 0],
  ["Late < 1h", 0, 60],
  ["Late 1–4h", 60, 240],
  ["Late 4–24h", 240, 1440],
  ["Late 1–3 days", 1440, 4320],
  ["Late 3 days +", 4320, 1e9],
];

export const AGE_BANDS: Array<[string, number, number]> = [
  ["Touched < 4h", 0, 4],
  ["4–12h", 4, 12],
  ["12–24h", 12, 24],
  ["1–3 days", 24, 72],
  ["3–7 days", 72, 168],
  ["Older than 7 days", 168, 1e9],
];

export interface Deep {
  sla: Array<{ band: string; count: number; value: number }>;
  aging: Array<{ band: string; count: number; red: number; unowned: number }>;
  heat: { hours: number[]; weekdays: Array<{ day: string; counts: number[]; total: number }> };
  zones: Array<{
    zone: string; customers: number; red: number; overdue: number; unowned: number;
    avgOverdue: number; rows: number; value: number;
  }>;
  accuracy: {
    bands: Array<{ band: string; rows: number }>;
    missingPhone: number;
    manualNeeded: number;
    duplicatePhones: Array<{ phone: string; names: string[] }>;
    labelled: number;
    unlabelled: number;
    incoming: number;
    outgoing: number;
  };
  compliance: Array<{ field: string; filled: number; missing: number; pct: number }>;
  bottlenecks: Array<{
    stage: string; customers: number; avgIdleH: number; worstIdleH: number; overdue: number; unowned: number;
  }>;
  balance: Array<{
    person: string; holding: number; red: number; overdue: number; unread: number;
    share: number; load: "overloaded" | "balanced" | "light";
  }>;
  value: { atRisk: number; safe: number; topRisk: CustomerRow[] };
  mix: Array<{ bucket: string; count: number; red: number }>;
  forecast: { next2h: number; today: number; tomorrow: number; later: number; missing: number };
  anomalies: Array<{ severity: "high" | "medium"; what: string; detail: string }>;
  duplicatesCount: number;
}

export function deepen(data: ControlData, d: Derived): Deep {
  const rows = d.rows;
  const t = now();

  /* SLA ladder ------------------------------------------------------- */
  const sla = SLA_BANDS.map(([band, lo, hi]) => {
    const inBand = rows.filter((r) => {
      const late = r.nextActionAt ? Math.round((t - r.nextActionAt) / 60000) : 0;
      if (!r.nextActionAt) return false;
      return late > lo && late <= hi;
    });
    return { band, count: inBand.length, value: inBand.reduce((s, r) => s + valueOf(r), 0) };
  });

  /* Aging cohorts ---------------------------------------------------- */
  const aging = AGE_BANDS.map(([band, lo, hi]) => {
    const inBand = rows.filter((r) => {
      const age = hrs(t - Math.max(r.lastObsAt, r.lastActionAt));
      return Number.isFinite(age) && age >= lo && age < hi;
    });
    return {
      band,
      count: inBand.length,
      red: inBand.filter((r) => r.health === "RED").length,
      unowned: inBand.filter((r) => !r.owned).length,
    };
  });

  /* Hour × weekday heat of WhatsApp evidence ------------------------- */
  const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const grid = DAYS.map(() => new Array(24).fill(0) as number[]);
  d.observations.forEach((o) => {
    const at = ts(o.capturedAt);
    if (!at) return;
    const dt = new Date(at);
    grid[dt.getDay()]![dt.getHours()] += 1;
  });
  const heat = {
    hours: Array.from({ length: 24 }, (_, h) => grid.reduce((s, r) => s + r[h]!, 0)),
    weekdays: DAYS.map((day, i) => ({ day, counts: grid[i]!, total: grid[i]!.reduce((s, n) => s + n, 0) })),
  };

  /* Zones ------------------------------------------------------------ */
  const zoneMap = new Map<string, CustomerRow[]>();
  rows.forEach((r) => {
    const z = r.zone || "Unknown area";
    zoneMap.set(z, [...(zoneMap.get(z) ?? []), r]);
  });
  const zones = [...zoneMap.entries()]
    .map(([zone, rs]) => {
      const late = rs.filter((r) => r.overdueMins > 0);
      return {
        zone,
        customers: rs.length,
        red: rs.filter((r) => r.health === "RED").length,
        overdue: late.length,
        unowned: rs.filter((r) => !r.owned).length,
        avgOverdue: late.length ? Math.round(late.reduce((s, r) => s + r.overdueMins, 0) / late.length) : 0,
        rows: rs.reduce((s, r) => s + r.obsCount, 0),
        value: rs.reduce((s, r) => s + valueOf(r), 0),
      };
    })
    .sort((a, b) => b.red - a.red || b.overdue - a.overdue || b.customers - a.customers);

  /* Reading accuracy and identity quality ---------------------------- */
  const obs = d.observations;
  const band = (lo: number, hi: number) => obs.filter((o) => (o.ocrConfidence ?? 0) >= lo && (o.ocrConfidence ?? 0) < hi).length;
  const phoneNames = new Map<string, Set<string>>();
  obs.forEach((o) => {
    const p = (o.phone ?? "").replace(/\D/g, "").slice(-10);
    if (p.length !== 10) return;
    const set = phoneNames.get(p) ?? new Set<string>();
    if (o.contactName) set.add(o.contactName);
    phoneNames.set(p, set);
  });
  const duplicatePhones = [...phoneNames.entries()]
    .filter(([, names]) => names.size > 1)
    .slice(0, 40)
    .map(([phone, names]) => ({ phone, names: [...names] }));

  const accuracy = {
    bands: [
      { band: "95–100% — trusted", rows: band(95, 101) },
      { band: "85–95%", rows: band(85, 95) },
      { band: "70–85% — check", rows: band(70, 85) },
      { band: "Below 70% — re-read", rows: band(0, 70) },
    ],
    missingPhone: obs.filter((o) => !(o.phone ?? "").replace(/\D/g, "")).length,
    manualNeeded: obs.filter((o) => o.state === "needs_review" && !(o.phone ?? "")).length,
    duplicatePhones,
    labelled: obs.filter((o) => o.label).length,
    unlabelled: obs.filter((o) => !o.label).length,
    incoming: obs.filter((o) => (o.direction ?? "") === "in").length,
    outgoing: obs.filter((o) => (o.direction ?? "") === "out").length,
  };

  /* Mandatory-field compliance -------------------------------------- */
  const leadById = new Map(data.leads.map((l) => [l.id, l]));
  const field = (label: string, ok: (r: CustomerRow) => boolean) => {
    const filled = rows.filter(ok).length;
    return { field: label, filled, missing: rows.length - filled, pct: rows.length ? Math.round((filled / rows.length) * 100) : 0 };
  };
  const compliance = [
    field("Customer name", (r) => r.name !== "Unknown" && r.name.trim().length > 1),
    field("Phone number", (r) => r.phone.replace(/\D/g, "").length >= 10),
    field("WhatsApp source", (r) => r.wa !== "—"),
    field("Current owner", (r) => r.owned),
    field("Current stage", (r) => Boolean(r.stage)),
    field("Journey step", (r) => r.journeyStep !== "—"),
    field("Next action", (r) => Boolean(r.nextActionKind)),
    field("Next-action deadline", (r) => r.nextActionAt > 0),
    field("Last activity", (r) => r.lastActionAt > 0 || r.lastObsAt > 0),
    field("Conversation type", (r) => r.bucket !== "—"),
    field("Area / zone", (r) => r.zone !== "—" && r.zone !== "Unknown area"),
    field("Reason if stuck", (r) => Boolean(leadById.get(r.id)?.blocker) || r.health !== "RED"),
  ];

  /* Stage bottlenecks ----------------------------------------------- */
  const stageMap = new Map<string, CustomerRow[]>();
  rows.forEach((r) => stageMap.set(r.stage, [...(stageMap.get(r.stage) ?? []), r]));
  const bottlenecks = [...stageMap.entries()]
    .map(([stage, rs]) => {
      const idle = rs.map((r) => hrs(t - Math.max(r.lastActionAt, r.lastObsAt))).filter((n) => Number.isFinite(n) && n > 0);
      return {
        stage,
        customers: rs.length,
        avgIdleH: idle.length ? Math.round(idle.reduce((s, n) => s + n, 0) / idle.length) : 0,
        worstIdleH: idle.length ? Math.round(Math.max(...idle)) : 0,
        overdue: rs.filter((r) => r.overdueMins > 0).length,
        unowned: rs.filter((r) => !r.owned).length,
      };
    })
    .sort((a, b) => b.avgIdleH - a.avgIdleH);

  /* Workload balance ------------------------------------------------ */
  const held = rows.filter((r) => r.owned);
  const personMap = new Map<string, CustomerRow[]>();
  held.forEach((r) => personMap.set(r.handler, [...(personMap.get(r.handler) ?? []), r]));
  const avgHold = personMap.size ? held.length / personMap.size : 0;
  const balance = [...personMap.entries()]
    .map(([person, rs]) => ({
      person,
      holding: rs.length,
      red: rs.filter((r) => r.health === "RED").length,
      overdue: rs.filter((r) => r.overdueMins > 0).length,
      unread: rs.reduce((s, r) => s + r.unread, 0),
      share: held.length ? Math.round((rs.length / held.length) * 100) : 0,
      load: (rs.length > avgHold * 1.25 ? "overloaded" : rs.length < avgHold * 0.75 ? "light" : "balanced") as
        | "overloaded" | "balanced" | "light",
    }))
    .sort((a, b) => b.holding - a.holding);

  /* Value at risk --------------------------------------------------- */
  const risky = rows.filter((r) => r.health === "RED" || r.health === "AMBER");
  const value = {
    atRisk: risky.reduce((s, r) => s + valueOf(r), 0),
    safe: rows.filter((r) => r.health === "GREEN").reduce((s, r) => s + valueOf(r), 0),
    topRisk: [...risky].sort((a, b) => valueOf(b) - valueOf(a) || b.overdueMins - a.overdueMins).slice(0, 25),
  };

  /* Conversation mix ------------------------------------------------ */
  const bucketMap = new Map<string, CustomerRow[]>();
  rows.forEach((r) => bucketMap.set(r.bucket, [...(bucketMap.get(r.bucket) ?? []), r]));
  const mix = [...bucketMap.entries()]
    .map(([bucket, rs]) => ({ bucket, count: rs.length, red: rs.filter((r) => r.health === "RED").length }))
    .sort((a, b) => b.count - a.count);

  /* What is due next ------------------------------------------------ */
  const endToday = new Date(); endToday.setHours(23, 59, 59, 999);
  const endTomorrow = endToday.getTime() + 86400000;
  const forecast = {
    next2h: rows.filter((r) => r.nextActionAt > t && r.nextActionAt <= t + 2 * 3600_000).length,
    today: rows.filter((r) => r.nextActionAt > t && r.nextActionAt <= endToday.getTime()).length,
    tomorrow: rows.filter((r) => r.nextActionAt > endToday.getTime() && r.nextActionAt <= endTomorrow).length,
    later: rows.filter((r) => r.nextActionAt > endTomorrow).length,
    missing: rows.filter((r) => !r.nextActionAt).length,
  };

  /* Anomalies ------------------------------------------------------- */
  const anomalies: Deep["anomalies"] = [];
  d.accounts.forEach((a) => {
    if (a.drops > 0) anomalies.push({ severity: "high", what: `${a.wa}: ${a.drops} rows never accounted`, detail: "Rows were visible in the screenshot but never became customers." });
    if (a.review > 20) anomalies.push({ severity: "medium", what: `${a.wa}: ${a.review} rows waiting for a decision`, detail: "Somebody must accept, merge or mark these as not a customer." });
    if (a.lastAt && hrs(t - a.lastAt) > 12) anomalies.push({ severity: "medium", what: `${a.wa}: no upload for ${Math.round(hrs(t - a.lastAt))}h`, detail: "Four checkpoint uploads a day are expected per account." });
  });
  d.operators.forEach((o) => {
    if (o.assigned > 0 && o.donePct < 40) anomalies.push({ severity: "high", what: `${o.operator} finished only ${o.donePct}% of ${o.assigned}`, detail: "Batch will not close on time; reassign or extend." });
    if (o.red > 5) anomalies.push({ severity: "medium", what: `${o.operator} holds ${o.red} red customers`, detail: "Too many broken customers with one person." });
  });
  bottlenecks.slice(0, 3).forEach((b) => {
    if (b.avgIdleH > 48 && b.customers > 3) anomalies.push({ severity: "high", what: `${b.stage} is stalling — average ${b.avgIdleH}h with no movement`, detail: `${b.overdue} overdue, ${b.unowned} with nobody on them.` });
  });
  if (d.kpi.unownedActive > 0) anomalies.push({ severity: "high", what: `${d.kpi.unownedActive} active customers have no owner`, detail: "These belong in Control Tower until someone claims them." });
  if (accuracy.duplicatePhones.length) anomalies.push({ severity: "medium", what: `${accuracy.duplicatePhones.length} numbers read under more than one name`, detail: "Likely the same customer saved twice; merge them." });
  balance.filter((b) => b.load === "overloaded").forEach((b) =>
    anomalies.push({ severity: "medium", what: `${b.person} holds ${b.share}% of all owned customers`, detail: "Spread the load before SLAs break." }));

  return {
    sla, aging, heat, zones, accuracy, compliance, bottlenecks, balance, value, mix, forecast,
    anomalies: anomalies.slice(0, 40),
    duplicatesCount: accuracy.duplicatePhones.length,
  };
}

export const money = (n: number) =>
  n >= 10_000_000 ? `₹${(n / 10_000_000).toFixed(2)} Cr` : n >= 100_000 ? `₹${(n / 100_000).toFixed(2)} L` : `₹${Math.round(n).toLocaleString("en-IN")}`;
