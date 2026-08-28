// Stable, human-readable identity for every property document.
// The code never changes for a given property name, so it is safe to print in
// WhatsApp messages, CSV exports and agreements.
import type { PG } from "../data/types";
import { zoneOfPG, zoneMeta } from "./zones";

const B32 = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // Crockford-ish, no I/L/O/U

function hash4(input: string): string {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  let out = "";
  let n = h;
  for (let i = 0; i < 4; i += 1) {
    out = B32[n % 32] + out;
    n = Math.floor(n / 32);
  }
  return out;
}

/** Unique property ID, e.g. GP-KOR-7QF2 */
export function propertyCode(pg: Pick<PG, "name" | "area" | "locality" | "id">): string {
  const key = (pg.name || pg.id || "").trim().toUpperCase();
  if (!key) return "GP-XXX-0000";
  let zone = "GEN";
  try {
    zone = zoneMeta(zoneOfPG(pg as PG)).short || zoneOfPG(pg as PG);
  } catch {
    zone = "GEN";
  }
  return `GP-${zone.replace(/[^A-Z0-9]/gi, "").toUpperCase().slice(0, 4) || "GEN"}-${hash4(key)}`;
}

/** Zero-padded serial for lists: 1 -> "001" */
export function serialNo(index: number, width = 3): string {
  return String(index).padStart(width, "0");
}
