// Sellability layer — the single source of truth for "can we offer this PG?".
// Combines the four independent states: ENABLED · VERIFIED · AVAILABLE · SELLABLE.
import { useMemo } from "react";
import type { PG } from "../data/types";
import { useSupplyStore, type SupplyItem } from "./store";
import { isFullyVerified, verifiedSectionCount, VERIFY_SECTIONS, AVAIL_LABEL, type PGDoc, type AvailStatus } from "./verify";

export type BlockCode = "disabled" | "unverified" | "full" | "waitlist" | "availability-unknown";

export interface Blocker {
  code: BlockCode;
  label: string;
  /** Hard blockers stop a tour / quotation outright. */
  hard: boolean;
}

export interface Sellability {
  pg: PGDoc;
  enabled: boolean;
  verified: boolean;
  verifiedSections: number;
  totalSections: number;
  status: AvailStatus | null;
  /** Safe to show in the matcher / pitch to a lead. */
  matchable: boolean;
  /** Safe to book a tour or send a quotation. */
  sellable: boolean;
  blockers: Blocker[];
  reason: string;
}

export function sellability(item: { pg: PG; enabled: boolean }): Sellability {
  const pg = item.pg as PGDoc;
  const verified = isFullyVerified(pg);
  const status = pg.availability?.status ?? null;
  const blockers: Blocker[] = [];

  if (!item.enabled) blockers.push({ code: "disabled", label: "Disabled in Supply Hub", hard: true });
  if (!verified) blockers.push({ code: "unverified", label: "Not fully verified", hard: true });
  if (status === "full") blockers.push({ code: "full", label: "Full — no beds", hard: true });
  if (status === "waitlist") blockers.push({ code: "waitlist", label: "Waitlist only", hard: false });
  if (!status) blockers.push({ code: "availability-unknown", label: "Availability not set", hard: false });

  const hard = blockers.some((b) => b.hard);
  return {
    pg,
    enabled: item.enabled,
    verified,
    verifiedSections: verifiedSectionCount(pg),
    totalSections: VERIFY_SECTIONS.length,
    status,
    matchable: blockers.length === 0,
    sellable: !hard,
    blockers,
    reason: blockers.length ? blockers.map((b) => b.label).join(" · ") : `${status ? AVAIL_LABEL[status] : "Ready"} · verified`,
  };
}

export const nameKey = (n: string) => (n || "").trim().toUpperCase();

/** Live supply with the sellability verdict attached. */
export function useSellableSupply() {
  const store = useSupplyStore();

  const verdicts = useMemo(() => store.items.map((i: SupplyItem) => sellability(i)), [store.items]);

  const byName = useMemo(() => {
    const m = new Map<string, Sellability>();
    for (const v of verdicts) {
      m.set(nameKey(v.pg.name), v);
      if (v.pg.actualName) m.set(nameKey(v.pg.actualName), v);
      if (v.pg.id) m.set(nameKey(v.pg.id), v);
    }
    return m;
  }, [verdicts]);

  const matchablePGs = useMemo(() => verdicts.filter((v) => v.matchable).map((v) => v.pg as PG), [verdicts]);
  const sellablePGs = useMemo(() => verdicts.filter((v) => v.sellable).map((v) => v.pg as PG), [verdicts]);

  /** Guard a tour / quotation against a property name. */
  const guard = useMemo(
    () =>
      (property?: string | null): { ok: boolean; reason: string; verdict: Sellability | null } => {
        if (!property) return { ok: true, reason: "", verdict: null };
        const v = byName.get(nameKey(property));
        if (!v) return { ok: true, reason: "", verdict: null };
        if (v.sellable) return { ok: true, reason: v.reason, verdict: v };
        return {
          ok: false,
          reason: `${v.pg.name} is blocked: ${v.blockers.filter((b) => b.hard).map((b) => b.label).join(" · ")}`,
          verdict: v,
        };
      },
    [byName],
  );

  return { ...store, verdicts, byName, matchablePGs, sellablePGs, guard };
}
