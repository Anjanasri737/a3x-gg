// Supply Hub document store — every property is one Mongo-style document
// persisted in the `supply_properties` collection (jsonb `doc`).
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PGS } from "../data/pgs";
import type { PG } from "../data/types";

export interface SupplyDocRow {
  id: string;
  key: string;
  doc: Partial<PG> & { messages?: Record<string, string> };
  enabled: boolean;
  source: string;
  notes: string | null;
  updated_at: string;
}

export const docKey = (name: string) => name.trim().toUpperCase();

const EMPTY_PRICES = { min: 0, max: 0, single: 0, double: 0, triple: 0 };

export function blankPG(): PG {
  return {
    id: "",
    name: "",
    actualName: "",
    area: "",
    locality: "",
    gender: "Co-live",
    tier: "Mid",
    audience: "Both",
    prices: { ...EMPTY_PRICES },
    rooms: "",
    furnishing: "",
    amenities: [],
    safety: [],
    foodType: "",
    mealsIncluded: "",
    utilities: "",
    cleaning: "",
    noise: "",
    vibe: "",
    rules: "",
    lows: "",
    deposit: "",
    minStay: "",
    usp: "",
    manager: { name: "", phone: "" },
    owner: { name: "", phone: "" },
    groupName: "",
    mapsLink: "",
    wa_card: "",
    location_card: "",
    landmarksInline: [],
    lat: null,
    lng: null,
    nearbyLandmarks: [],
    iq: 0,
    iqBreakdown: {},
    persona: {
      archetype: "",
      ageRange: "",
      salary: "",
      likelyCompanies: "",
      painPoints: [],
      pitchAngle: [],
      qualifyingQuestions: [],
      doNot: [],
      decisionMaker: "",
      conversionProbability: "",
    },
    scripts: {
      call1: { goal: "", opening: "", questions: [], hook: "", close: "" },
      call2: { goal: "", objections: [] },
      pitch: { location: "", lifestyle: "", priceClose: "", closeQuestion: "" },
      money: { breakdown: [], payLater: "", depositObjection: "", checklist: [] },
    },
  };
}

export interface SupplyItem {
  pg: PG;
  enabled: boolean;
  source: "catalog" | "admin";
  notes: string | null;
  updatedAt: string | null;
}

export function useSupplyStore() {
  const [rows, setRows] = useState<SupplyDocRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error: err } = await supabase
      .from("supply_properties")
      .select("id, key, doc, enabled, source, notes, updated_at");
    if (err) setError(err.message);
    else {
      setError(null);
      setRows((data ?? []) as unknown as SupplyDocRow[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const items = useMemo<SupplyItem[]>(() => {
    const byKey = new Map(rows.map((r) => [r.key, r]));
    const out: SupplyItem[] = PGS.map((pg) => {
      const row = byKey.get(docKey(pg.name));
      if (!row) return { pg, enabled: true, source: "catalog" as const, notes: null, updatedAt: null };
      byKey.delete(docKey(pg.name));
      return {
        pg: { ...pg, ...(row.doc as Partial<PG>) } as PG,
        enabled: row.enabled,
        source: "catalog" as const,
        notes: row.notes,
        updatedAt: row.updated_at,
      };
    });
    for (const row of byKey.values()) {
      const doc = row.doc as Partial<PG>;
      out.push({
        pg: { ...blankPG(), ...doc, id: doc.id || row.key.replace(/[^A-Z0-9]+/g, "_"), name: doc.name || row.key } as PG,
        enabled: row.enabled,
        source: "admin",
        notes: row.notes,
        updatedAt: row.updated_at,
      });
    }
    return out;
  }, [rows]);

  const setEnabled = useCallback(
    async (pg: PG, enabled: boolean, notes?: string) => {
      const key = docKey(pg.name);
      // PATCH FIRST: an upsert would replace `doc` and silently wipe the saved
      // verification, inventory and alternate-property data for this property.
      const patch: { enabled: boolean; notes?: string | null } = { enabled };
      if (notes !== undefined) patch.notes = notes;
      const { data, error: err } = await supabase
        .from("supply_properties")
        .update(patch)
        .eq("key", key)
        .select("key");
      if (err) return { ok: false, error: err.message };
      if (!data || data.length === 0) {
        // No row yet for this catalog property — create one without a doc body.
        const { error: err2 } = await supabase
          .from("supply_properties")
          .insert({ key, enabled, notes: notes ?? null, doc: {}, source: "catalog" });
        if (err2) return { ok: false, error: err2.message };
      }
      await load();
      return { ok: true as const };
    },
    [load],
  );

  const saveDoc = useCallback(
    async (pg: PG, opts?: { enabled?: boolean; source?: string; notes?: string | null }) => {
      const key = docKey(pg.name);
      if (!key) return { ok: false, error: "Property name is required" };
      const existing = rows.find((r) => r.key === key);
      const payload = {
        key,
        doc: JSON.parse(JSON.stringify(pg)) as never,
        enabled: opts?.enabled ?? existing?.enabled ?? true,
        source: opts?.source ?? existing?.source ?? "admin",
        notes: opts?.notes ?? existing?.notes ?? null,
      };
      const { error: err } = await supabase.from("supply_properties").upsert(payload, { onConflict: "key" });
      if (err) return { ok: false, error: err.message };
      await load();
      return { ok: true as const };
    },
    [rows, load],
  );

  const removeDoc = useCallback(
    async (key: string) => {
      const { error: err } = await supabase.from("supply_properties").delete().eq("key", key);
      if (err) return { ok: false, error: err.message };
      await load();
      return { ok: true as const };
    },
    [load],
  );

  return { items, rows, loading, error, reload: load, setEnabled, saveDoc, removeDoc };
}

/** Enabled-only view for matcher / sharing surfaces. */
export function enabledOnly(items: SupplyItem[]) {
  return items.filter((i) => i.enabled).map((i) => i.pg);
}
