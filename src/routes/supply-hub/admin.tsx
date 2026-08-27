import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { useSupplyStore, blankPG, docKey, type SupplyItem } from "@/supply-hub/lib/store";
import { gapReport, gapsCsv, gapReports } from "@/supply-hub/lib/gaps";
import { MessageKitPanel, CopyButton } from "@/components/supply/MessageKit";
import type { PG, Gender, Tier } from "@/supply-hub/data/types";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Search, Plus, Download, AlertTriangle, Database, Power, Pencil, Map, Settings2, ArrowUp, ArrowDown, Trash2, RotateCcw, Merge, BadgeCheck, ShieldCheck, CalendarClock } from "lucide-react";
import {
  zoneOfPG, zoneCounts, zoneMeta, zonePlan, useZones, UNMAPPED, ZONE_ACCENTS,
  type ZoneDef,
} from "@/supply-hub/lib/zones";
import { PropertyCommandCenter } from "@/supply-hub/components/PropertyCommandCenter";
import {
  VERDICT_LABEL, VERDICT_TONE, applyTowerFilter, towerStats, truthBlock, truthRow,
  type PGX, type TowerFilter, type TruthRow,
} from "@/supply-hub/lib/truth";

export const Route = createFileRoute("/supply-hub/admin")({
  head: () => ({
    meta: [
      { title: "Supply Hub Admin — Property Control | Gharpayy" },
      { name: "description", content: "Enable or disable any PG, add new properties, fix missing data and copy exact location, pricing and amenity messages." },
      { property: "og:title", content: "Supply Hub Admin — Property Control" },
      { property: "og:description", content: "One console to add, enable, disable and complete every Gharpayy property." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SupplyAdmin,
});

const GENDERS: Gender[] = ["Boys", "Girls", "Co-live"];
const TIERS: Tier[] = ["Premium", "Mid", "Budget"];

function SupplyAdmin() {
  const { items, loading, error, setEnabled, saveDoc, removeDoc } = useSupplyStore();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | "enabled" | "disabled">("all");
  const [area, setArea] = useState("All");
  const [onlyGaps, setOnlyGaps] = useState(false);
  const [zone, setZone] = useState<string>("All");
  const [zoneMgr, setZoneMgr] = useState(false);
  const { zones, addZone, upsertZone, removeZone, moveZone, resetZones, renameZone, mergeZones, setZoneOverride } = useZones();
  const zoneIds = useMemo(() => [...zones.map((z) => z.id), UNMAPPED], [zones]);
  const [editing, setEditing] = useState<PG | null>(null);
  const [msgFor, setMsgFor] = useState<PG | null>(null);
  const [cmdKey, setCmdKey] = useState<string | null>(null);
  const [tower, setTower] = useState<TowerFilter>("all");

  const areas = useMemo(
    () => ["All", ...Array.from(new Set(items.map((i) => i.pg.area).filter(Boolean))).sort()],
    [items],
  );

  const truth = useMemo(
    () => items.map((i) => ({ item: i, truth: truthRow(i.pg as PGX, i.enabled), gap: gapReport(i.pg) })),
    [items],
  );

  const stats = useMemo(() => towerStats(truth.map((t) => t.truth)), [truth]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const keep = new Set(applyTowerFilter(truth.map((t) => t.truth), tower).map((r) => r.pg.name));
    return truth
      .map((t) => ({ ...t.item, gap: t.gap, truth: t.truth }))
      .filter((i) => {
        if (!keep.has(i.pg.name)) return false;
        if (status === "enabled" && !i.enabled) return false;
        if (status === "disabled" && i.enabled) return false;
        if (area !== "All" && i.pg.area !== area) return false;
        if (zone !== "All" && zoneOfPG(i.pg) !== zone) return false;
        if (onlyGaps && i.gap.missing.length === 0) return false;
        if (!needle) return true;
        return [i.pg.name, i.pg.actualName, i.pg.area, i.pg.locality].join(" ").toLowerCase().includes(needle);
      })
      .sort((a, b) => b.truth.health - a.truth.health);
  }, [truth, q, status, area, zone, onlyGaps, zones, tower]);

  const cmd = useMemo(() => items.find((i) => i.pg.name === cmdKey) ?? null, [items, cmdKey]);

  const zoneRows = useMemo(() => {
    const all = zoneCounts(items.map((i) => i.pg));
    const live = zoneCounts(items.filter((i) => i.enabled).map((i) => i.pg));
    return zoneIds.filter((z) => (all[z] || 0) > 0).map((z) => ({ zone: z, plan: zonePlan(z, all[z]), live: live[z] || 0, off: (all[z] || 0) - (live[z] || 0) }));
  }, [items, zoneIds, zones]);

  const bulkZone = async (z: string, v: boolean) => {
    const targets = items.filter((i) => zoneOfPG(i.pg) === z && i.enabled !== v);
    if (!targets.length) { toast.info("Nothing to change in this zone"); return; }
    let failed = 0;
    for (const t of targets) {
      const res = await setEnabled(t.pg, v);
      if (!res.ok) failed += 1;
    }
    if (failed) toast.error(`${failed} of ${targets.length} could not update`);
    else toast.success(`${targets.length} properties ${v ? "enabled" : "disabled"} in ${z}`);
  };

  const exportGaps = () => {
    const csv = gapsCsv(gapReports(items.map((i) => i.pg)));
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "gharpayy-supply-gaps.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-accent font-semibold mb-1 flex items-center gap-1.5">
              <Database className="h-3 w-3" /> Supply Hub · document store
            </div>
            <h1 className="font-display text-2xl font-semibold tracking-tight">Property Control</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Every property is one document. Toggle sold-out PGs off in a click, add new ones in seconds, and copy the exact customer messages.
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={exportGaps} className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted">
              <Download className="h-4 w-4" /> Missing-info sheet
            </button>
            <button
              onClick={() => setEditing(blankPG())}
              className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-2 text-sm font-medium text-accent-foreground hover:opacity-90"
            >
              <Plus className="h-4 w-4" /> Add property
            </button>
          </div>
        </header>

        {error && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</div>
        )}

        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold inline-flex items-center gap-1.5"><Map className="h-4 w-4 text-accent" /> Zone control</h2>
            <div className="flex items-center gap-2">
              <button onClick={() => setZoneMgr(true)} className="inline-flex items-center gap-1 text-[11px] rounded-md border border-border px-2 py-1 hover:bg-muted">
                <Settings2 className="h-3 w-3" /> Manage zones
              </button>
              <button onClick={() => setZone("All")} className={cn("text-[11px] rounded-md border px-2 py-1", zone === "All" ? "border-accent text-accent" : "border-border text-muted-foreground hover:bg-muted")}>All zones</button>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
            {zoneRows.map(({ zone: z, plan, live, off }) => (
              <div key={z} className={cn("rounded-lg border bg-card p-3", zone === z && "border-accent ring-1 ring-accent/30")}>
                <button onClick={() => setZone(zone === z ? "All" : z)} className="w-full text-left">
                  <div className="flex items-center justify-between gap-2">
                    <span className={cn("rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider", plan.accent)}>{z}</span>
                    <span className="font-display text-lg font-semibold">{live}<span className="text-xs text-muted-foreground">/{plan.properties}</span></span>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground truncate">{plan.cluster}</div>
                  <div className="mt-1 text-[10px] text-muted-foreground">{off} disabled · {plan.coverageQs} coverage Qs · {plan.mcqSets}</div>
                </button>
                <div className="mt-2 flex gap-2">
                  <button onClick={() => void bulkZone(z, true)} className="flex-1 rounded-md border border-border px-2 py-1 text-[11px] font-medium hover:bg-muted">Enable all</button>
                  <button onClick={() => void bulkZone(z, false)} className="flex-1 rounded-md border border-destructive/40 px-2 py-1 text-[11px] font-medium text-destructive hover:bg-destructive/10">Disable all</button>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-2">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold inline-flex items-center gap-1.5"><ShieldCheck className="h-4 w-4 text-accent" /> Control tower</h2>
            <span className="text-[11px] text-muted-foreground">Every number is clickable — it filters the list below.</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-2">
            {([
              { f: "all", label: "Properties", value: stats.properties, tone: "" },
              { f: "verified", label: "Verified", value: stats.verified, tone: "text-emerald-400" },
              { f: "sellable", label: "Sellable now", value: stats.sellable, tone: "text-emerald-400" },
              { f: "beds", label: "Beds available", value: stats.beds, tone: "text-sky-400" },
              { f: "expired", label: "Verification expired", value: stats.expired, tone: "text-amber-400" },
              { f: "price_conflicts", label: "Price conflicts", value: stats.priceConflicts, tone: "text-rose-400" },
              { f: "inventory_conflicts", label: "Inventory stale", value: stats.inventoryConflicts, tone: "text-amber-400" },
              { f: "disabled", label: "Disabled", value: stats.disabled, tone: "text-muted-foreground" },
            ] as { f: TowerFilter; label: string; value: number; tone: string }[]).map((s) => (
              <button
                key={s.f}
                onClick={() => setTower(tower === s.f ? "all" : s.f)}
                className={cn("rounded-lg border bg-card p-3 text-left hover:bg-muted/50", tower === s.f && "border-accent ring-1 ring-accent/30")}
              >
                <div className={cn("font-display text-2xl font-semibold", s.tone)}>{s.value}</div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">{s.label}</div>
              </button>
            ))}
          </div>
        </section>

        <div className="rounded-lg border bg-card p-3 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search property, actual name, area, locality"
              className="w-full rounded-md border border-border bg-background pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"
            />
          </div>
          <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className="rounded-md border border-border bg-background px-2 py-1.5 text-sm">
            <option value="all">All statuses</option>
            <option value="enabled">Enabled</option>
            <option value="disabled">Disabled</option>
          </select>
          <select value={zone} onChange={(e) => setZone(e.target.value)} className="rounded-md border border-border bg-background px-2 py-1.5 text-sm">
            <option value="All">All zones</option>
            {zoneIds.map((z) => <option key={z} value={z}>{z}</option>)}
          </select>
          <select value={area} onChange={(e) => setArea(e.target.value)} className="rounded-md border border-border bg-background px-2 py-1.5 text-sm">
            {areas.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <label className="inline-flex items-center gap-2 text-xs">
            <input type="checkbox" checked={onlyGaps} onChange={(e) => setOnlyGaps(e.target.checked)} /> Only missing info
          </label>
          <div className="ml-auto text-xs text-muted-foreground">{loading ? "Syncing…" : `${rows.length} shown`}</div>
        </div>

        <div className="rounded-lg border bg-card divide-y">
          {rows.slice(0, 120).map((item) => (
            <PropertyRow
              key={item.pg.id || item.pg.name}
              item={item}
              onToggle={async (v) => {
                const res = await setEnabled(item.pg, v);
                if (!res.ok) toast.error(res.error ?? "Could not update");
                else toast.success(`${item.pg.name} ${v ? "enabled" : "disabled"}`);
              }}
              onEdit={() => setEditing(item.pg)}
              onVerify={() => setCmdKey(item.pg.name)}
              onMessages={() => setMsgFor(item.pg)}
              zoneIds={zoneIds}
              onZone={(z) => { setZoneOverride(item.pg, z); toast.success(z ? `${item.pg.name} → ${z}` : `${item.pg.name} → auto zone`); }}
            />
          ))}
          {rows.length === 0 && !loading && <div className="p-8 text-center text-sm text-muted-foreground">No properties match these filters.</div>}
        </div>
      </div>

      <Dialog open={zoneMgr} onOpenChange={setZoneMgr}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Manage zones</DialogTitle></DialogHeader>
          <ZoneManager
            zones={zones}
            onAdd={addZone}
            onSave={upsertZone}
            onRemove={removeZone}
            onMove={moveZone}
            onReset={resetZones}
            onRename={renameZone}
            onMerge={mergeZones}
          />

        </DialogContent>
      </Dialog>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing?.name ? `Edit ${editing.name}` : "Add new property"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <PropertyForm
              initial={editing}
              onCancel={() => setEditing(null)}
              onDelete={
                items.find((i) => docKey(i.pg.name) === docKey(editing.name))?.source === "admin"
                  ? async () => {
                      const res = await removeDoc(docKey(editing.name));
                      if (res.ok) { toast.success("Property removed"); setEditing(null); }
                      else toast.error(res.error ?? "Could not delete");
                    }
                  : undefined
              }
              onSave={async (pg) => {
                const res = await saveDoc(pg);
                if (res.ok) { toast.success("Saved to the supply document store"); setEditing(null); }
                else toast.error(res.error ?? "Could not save");
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      <Sheet open={!!msgFor} onOpenChange={(o) => !o && setMsgFor(null)}>
        <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{msgFor?.name} — customer messages</SheetTitle>
          </SheetHeader>
          {msgFor && <div className="mt-4"><MessageKitPanel pg={msgFor} compact /></div>}
        </SheetContent>
      </Sheet>

      <Sheet open={!!cmd} onOpenChange={(o) => !o && setCmdKey(null)}>
        <SheetContent side="right" className="w-full sm:max-w-5xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{cmd?.pg.name} — Property Command Center</SheetTitle>
          </SheetHeader>
          {cmd && (
            <div className="mt-4">
              <PropertyCommandCenter
                pg={cmd.pg as PGX}
                enabled={cmd.enabled}
                onSave={async (next) => saveDoc(next as unknown as PG, { enabled: cmd.enabled })}
                onToggle={async (v) => {
                  const res = await setEnabled(cmd.pg, v);
                  if (!res.ok) toast.error(res.error ?? "Could not update");
                  else toast.success(`${cmd.pg.name} ${v ? "enabled" : "disabled"}`);
                }}
              />
            </div>
          )}
        </SheetContent>
      </Sheet>
    </AppShell>
  );
}

function PropertyRow({
  item,
  onToggle,
  onEdit,
  onVerify,
  onMessages,
  zoneIds,
  onZone,
}: {
  item: SupplyItem & { gap: ReturnType<typeof gapReport>; truth: TruthRow };
  onToggle: (v: boolean) => void;
  onEdit: () => void;
  onVerify: () => void;
  onMessages: () => void;
  zoneIds: string[];
  onZone: (zoneId: string | null) => void;
}) {
  const { pg, gap, truth } = item;
  const inv = truth.inv;
  const cheap = inv.fromPrice || [pg.prices.triple, pg.prices.double, pg.prices.single].filter((x) => x > 0).sort((a, b) => a - b)[0];
  return (
    <div className={cn("p-3 flex flex-wrap items-center gap-3", !item.enabled && "opacity-60")}>
      <div className="min-w-[220px] flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-sm truncate">{pg.name}</span>
          <span className={cn("rounded border px-1.5 py-0.5 text-[10px] font-bold",
            truth.health >= 85 ? "border-emerald-400/50 text-emerald-400 bg-emerald-400/10"
              : truth.health >= 60 ? "border-amber-400/50 text-amber-400 bg-amber-400/10"
                : "border-rose-400/50 text-rose-400 bg-rose-400/10")}>{truth.health}</span>
          <span className={cn("rounded border px-1.5 py-0.5 text-[9px] font-bold tracking-wider", VERDICT_TONE[truth.sell.verdict])}>
            {VERDICT_LABEL[truth.sell.verdict]}
          </span>
          <span className={cn("rounded px-1 py-0.5 text-[9px] uppercase tracking-wider",
            truth.verify.mandatoryOk ? "bg-emerald-400/10 text-emerald-400" : "bg-amber-400/10 text-amber-400")}>
            {truth.verify.mandatoryOk ? "✓ Verified" : `Verify ${truth.verify.pct}%`}
          </span>
          {item.source === "admin" && <span className="rounded bg-accent/10 text-accent px-1 py-0.5 text-[9px] uppercase tracking-wider">New</span>}
          {!item.enabled && <span className="rounded bg-rose-400/10 text-rose-400 px-1 py-0.5 text-[9px] uppercase tracking-wider">Disabled</span>}
        </div>
        <div className="mt-0.5 text-[11px] text-muted-foreground">
          {inv.availableNow} beds now · {inv.next7} in 7d{inv.earliest ? ` · earliest ${inv.earliest}` : ""}
          {inv.floorPrice ? ` · floor ₹${inv.floorPrice.toLocaleString("en-IN")}` : ""} · inventory {inv.checkedAgo}
        </div>
        <div className="mt-0.5 flex items-center gap-1.5">
          <select
            value={zoneOfPG(pg)}
            onChange={(e) => onZone(e.target.value === "__auto" ? null : e.target.value)}
            title="Zone (override auto-mapping)"
            className={cn("rounded border px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wider bg-transparent", zoneMeta(zoneOfPG(pg)).accent)}
          >
            <option value="__auto">Auto</option>
            {zoneIds.map((z) => <option key={z} value={z}>{z}</option>)}
          </select>
          <span className="text-[11px] text-muted-foreground truncate">
            {[pg.area, pg.locality, pg.gender, pg.tier].filter(Boolean).join(" · ")}
          </span>
        </div>
      </div>

      <div className="text-right w-20">
        <div className="text-sm font-medium">{cheap ? `₹${(cheap / 1000).toFixed(0)}k` : "—"}</div>
        <div className="text-[10px] text-muted-foreground">from</div>
      </div>

      <div className="w-40">
        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
          <span>Data</span><span>{gap.score}%</span>
        </div>
        <div className="h-1.5 rounded bg-muted overflow-hidden">
          <div className={cn("h-full", gap.score > 80 ? "bg-emerald-400" : gap.score > 55 ? "bg-amber-400" : "bg-rose-400")} style={{ width: `${gap.score}%` }} />
        </div>
        {gap.missing.length > 0 && (
          <div className="mt-1 flex items-center gap-1 text-[10px] text-amber-400 truncate" title={gap.missing.join(", ")}>
            <AlertTriangle className="h-3 w-3 shrink-0" /> {gap.missing.length} missing
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 ml-auto">
        <button onClick={onVerify} className="inline-flex items-center gap-1 rounded-md border border-emerald-400/50 px-2 py-1 text-[11px] font-semibold text-emerald-400 hover:bg-emerald-400/10">
          <BadgeCheck className="h-3 w-3" /> Verify
        </button>
        <button onClick={onVerify} className="rounded-md border border-border px-2 py-1 text-[11px] font-medium hover:bg-muted">Inventory</button>
        <button onClick={onMessages} className="rounded-md border border-border px-2 py-1 text-[11px] font-medium hover:bg-muted">Messages</button>
        <CopyButton text={truthBlock(truth)} label="Status" />
        <button onClick={onEdit} className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] font-medium hover:bg-muted">
          <Pencil className="h-3 w-3" /> Edit
        </button>
        <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground"><Power className="h-3 w-3" /></span>
        <Switch checked={item.enabled} onCheckedChange={onToggle} />
      </div>
    </div>
  );
}

function PropertyForm({
  initial,
  onSave,
  onCancel,
  onDelete,
}: {
  initial: PG;
  onSave: (pg: PG) => void | Promise<void>;
  onCancel: () => void;
  onDelete?: () => void | Promise<void>;
}) {
  const [pg, setPg] = useState<PG>(() => JSON.parse(JSON.stringify(initial)) as PG);
  const set = <K extends keyof PG>(k: K, v: PG[K]) => setPg((p) => ({ ...p, [k]: v }));
  const gap = gapReport(pg);

  const submit = () => {
    if (!pg.name.trim()) { toast.error("Property name is required"); return; }
    const prices = { ...pg.prices };
    const vals = [prices.single, prices.double, prices.triple].filter((x) => x > 0);
    prices.min = vals.length ? Math.min(...vals) : 0;
    prices.max = vals.length ? Math.max(...vals) : 0;
    void onSave({ ...pg, prices, id: pg.id || docKey(pg.name).replace(/[^A-Z0-9]+/g, "_") });
  };

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs">
        Completeness <b>{gap.score}%</b>
        {gap.missing.length > 0 && <span className="text-muted-foreground"> — still missing: {gap.missing.join(", ")}</span>}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Gharpayy name *" value={pg.name} onChange={(v) => set("name", v)} />
        <Field label="Actual PG name" value={pg.actualName} onChange={(v) => set("actualName", v)} />
        <Field label="Area" value={pg.area} onChange={(v) => set("area", v)} />
        <Field label="Locality" value={pg.locality} onChange={(v) => set("locality", v)} />
        <Select label="Gender" value={pg.gender} options={GENDERS} onChange={(v) => set("gender", v as Gender)} />
        <Select label="Tier" value={pg.tier} options={TIERS} onChange={(v) => set("tier", v as Tier)} />
        <Field label="Single ₹/mo" value={String(pg.prices.single || "")} onChange={(v) => set("prices", { ...pg.prices, single: Number(v) || 0 })} />
        <Field label="Double ₹/mo" value={String(pg.prices.double || "")} onChange={(v) => set("prices", { ...pg.prices, double: Number(v) || 0 })} />
        <Field label="Triple ₹/mo" value={String(pg.prices.triple || "")} onChange={(v) => set("prices", { ...pg.prices, triple: Number(v) || 0 })} />
        <Field label="Room types" value={pg.rooms} onChange={(v) => set("rooms", v)} />
        <Field label="Furnishing" value={pg.furnishing} onChange={(v) => set("furnishing", v)} />
        <Field label="Food type" value={pg.foodType} onChange={(v) => set("foodType", v)} />
        <Field label="Meals included" value={pg.mealsIncluded} onChange={(v) => set("mealsIncluded", v)} />
        <Field label="Utilities / bills" value={pg.utilities} onChange={(v) => set("utilities", v)} />
        <Field label="Cleaning frequency" value={pg.cleaning} onChange={(v) => set("cleaning", v)} />
        <Field label="Deposit" value={pg.deposit} onChange={(v) => set("deposit", v)} />
        <Field label="Minimum stay" value={pg.minStay} onChange={(v) => set("minStay", v)} />
        <Field label="Manager name" value={pg.manager.name} onChange={(v) => set("manager", { ...pg.manager, name: v })} />
        <Field label="Manager phone" value={pg.manager.phone} onChange={(v) => set("manager", { ...pg.manager, phone: v })} />
        <Field label="Owner name" value={pg.owner.name} onChange={(v) => set("owner", { ...pg.owner, name: v })} />
        <Field label="Owner phone" value={pg.owner.phone} onChange={(v) => set("owner", { ...pg.owner, phone: v })} />
        <Field label="Owner group name" value={pg.groupName} onChange={(v) => set("groupName", v)} />
        <Field label="Google Maps link" value={pg.mapsLink} onChange={(v) => set("mapsLink", v)} />
        <Field label="Amenities (comma separated)" value={pg.amenities.join(", ")} onChange={(v) => set("amenities", v.split(",").map((x) => x.trim()).filter(Boolean))} />
        <Field label="Safety (comma separated)" value={pg.safety.join(", ")} onChange={(v) => set("safety", v.split(",").map((x) => x.trim()).filter(Boolean))} />
        <Field label="Latitude" value={pg.lat == null ? "" : String(pg.lat)} onChange={(v) => set("lat", v ? Number(v) : null)} />
        <Field label="Longitude" value={pg.lng == null ? "" : String(pg.lng)} onChange={(v) => set("lng", v ? Number(v) : null)} />
      </div>

      <Area label="USP" value={pg.usp} onChange={(v) => set("usp", v)} />
      <Area label="House rules" value={pg.rules} onChange={(v) => set("rules", v)} />
      <Area label="Lows (never disclose)" value={pg.lows} onChange={(v) => set("lows", v)} />
      <Area label="Location message (sent verbatim)" value={pg.location_card} onChange={(v) => set("location_card", v)} rows={5} />
      <Area label="Pricing message (sent verbatim)" value={pg.wa_card} onChange={(v) => set("wa_card", v)} rows={5} />

      <div className="flex items-center gap-2 pt-2">
        <button onClick={submit} className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-accent-foreground hover:opacity-90">Save property</button>
        <button onClick={onCancel} className="rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted">Cancel</button>
        {onDelete && (
          <button onClick={() => void onDelete()} className="ml-auto rounded-md border border-destructive/40 px-3 py-2 text-sm font-medium text-destructive hover:bg-destructive/10">
            Delete
          </button>
        )}
      </div>
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm" />
    </label>
  );
}

function Area({ label, value, onChange, rows = 3 }: { label: string; value: string; onChange: (v: string) => void; rows?: number }) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <textarea rows={rows} value={value} onChange={(e) => onChange(e.target.value)} className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm" />
    </label>
  );
}

function Select({ label, value, options, onChange }: { label: string; value: string; options: readonly string[]; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm">
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );
}

function ZoneManager({
  zones,
  onAdd,
  onSave,
  onRemove,
  onMove,
  onReset,
  onRename,
  onMerge,
}: {
  zones: ZoneDef[];
  onAdd: (z: Omit<ZoneDef, "accent"> & { accent?: string }) => void;
  onSave: (z: ZoneDef) => void;
  onRemove: (id: string) => void;
  onMove: (id: string, dir: -1 | 1) => void;
  onReset: () => void;
  onRename: (oldId: string, next: { id: string; label?: string; short?: string }) => { ok: boolean; error?: string };
  onMerge: (
    sourceId: string,
    targetId: string,
    opts?: { id?: string; label?: string; short?: string; cluster?: string },
  ) => { ok: boolean; error?: string };
}) {
  const [draft, setDraft] = useState({ id: "", label: "", short: "", cluster: "", keywords: "" });
  const [merge, setMerge] = useState({ source: "", target: "", id: "", label: "" });

  const add = () => {
    const id = draft.id.trim().toUpperCase();
    if (!id) { toast.error("Zone code is required"); return; }
    if (zones.some((z) => z.id === id)) { toast.error("That zone code already exists"); return; }
    onAdd({
      id,
      label: draft.label.trim() || id,
      short: draft.short.trim() || id,
      cluster: draft.cluster.trim() || "New catchment",
      keywords: draft.keywords.split(",").map((k) => k.trim().toLowerCase()).filter(Boolean),
    });
    setDraft({ id: "", label: "", short: "", cluster: "", keywords: "" });
    toast.success(`${id} added`);
  };

  const doMerge = () => {
    if (!merge.source || !merge.target) { toast.error("Pick both zones"); return; }
    const res = onMerge(merge.source, merge.target, { id: merge.id, label: merge.label });
    if (!res.ok) { toast.error(res.error ?? "Could not merge"); return; }
    toast.success(`${merge.source} merged into ${merge.id.trim().toUpperCase() || merge.target}`);
    setMerge({ source: "", target: "", id: "", label: "" });
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border p-3 space-y-2">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Merge two zones into one</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <label className="text-[11px] text-muted-foreground">
            Merge this zone…
            <select value={merge.source} onChange={(e) => setMerge({ ...merge, source: e.target.value })} className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-xs">
              <option value="">Select zone</option>
              {zones.map((z) => <option key={z.id} value={z.id}>{z.id} — {z.label}</option>)}
            </select>
          </label>
          <label className="text-[11px] text-muted-foreground">
            …into this zone
            <select value={merge.target} onChange={(e) => setMerge({ ...merge, target: e.target.value })} className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-xs">
              <option value="">Select zone</option>
              {zones.filter((z) => z.id !== merge.source).map((z) => <option key={z.id} value={z.id}>{z.id} — {z.label}</option>)}
            </select>
          </label>
          <input value={merge.id} onChange={(e) => setMerge({ ...merge, id: e.target.value })} placeholder="New code (optional) e.g. MWB" className="rounded-md border bg-background px-2 py-1.5 text-xs" />
          <input value={merge.label} onChange={(e) => setMerge({ ...merge, label: e.target.value })} placeholder="New name (optional)" className="rounded-md border bg-background px-2 py-1.5 text-xs" />
        </div>
        <button onClick={doMerge} className="inline-flex items-center gap-1 rounded-md border border-accent px-3 py-1.5 text-xs font-semibold text-accent hover:bg-accent/10">
          <Merge className="h-3 w-3" /> Merge zones
        </button>
        <p className="text-[10px] text-muted-foreground">Keywords are combined and every manually pinned property moves to the merged zone.</p>
      </div>

      <div className="rounded-lg border p-3 space-y-2">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Add a zone</div>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
          <input value={draft.id} onChange={(e) => setDraft({ ...draft, id: e.target.value })} placeholder="Code e.g. MRH" className="rounded-md border bg-background px-2 py-1.5 text-xs" />
          <input value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} placeholder="Name e.g. Marathahalli" className="rounded-md border bg-background px-2 py-1.5 text-xs" />
          <input value={draft.short} onChange={(e) => setDraft({ ...draft, short: e.target.value })} placeholder="Badge e.g. MRH" className="rounded-md border bg-background px-2 py-1.5 text-xs" />
          <input value={draft.cluster} onChange={(e) => setDraft({ ...draft, cluster: e.target.value })} placeholder="Catchment" className="rounded-md border bg-background px-2 py-1.5 text-xs" />
        </div>
        <input value={draft.keywords} onChange={(e) => setDraft({ ...draft, keywords: e.target.value })} placeholder="Keywords, comma separated: marathahalli, brookefield, aecs" className="w-full rounded-md border bg-background px-2 py-1.5 text-xs" />
        <div className="flex items-center gap-2">
          <button onClick={add} className="inline-flex items-center gap-1 rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-accent-foreground"><Plus className="h-3 w-3" /> Add zone</button>
          <button onClick={() => { onReset(); toast.success("Zones reset to the Gharpayy structure"); }} className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted"><RotateCcw className="h-3 w-3" /> Reset to defaults</button>
        </div>
      </div>

      <div className="rounded-lg border divide-y">
        {zones.map((z, i) => (
          <ZoneRow
            key={z.id}
            zone={z}
            first={i === 0}
            last={i === zones.length - 1}
            onSave={onSave}
            onRemove={onRemove}
            onMove={onMove}
            onRename={onRename}
          />
        ))}
      </div>
    </div>
  );
}

function ZoneRow({
  zone: z,
  first,
  last,
  onSave,
  onRemove,
  onMove,
  onRename,
}: {
  zone: ZoneDef;
  first: boolean;
  last: boolean;
  onSave: (z: ZoneDef) => void;
  onRemove: (id: string) => void;
  onMove: (id: string, dir: -1 | 1) => void;
  onRename: (oldId: string, next: { id: string; label?: string; short?: string }) => { ok: boolean; error?: string };
}) {
  const [code, setCode] = useState(z.id);
  const [label, setLabel] = useState(z.label);
  const [short, setShort] = useState(z.short);
  const dirty = code.trim().toUpperCase() !== z.id || label !== z.label || short !== z.short;

  const rename = () => {
    const res = onRename(z.id, { id: code, label, short });
    if (!res.ok) { toast.error(res.error ?? "Could not rename"); return; }
    toast.success(`Saved ${code.trim().toUpperCase()}`);
  };

  return (
    <div className="p-3 space-y-2">
      <div className="flex items-center gap-2">
        <span className={cn("rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider", z.accent)}>{z.short}</span>
        <span className="text-sm font-semibold">{z.id}</span>
        <button
          onClick={() => onSave({ ...z, core: !z.core })}
          className={cn("rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider", z.core ? "border-accent text-accent" : "border-border text-muted-foreground")}
        >
          {z.core ? "Core zone" : "Expansion"}
        </button>
        <div className="ml-auto flex items-center gap-1">
          <button disabled={first} onClick={() => onMove(z.id, -1)} className="rounded border p-1 disabled:opacity-30 hover:bg-muted"><ArrowUp className="h-3 w-3" /></button>
          <button disabled={last} onClick={() => onMove(z.id, 1)} className="rounded border p-1 disabled:opacity-30 hover:bg-muted"><ArrowDown className="h-3 w-3" /></button>
          <button onClick={() => { onRemove(z.id); toast.success(`${z.id} removed`); }} className="rounded border p-1 text-rose-400 hover:bg-muted"><Trash2 className="h-3 w-3" /></button>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
        <input value={code} onChange={(e) => setCode(e.target.value)} className="rounded-md border bg-background px-2 py-1.5 text-xs font-semibold uppercase" placeholder="Code" />
        <input value={label} onChange={(e) => setLabel(e.target.value)} className="rounded-md border bg-background px-2 py-1.5 text-xs" placeholder="Zone name" />
        <input value={short} onChange={(e) => setShort(e.target.value)} className="rounded-md border bg-background px-2 py-1.5 text-xs" placeholder="Badge" />
        <button onClick={rename} disabled={!dirty} className="rounded-md border border-accent px-2 py-1.5 text-xs font-semibold text-accent disabled:opacity-30 hover:bg-accent/10">Save name</button>
      </div>
      <input value={z.cluster} onChange={(e) => onSave({ ...z, cluster: e.target.value })} className="w-full rounded-md border bg-background px-2 py-1.5 text-xs" placeholder="Catchment / sub-areas" />
      <textarea
        value={z.keywords.join(", ")}
        onChange={(e) => onSave({ ...z, keywords: e.target.value.split(",").map((k) => k.trim().toLowerCase()).filter(Boolean) })}
        rows={2}
        className="w-full rounded-md border bg-background px-2 py-1.5 text-xs font-mono"
        placeholder="Keywords, comma separated"
      />
      <div className="flex items-center gap-1 flex-wrap">
        {ZONE_ACCENTS.map((a) => (
          <button key={a} onClick={() => onSave({ ...z, accent: a })} className={cn("h-5 w-5 rounded border", a, z.accent === a && "ring-2 ring-accent")} />
        ))}
      </div>
    </div>
  );
}
