// All Verify — one page to verify every property × every section, with
// click-to-verify gates, bulk actions and near-zero typing (dropdown / + menus).
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { useSupplyStore } from "@/supply-hub/lib/store";
import { VERIFY_SECTIONS, type PGDoc } from "@/supply-hub/lib/verify";
import {
  sectionState, sectionHash, sectionGate, verifyAllSections, seedInventory,
  truthRow, pushHistory, SECTION_STATE_LABEL, SECTION_STATE_TONE,
  AVAIL_CLASS_LABEL, AVAIL_CLASS_TONE, ago,
  type PGX, type AvailClass, type SectionState, type Stamp,
} from "@/supply-hub/lib/truth";
import { zoneOfPG, zoneMeta } from "@/supply-hub/lib/zones";
import { propertyCode, serialNo } from "@/supply-hub/lib/ids";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  ShieldCheck, Search, CheckCircle2, RotateCcw, Boxes, Pencil, Plus, X, Filter,
} from "lucide-react";

export const Route = createFileRoute("/supply-hub/verify")({
  head: () => ({
    meta: [
      { title: "All Verify — Property Truth Console | Gharpayy" },
      { name: "description", content: "Verify every Gharpayy property and every data section from one grid: click-to-verify, bulk verify, inventory seeding and full filters." },
      { property: "og:title", content: "All Verify — Property Truth Console" },
      { property: "og:description", content: "One page to verify all properties across all ten data sections." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AllVerify,
});

const STATE_DOT: Record<SectionState, string> = {
  verified: "bg-emerald-400",
  review: "bg-amber-400",
  changed: "bg-sky-400",
  missing: "bg-rose-400",
};

function AllVerify() {
  const { items, loading, saveDoc } = useSupplyStore();
  const [q, setQ] = useState("");
  const [zone, setZone] = useState("All");
  const [area, setArea] = useState("All");
  const [enabled, setEnabled] = useState<"all" | "enabled" | "disabled">("all");
  const [vFilter, setVFilter] = useState<"all" | "verified" | "unverified">("all");
  const [aFilter, setAFilter] = useState<"all" | AvailClass>("all");
  const [needs, setNeeds] = useState<string>("all");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState<{ pg: PGX; section: string } | null>(null);
  const [gate, setGate] = useState<{ name: string; issues: string[] } | null>(null);

  const rows = useMemo(
    () =>
      items.map((i) => {
        const pg = i.pg as PGX;
        return {
          pg,
          enabled: i.enabled,
          zone: zoneOfPG(pg),
          truth: truthRow(pg, i.enabled),
        };
      }),
    [items],
  );

  const zones = useMemo(() => ["All", ...Array.from(new Set(rows.map((r) => r.zone))).sort()], [rows]);
  const areas = useMemo(() => ["All", ...Array.from(new Set(rows.map((r) => r.pg.area).filter(Boolean))).sort()], [rows]);

  /** Suggestion pool per field key — powers the dropdown-first editor. */
  const suggestions = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const sec of VERIFY_SECTIONS) {
      for (const f of sec.fields) {
        const set = new Set<string>();
        for (const r of rows) {
          const raw = f.get(r.pg);
          if (!raw) continue;
          if (f.kind === "list") raw.split(",").forEach((x) => x.trim() && set.add(x.trim()));
          else if (f.kind !== "lines" && raw.length <= 60) set.add(raw.trim());
        }
        m.set(`${sec.id}.${f.key}`, Array.from(set).sort().slice(0, 60));
      }
    }
    return m;
  }, [rows]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (needle && !`${r.pg.name} ${r.pg.actualName ?? ""} ${r.pg.area} ${r.pg.locality}`.toLowerCase().includes(needle)) return false;
      if (zone !== "All" && r.zone !== zone) return false;
      if (area !== "All" && r.pg.area !== area) return false;
      if (enabled === "enabled" && !r.enabled) return false;
      if (enabled === "disabled" && r.enabled) return false;
      if (vFilter === "verified" && !r.truth.verify.mandatoryOk) return false;
      if (vFilter === "unverified" && r.truth.verify.mandatoryOk) return false;
      if (aFilter !== "all" && r.truth.avail !== aFilter) return false;
      if (needs !== "all" && r.truth.verify.states[needs] === "verified") return false;
      return true;
    });
  }, [rows, q, zone, area, enabled, vFilter, aFilter, needs]);

  const stats = useMemo(() => {
    const total = filtered.length * VERIFY_SECTIONS.length;
    const green = filtered.reduce(
      (s, r) => s + VERIFY_SECTIONS.filter((sec) => r.truth.verify.states[sec.id] === "verified").length,
      0,
    );
    return {
      properties: filtered.length,
      fullyVerified: filtered.filter((r) => r.truth.verify.mandatoryOk).length,
      pct: total ? Math.round((green / total) * 100) : 0,
      open: total - green,
    };
  }, [filtered]);

  const save = async (pg: PGX) => saveDoc(pg as never);

  const stampSection = async (pg: PGX, sectionId: string) => {
    const g = sectionGate(pg, sectionId);
    if (!g.ok) {
      setGate({ name: `${pg.name} · ${VERIFY_SECTIONS.find((s) => s.id === sectionId)?.label}`, issues: g.issues });
      return;
    }
    const now = new Date().toISOString();
    const sections = { ...(pg.verification?.sections ?? {}) } as Record<string, Stamp>;
    sections[sectionId] = { at: now, by: "you", source: "manager", hash: sectionHash(pg, sectionId) };
    const next = pushHistory(
      { ...pg, verification: { ...pg.verification, sections } },
      { by: "you", what: `Section verified · ${sectionId}` },
    );
    const res = await save(next);
    if (!res.ok) toast.error(res.error ?? "Could not save");
    else toast.success(`${sectionId} verified`);
  };

  const reopenSection = async (pg: PGX, sectionId: string) => {
    const sections = { ...(pg.verification?.sections ?? {}) };
    delete sections[sectionId];
    const next = pushHistory(
      { ...pg, verification: { ...pg.verification, sections, verifiedAt: null } },
      { by: "you", what: `Section reopened · ${sectionId}` },
    );
    const res = await save(next);
    if (!res.ok) toast.error(res.error ?? "Could not save");
    else toast.success(`${sectionId} reopened`);
  };

  const verifyRow = async (pg: PGX) => {
    let doc = pg;
    if (!(doc.inventory?.rooms?.length)) doc = { ...doc, inventory: seedInventory(doc) };
    const next = verifyAllSections(doc, "you", "manager");
    const res = await save(next);
    if (!res.ok) toast.error(res.error ?? "Could not save");
    else toast.success(`${pg.name} verified`);
  };

  const bulkVerify = async (targets: PGX[]) => {
    if (!targets.length) { toast.error("Nothing selected"); return; }
    setBusy(true);
    let ok = 0;
    for (const pg of targets) {
      let doc = pg;
      if (!(doc.inventory?.rooms?.length)) doc = { ...doc, inventory: seedInventory(doc) };
      const res = await save(verifyAllSections(doc, "you", "manager"));
      if (res.ok) ok += 1;
    }
    setBusy(false);
    setSel(new Set());
    toast.success(`${ok} propert${ok === 1 ? "y" : "ies"} verified`);
  };

  const toggleSel = (name: string) =>
    setSel((s) => {
      const n = new Set(s);
      if (n.has(name)) n.delete(name); else n.add(name);
      return n;
    });

  const selectedRows = filtered.filter((r) => sel.has(r.pg.name));

  return (
    <AppShell>
      <div className="mx-auto max-w-[1500px] space-y-4 p-4 md:p-6">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.18em] text-accent">
              <ShieldCheck className="h-3.5 w-3.5" /> All Verify
            </div>
            <h1 className="font-display text-2xl font-semibold tracking-tight">Verify everything from one page</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Every property × every section. Click a cell to verify it, use the pencil to fix data with dropdowns instead of typing.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to="/supply-hub/admin" className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted">
              Property Control
            </Link>
            <button
              disabled={busy}
              onClick={() => void bulkVerify(selectedRows.map((r) => r.pg))}
              className="inline-flex items-center gap-1.5 rounded-md border border-accent px-3 py-2 text-sm font-semibold text-accent hover:bg-accent/10 disabled:opacity-40"
            >
              <CheckCircle2 className="h-4 w-4" /> Verify selected ({selectedRows.length})
            </button>
            <button
              disabled={busy}
              onClick={() => void bulkVerify(filtered.map((r) => r.pg))}
              className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-2 text-sm font-semibold text-accent-foreground hover:opacity-90 disabled:opacity-40"
            >
              <CheckCircle2 className="h-4 w-4" /> Verify all filtered ({filtered.length})
            </button>
          </div>
        </header>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ["Properties in view", stats.properties],
            ["Fully verified", stats.fullyVerified],
            ["Section coverage", `${stats.pct}%`],
            ["Open sections", stats.open],
          ].map(([label, value]) => (
            <div key={label as string} className="rounded-lg border bg-card p-3">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
              <div className="font-display text-xl font-semibold">{value}</div>
            </div>
          ))}
        </div>

        <div className="rounded-lg border bg-card p-3">
          <div className="mb-2 inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
            <Filter className="h-3 w-3" /> Filters
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 xl:grid-cols-7">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search property / area" className="w-full rounded-md border bg-background py-1.5 pl-7 pr-2 text-xs" />
            </div>
            <Pick value={zone} onChange={setZone} options={zones} label="Zone" />
            <Pick value={area} onChange={setArea} options={areas} label="Area" />
            <Pick value={enabled} onChange={(v) => setEnabled(v as typeof enabled)} options={["all", "enabled", "disabled"]} label="Status" />
            <Pick value={vFilter} onChange={(v) => setVFilter(v as typeof vFilter)} options={["all", "verified", "unverified"]} label="Verification" />
            <Pick value={aFilter} onChange={(v) => setAFilter(v as typeof aFilter)} options={["all", "available", "limited", "waitlist", "full"]} label="Availability" />
            <Pick
              value={needs}
              onChange={setNeeds}
              options={["all", ...VERIFY_SECTIONS.map((s) => s.id)]}
              label="Needs section"
            />
          </div>
        </div>

        {loading && <div className="text-sm text-muted-foreground">Loading properties…</div>}

        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[1200px] text-xs">
            <thead className="bg-muted/50 text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="p-2 text-left">
                  <input
                    type="checkbox"
                    checked={filtered.length > 0 && selectedRows.length === filtered.length}
                    onChange={(e) => setSel(e.target.checked ? new Set(filtered.map((r) => r.pg.name)) : new Set())}
                  />
                </th>
                <th className="p-2 text-left">#</th>
                <th className="p-2 text-left">Property</th>
                <th className="p-2 text-left">Availability</th>
                {VERIFY_SECTIONS.map((s) => (
                  <th key={s.id} className="p-2 text-center">{s.label.split(" ")[0]}</th>
                ))}
                <th className="p-2 text-right">Row</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => {
                const zm = zoneMeta(r.zone);
                return (
                  <tr key={r.pg.name} className="border-t hover:bg-muted/30">
                    <td className="p-2 align-top">
                      <input type="checkbox" checked={sel.has(r.pg.name)} onChange={() => toggleSel(r.pg.name)} />
                    </td>
                    <td className="p-2 align-top tabular-nums text-muted-foreground">{serialNo(i)}</td>
                    <td className="p-2 align-top">
                      <div className="flex items-center gap-1.5">
                        <span className={cn("rounded border px-1 py-0.5 text-[9px] font-semibold uppercase", zm.accent)}>{zm.short}</span>
                        <span className="font-semibold">{r.pg.name}</span>
                        {!r.enabled && <span className="rounded border border-destructive/40 px-1 text-[9px] text-destructive">disabled</span>}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        {propertyCode(r.pg)} · {r.pg.area || "no area"} · {r.truth.verify.pct}% verified
                      </div>
                    </td>
                    <td className="p-2 align-top">
                      <span className={cn("rounded border px-1.5 py-0.5 text-[10px] font-semibold", AVAIL_CLASS_TONE[r.truth.avail])}>
                        {AVAIL_CLASS_LABEL[r.truth.avail]}
                      </span>
                      <div className="text-[10px] text-muted-foreground">{r.truth.inv.availableNow} beds · {ago(r.pg.inventory?.lastCheckedAt)}</div>
                    </td>
                    {VERIFY_SECTIONS.map((s) => {
                      const st = r.truth.verify.states[s.id];
                      return (
                        <td key={s.id} className="p-1.5 text-center align-top">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              title={`${SECTION_STATE_LABEL[st]} — click to ${st === "verified" ? "reopen" : "verify"}`}
                              onClick={() => void (st === "verified" ? reopenSection(r.pg, s.id) : stampSection(r.pg, s.id))}
                              className={cn("rounded border px-1.5 py-1", SECTION_STATE_TONE[st])}
                            >
                              <span className={cn("block h-2 w-2 rounded-full", STATE_DOT[st])} />
                            </button>
                            <button
                              title="Edit this section"
                              onClick={() => setEdit({ pg: r.pg, section: s.id })}
                              className="rounded border border-border p-1 text-muted-foreground hover:bg-muted"
                            >
                              <Pencil className="h-2.5 w-2.5" />
                            </button>
                          </div>
                        </td>
                      );
                    })}
                    <td className="p-2 text-right align-top">
                      <div className="flex justify-end gap-1">
                        <button
                          onClick={() => void verifyRow(r.pg)}
                          className="rounded border border-accent px-2 py-1 text-[10px] font-semibold text-accent hover:bg-accent/10"
                        >
                          Verify all
                        </button>
                        <button
                          title="Seed inventory from prices"
                          onClick={() => void save({ ...r.pg, inventory: seedInventory(r.pg) }).then(() => toast.success("Inventory seeded"))}
                          className="rounded border border-border p-1 text-muted-foreground hover:bg-muted"
                        >
                          <Boxes className="h-3 w-3" />
                        </button>
                        <button
                          title="Reopen everything"
                          onClick={() => void save({ ...r.pg, verification: { sections: {}, verifiedAt: null } }).then(() => toast.success("Reopened"))}
                          className="rounded border border-border p-1 text-muted-foreground hover:bg-muted"
                        >
                          <RotateCcw className="h-3 w-3" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!loading && filtered.length === 0 && (
            <div className="p-6 text-center text-sm text-muted-foreground">No property matches these filters.</div>
          )}
        </div>
      </div>

      <Dialog open={!!gate} onOpenChange={(o) => !o && setGate(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Cannot verify {gate?.name}</DialogTitle></DialogHeader>
          <ul className="space-y-1 text-xs text-muted-foreground">
            {gate?.issues.map((x) => <li key={x}>• {x}</li>)}
          </ul>
        </DialogContent>
      </Dialog>

      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {edit?.pg.name} · {VERIFY_SECTIONS.find((s) => s.id === edit?.section)?.label}
            </DialogTitle>
          </DialogHeader>
          {edit && (
            <SectionEditor
              pg={edit.pg}
              sectionId={edit.section}
              suggestions={suggestions}
              onClose={() => setEdit(null)}
              onSave={async (next, verify) => {
                const saved = await save(next);
                if (!saved.ok) { toast.error(saved.error ?? "Could not save"); return; }
                setEdit(null);
                if (verify) await stampSection(next, edit.section);
                else toast.success("Saved");
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function Pick({ value, onChange, options, label }: { value: string; onChange: (v: string) => void; options: string[]; label: string }) {
  return (
    <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)} className="mt-0.5 w-full rounded-md border bg-background px-2 py-1.5 text-xs capitalize text-foreground">
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );
}

/** Dropdown-first editor: pick existing values, or add a new one with the + menu. */
function SectionEditor({
  pg,
  sectionId,
  suggestions,
  onSave,
  onClose,
}: {
  pg: PGX;
  sectionId: string;
  suggestions: Map<string, string[]>;
  onSave: (next: PGX, verify: boolean) => void | Promise<void>;
  onClose: () => void;
}) {
  const section = VERIFY_SECTIONS.find((s) => s.id === sectionId)!;
  const [draft, setDraft] = useState<PGX>(pg);

  const setField = (key: string, value: string) => {
    const f = section.fields.find((x) => x.key === key)!;
    setDraft((d) => f.set(d, value) as PGX);
  };

  return (
    <div className="space-y-3">
      {section.fields.map((f) => {
        const value = f.get(draft);
        const pool = suggestions.get(`${section.id}.${f.key}`) ?? [];
        if (f.kind === "list") {
          const chips = value.split(",").map((x) => x.trim()).filter(Boolean);
          return (
            <div key={f.key} className="space-y-1">
              <div className="text-[11px] font-medium">{f.label}</div>
              <div className="flex flex-wrap gap-1">
                {chips.map((c) => (
                  <button
                    key={c}
                    onClick={() => setField(f.key, chips.filter((x) => x !== c).join(", "))}
                    className="inline-flex items-center gap-1 rounded-full border border-accent/40 bg-accent/10 px-2 py-0.5 text-[11px] text-accent"
                  >
                    {c} <X className="h-2.5 w-2.5" />
                  </button>
                ))}
                <AddMenu
                  pool={pool.filter((p) => !chips.includes(p))}
                  onPick={(v) => setField(f.key, [...chips, v].join(", "))}
                />
              </div>
            </div>
          );
        }
        if (f.kind === "lines" || f.kind === "area") {
          return (
            <div key={f.key} className="space-y-1">
              <div className="text-[11px] font-medium">{f.label}</div>
              <textarea
                value={value}
                rows={f.kind === "lines" ? 4 : 3}
                onChange={(e) => setField(f.key, e.target.value)}
                className="w-full rounded-md border bg-background px-2 py-1.5 text-xs"
              />
            </div>
          );
        }
        return (
          <div key={f.key} className="space-y-1">
            <div className="text-[11px] font-medium">{f.label}</div>
            <div className="flex items-center gap-1.5">
              <select
                value={pool.includes(value) ? value : ""}
                onChange={(e) => setField(f.key, e.target.value)}
                className="min-w-0 flex-1 rounded-md border bg-background px-2 py-1.5 text-xs"
              >
                <option value="">{value || "Select a value"}</option>
                {pool.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
              <AddMenu pool={[]} onPick={(v) => setField(f.key, v)} label="New" />
            </div>
            {value && <div className="text-[10px] text-muted-foreground">Current: {value}</div>}
          </div>
        );
      })}

      <div className="flex justify-end gap-2 pt-1">
        <button onClick={onClose} className="rounded-md border px-3 py-1.5 text-xs hover:bg-muted">Cancel</button>
        <button onClick={() => void onSave(draft, false)} className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted">Save</button>
        <button onClick={() => void onSave(draft, true)} className="rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-accent-foreground hover:opacity-90">
          Save &amp; verify section
        </button>
      </div>
    </div>
  );
}

function AddMenu({ pool, onPick, label = "Add" }: { pool: string[]; onPick: (v: string) => void; label?: string }) {
  const [open, setOpen] = useState(false);
  const [fresh, setFresh] = useState("");
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-muted">
          <Plus className="h-3 w-3" /> {label}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 space-y-2 p-2" align="start">
        {pool.length > 0 && (
          <div className="max-h-52 space-y-0.5 overflow-y-auto">
            {pool.map((p) => (
              <button
                key={p}
                onClick={() => { onPick(p); setOpen(false); }}
                className="block w-full truncate rounded px-2 py-1 text-left text-xs hover:bg-muted"
              >
                {p}
              </button>
            ))}
          </div>
        )}
        <div className="flex gap-1">
          <input
            value={fresh}
            onChange={(e) => setFresh(e.target.value)}
            placeholder="Create new…"
            className="min-w-0 flex-1 rounded-md border bg-background px-2 py-1 text-xs"
          />
          <button
            onClick={() => { if (fresh.trim()) { onPick(fresh.trim()); setFresh(""); setOpen(false); } }}
            className="rounded-md bg-accent px-2 py-1 text-xs font-semibold text-accent-foreground"
          >
            Add
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
