import { useEffect, useMemo, useState } from "react";
import {
  BadgeCheck, Bed as BedIcon, Check, ClipboardCheck, History as HistoryIcon,
  IndianRupee, Layers, MessageSquare, Plus, ShieldCheck, Trash2, Users, Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { CopyButton } from "@/components/supply/MessageKit";
import { VERIFY_SECTIONS, type VField } from "@/supply-hub/lib/verify";
import {
  BED_STATE_LABEL, BED_STATE_TONE, PRICE_BAND_LABEL, PRICE_BAND_TONE,
  SECTION_STATE_LABEL, SECTION_STATE_TONE, VERDICT_LABEL, VERDICT_TONE,
  ago, invSummary, nextDue, priceBand, priceConflict, pushHistory, sectionHash,
  sectionState, seedInventory, sellability, healthScore, truthBlock, truthRow, verifySummary,
  auditDiff, pushHistoryMany, sectionGate, propertyGate, verifyAllSections,
  AVAIL_CLASS_LABEL, AVAIL_CLASS_TONE,
  type Bed, type BedState, type EvidenceSource, type InvRoom, type PGX,
} from "@/supply-hub/lib/truth";

type Save = (next: PGX) => Promise<{ ok: boolean; error?: string }>;

const TABS = [
  { id: "property", label: "Property", icon: Layers, sections: ["location", "commute"] },
  { id: "rooms", label: "Rooms & beds", icon: BedIcon, sections: [] as string[] },
  { id: "money", label: "Money", icon: Wallet, sections: ["pricing"] },
  { id: "experience", label: "Experience", icon: ClipboardCheck, sections: ["food", "lifestyle"] },
  { id: "fit", label: "Customer fit", icon: Users, sections: ["persona"] },
  { id: "trust", label: "Trust", icon: ShieldCheck, sections: ["safety"] },
  { id: "conversion", label: "Conversion", icon: MessageSquare, sections: ["messages", "coldpitch", "upgrades"] },
  { id: "history", label: "History", icon: HistoryIcon, sections: [] as string[] },
] as const;

const SOURCES: EvidenceSource[] = ["manager", "call", "whatsapp", "visit", "photo", "portal"];
const BED_STATES: BedState[] = ["available", "available_from", "occupied", "notice", "hold", "booked", "blocked"];

/**
 * Property Command Center — one screen that answers:
 * "Can I confidently sell this property to this customer right now?"
 */
export function PropertyCommandCenter({
  pg, enabled, onSave, onToggle, verifier = "Admin",
}: {
  pg: PGX;
  enabled: boolean;
  onSave: Save;
  onToggle: (v: boolean) => void;
  verifier?: string;
}) {
  const [draft, setDraft] = useState<PGX>(() => JSON.parse(JSON.stringify(pg)) as PGX);
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("property");
  const [busy, setBusy] = useState(false);
  const [source, setSource] = useState<EvidenceSource>("manager");

  useEffect(() => { setDraft(JSON.parse(JSON.stringify(pg)) as PGX); }, [pg]);

  const row = useMemo(() => truthRow(draft, enabled), [draft, enabled]);
  const v = row.verify;
  const inv = row.inv;
  const sell = row.sell;

  const persist = async (next: PGX, msg: string) => {
    setBusy(true);
    const audited = pushHistoryMany(next, auditDiff(pg, next, verifier));
    setDraft(audited);
    const res = await onSave(audited);
    setBusy(false);
    if (res.ok) toast.success(msg);
    else toast.error(res.error ?? "Could not save");
  };

  const saveEdits = (what: string) =>
    void persist(pushHistory(draft, { by: verifier, what: `${what} edited` }), "Saved");

  const verifySection = (id: string, label: string) => {
    const gate = sectionGate(draft, id);
    if (!gate.ok) {
      toast.error(`Cannot verify ${label}`, { description: gate.issues.slice(0, 4).join(" · ") });
      return;
    }
    const now = new Date().toISOString();
    const sections = {
      ...(draft.verification?.sections ?? {}),
      [id]: { at: now, by: verifier, source, hash: sectionHash(draft, id) },
    };
    const next = pushHistory(
      { ...draft, verification: { ...draft.verification, sections, verifiedAt: now, verifiedBy: verifier } },
      { by: verifier, what: `${label} verified`, to: source },
    );
    void persist(next, `${label} verified`);
  };

  const reopen = (id: string, label: string) => {
    const sections = { ...(draft.verification?.sections ?? {}) };
    delete sections[id];
    void persist(
      pushHistory({ ...draft, verification: { ...draft.verification, sections } }, { by: verifier, what: `${label} reopened` }),
      "Section reopened",
    );
  };

  const verifyAll = () => {
    const gate = propertyGate(draft);
    if (!gate.ok) {
      toast.error("Cannot verify this property yet", { description: gate.issues.slice(0, 5).join(" · ") });
      return;
    }
    void persist(verifyAllSections(draft, verifier, source), "Property verified end-to-end");
  };

  const setInv = (rooms: InvRoom[], note?: string) =>
    setDraft((d) => ({ ...d, inventory: { ...(d.inventory ?? {}), rooms, ...(note ? {} : {}) } }));

  const confirmInventory = () => {
    const next = pushHistory(
      { ...draft, inventory: { rooms: draft.inventory?.rooms ?? [], lastCheckedAt: new Date().toISOString(), lastCheckedBy: verifier, source } },
      { by: verifier, what: "Inventory reconfirmed", to: `${inv.availableNow} beds now` },
    );
    void persist(next, "Inventory confirmed");
  };

  return (
    <div className="space-y-4">
      {/* ---------------- header: the single live truth ---------------- */}
      <div className="rounded-lg border bg-card p-3 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="font-display text-xl font-semibold">{draft.name}</div>
          <span className={cn("rounded-md border px-2 py-0.5 text-[11px] font-bold", healthTone(row.health))}>
            {row.health}/100 health
          </span>
          <span className={cn("rounded-md border px-2 py-0.5 text-[11px] font-bold tracking-wider", VERDICT_TONE[sell.verdict])}>
            {VERDICT_LABEL[sell.verdict]}
          </span>
          <div className="ml-auto flex items-center gap-2">
            <CopyButton text={truthBlock(row)} label="Copy status" />
            <span className="text-[11px] text-muted-foreground">Enabled</span>
            <Switch checked={enabled} onCheckedChange={onToggle} />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <StateCard
            title={v.mandatoryOk ? "✓ GHARPAYY VERIFIED" : "Verification open"}
            tone={v.mandatoryOk ? "emerald" : "amber"}
            lines={[`${v.pct}% · ${v.verified}/${v.total} sections`, `${v.expired.length} expired · ${v.changed.length} changed · ${v.missing.length} missing`]}
          />
          <StateCard
            title={inv.availableNow > 0 ? `${inv.availableNow} beds available now` : inv.next7 > 0 ? `${inv.next7} beds in 7 days` : "No availability"}
            tone={inv.availableNow > 0 ? "emerald" : inv.next7 > 0 ? "sky" : "rose"}
            lines={[
              inv.earliest ? `Earliest ${inv.earliest}` : "No free date on file",
              `Checked ${inv.checkedAgo}${inv.fresh ? "" : " · reconfirm"}`,
            ]}
          />
          <StateCard
            title={inv.fromPrice ? `₹${inv.fromPrice.toLocaleString("en-IN")} onwards` : "Price not confirmed"}
            tone={priceConflict(draft) ? "rose" : inv.floorPrice ? "emerald" : "amber"}
            lines={[
              inv.floorPrice ? `Floor ₹${inv.floorPrice.toLocaleString("en-IN")} — below needs approval` : "Set target + floor per bed",
              priceConflict(draft) ? "⚠ Price ladder conflict" : `Pricing ${SECTION_STATE_LABEL[sectionState(draft, "pricing")].toLowerCase()}`,
            ]}
          />
        </div>

        <div className="flex flex-wrap gap-1.5">
          {sell.checks.map((c) => (
            <span key={c.label} className={cn("rounded border px-1.5 py-0.5 text-[10px]", c.ok ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-400" : "border-rose-400/40 bg-rose-400/10 text-rose-400")} title={c.note}>
              {c.ok ? "✓" : "✕"} {c.label}
            </span>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-border">
          <label className="text-[11px] text-muted-foreground inline-flex items-center gap-1.5">
            Evidence
            <select value={source} onChange={(e) => setSource(e.target.value as EvidenceSource)} className="rounded-md border border-border bg-background px-2 py-1 text-xs">
              {SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <button disabled={busy} onClick={confirmInventory} className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] font-medium hover:bg-muted disabled:opacity-50">
            <BedIcon className="h-3 w-3" /> Confirm inventory
          </button>
          <button disabled={busy} onClick={verifyAll} className="inline-flex items-center gap-1 rounded-md border border-emerald-400/50 px-2 py-1 text-[11px] font-semibold text-emerald-400 hover:bg-emerald-400/10 disabled:opacity-50">
            <ShieldCheck className="h-3 w-3" /> Verify everything
          </button>
          <span className="ml-auto text-[10px] text-muted-foreground">
            Last verified {ago(draft.verification?.verifiedAt)}{draft.verification?.verifiedBy ? ` by ${draft.verification.verifiedBy}` : ""}
          </span>
        </div>
      </div>

      {/* ---------------- tabs ---------------- */}
      <div className="flex flex-wrap gap-1.5">
        {TABS.map((t) => {
          const bad = t.sections.some((id) => sectionState(draft, id) !== "verified");
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium",
                tab === t.id ? "border-accent text-accent bg-accent/10" : "border-border text-muted-foreground hover:bg-muted",
              )}
            >
              <t.icon className="h-3.5 w-3.5" /> {t.label}
              {bad && <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />}
            </button>
          );
        })}
      </div>

      {tab === "rooms" && (
        <InventoryEditor
          draft={draft}
          busy={busy}
          onChange={(rooms) => setInv(rooms)}
          onSave={() => saveEdits("Inventory")}
          onSeed={() => setDraft((d) => ({ ...d, inventory: seedInventory(d) }))}
        />
      )}

      {tab === "money" && <ChargesEditor draft={draft} onChange={setDraft} onSave={() => saveEdits("Charges")} busy={busy} />}

      {tab === "history" && <HistoryPanel draft={draft} />}

      {TABS.find((t) => t.id === tab)?.sections.map((id) => {
        const sec = VERIFY_SECTIONS.find((s) => s.id === id);
        if (!sec) return null;
        const st = sectionState(draft, id);
        const stamp = (draft.verification?.sections ?? {})[id] as { at: string; by?: string; source?: string } | undefined;
        return (
          <div key={id} className={cn("rounded-lg border bg-card p-3 space-y-2", st === "verified" && "border-emerald-400/40")}>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold">{sec.label}</h3>
              <span className={cn("rounded border px-1.5 py-0.5 text-[10px] font-semibold", SECTION_STATE_TONE[st])}>
                {st === "verified" ? "✓ " : "⚠ "}{SECTION_STATE_LABEL[st]}
              </span>
              <span className="text-[10px] text-muted-foreground">
                {stamp ? `${ago(stamp.at)}${stamp.by ? ` · ${stamp.by}` : ""}${stamp.source ? ` · ${stamp.source}` : ""} · next ${nextDue(draft, id)}` : "never verified"}
              </span>
              <div className="ml-auto flex items-center gap-2">
                <CopyButton text={sec.fields.map((f) => `${f.label}: ${f.get(draft)}`).join("\n")} label="Copy" />
                <button disabled={busy} onClick={() => saveEdits(sec.label)} className="rounded-md border border-border px-2 py-1 text-[11px] font-medium hover:bg-muted disabled:opacity-50">Save</button>
                {st === "verified" ? (
                  <button disabled={busy} onClick={() => reopen(id, sec.label)} className="rounded-md border border-border px-2 py-1 text-[11px] font-medium hover:bg-muted disabled:opacity-50">Reopen</button>
                ) : (
                  <button disabled={busy} onClick={() => verifySection(id, sec.label)} className="inline-flex items-center gap-1 rounded-md border border-emerald-400/50 px-2 py-1 text-[11px] font-semibold text-emerald-400 hover:bg-emerald-400/10 disabled:opacity-50">
                    <Check className="h-3 w-3" /> Verify
                  </button>
                )}
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {sec.fields.map((f) => <FieldEditor key={f.key} field={f} draft={draft} onChange={setDraft} />)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ bits */

function healthTone(n: number) {
  if (n >= 85) return "border-emerald-400/50 bg-emerald-400/10 text-emerald-400";
  if (n >= 60) return "border-amber-400/50 bg-amber-400/10 text-amber-400";
  return "border-rose-400/50 bg-rose-400/10 text-rose-400";
}

function StateCard({ title, lines, tone }: { title: string; lines: string[]; tone: "emerald" | "amber" | "sky" | "rose" }) {
  const tones = {
    emerald: "border-emerald-400/30 bg-emerald-400/5",
    amber: "border-amber-400/30 bg-amber-400/5",
    sky: "border-sky-400/30 bg-sky-400/5",
    rose: "border-rose-400/30 bg-rose-400/5",
  } as const;
  return (
    <div className={cn("rounded-md border p-2.5", tones[tone])}>
      <div className="text-sm font-semibold">{title}</div>
      {lines.map((l) => <div key={l} className="text-[11px] text-muted-foreground mt-0.5">{l}</div>)}
    </div>
  );
}

function InventoryEditor({
  draft, busy, onChange, onSave, onSeed,
}: { draft: PGX; busy: boolean; onChange: (rooms: InvRoom[]) => void; onSave: () => void; onSeed: () => void }) {
  const rooms = draft.inventory?.rooms ?? [];
  const inv = invSummary(draft);
  const today = new Date().toISOString().slice(0, 10);

  const patchBed = (ri: number, bi: number, p: Partial<Bed>) =>
    onChange(rooms.map((r, i) => i !== ri ? r : { ...r, beds: r.beds.map((b, j) => (j === bi ? { ...b, ...p } : b)) }));

  const addRoom = () =>
    onChange([...rooms, { id: `r${Date.now()}`, floor: "1", room: "", type: "Double", beds: [] }]);

  const addBed = (ri: number) =>
    onChange(rooms.map((r, i) => i !== ri ? r : {
      ...r,
      beds: [...r.beds, { id: `b${Date.now()}`, label: `Bed ${String.fromCharCode(65 + r.beds.length)}`, state: "available", from: today, asking: 0, target: 0, floor: 0 }],
    }));

  return (
    <div className="rounded-lg border bg-card p-3 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold">Floor → Room → Bed</h3>
        <span className="text-[11px] text-muted-foreground">
          {inv.beds} beds · {inv.availableNow} now · {inv.next7} in 7d · {inv.hold} hold · {inv.occupied} occupied
        </span>
        <div className="ml-auto flex items-center gap-2">
          <CopyButton
            text={rooms.flatMap((r) => r.beds.map((b) => `${r.room || r.type} ${b.label} — ${BED_STATE_LABEL[b.state]}${b.from && b.state !== "available" ? ` ${b.from}` : ""} · ₹${b.asking.toLocaleString("en-IN")} (last ₹${(b.floor || b.target).toLocaleString("en-IN")})`)).join("\n")}
            label="Copy inventory"
          />
          {rooms.length === 0 && (
            <button onClick={onSeed} className="rounded-md border border-border px-2 py-1 text-[11px] font-medium hover:bg-muted">Seed from prices</button>
          )}
          <button onClick={addRoom} className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] font-medium hover:bg-muted"><Plus className="h-3 w-3" /> Room</button>
          <button disabled={busy} onClick={onSave} className="rounded-md border border-accent px-2 py-1 text-[11px] font-semibold text-accent hover:bg-accent/10 disabled:opacity-50">Save inventory</button>
        </div>
      </div>

      {rooms.map((r, ri) => (
        <div key={r.id} className="rounded-md border border-border p-2 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <input value={r.floor} onChange={(e) => onChange(rooms.map((x, i) => i === ri ? { ...x, floor: e.target.value } : x))} placeholder="Floor" className="w-16 rounded-md border border-border bg-background px-2 py-1 text-xs" />
            <input value={r.room} onChange={(e) => onChange(rooms.map((x, i) => i === ri ? { ...x, room: e.target.value } : x))} placeholder="Room no" className="w-24 rounded-md border border-border bg-background px-2 py-1 text-xs" />
            <input value={r.type} onChange={(e) => onChange(rooms.map((x, i) => i === ri ? { ...x, type: e.target.value } : x))} placeholder="Type" className="w-28 rounded-md border border-border bg-background px-2 py-1 text-xs" />
            <button onClick={() => addBed(ri)} className="rounded-md border border-border px-2 py-1 text-[11px] hover:bg-muted">+ Bed</button>
            <button onClick={() => onChange(rooms.filter((_, i) => i !== ri))} className="ml-auto rounded-md border border-destructive/40 px-2 py-1 text-[11px] text-destructive hover:bg-destructive/10"><Trash2 className="h-3 w-3" /></button>
          </div>

          {r.beds.map((b, bi) => {
            const band = priceBand(b.floor || b.target || b.asking, b);
            return (
              <div key={b.id} className="grid grid-cols-2 md:grid-cols-7 gap-2 items-center rounded-md bg-muted/30 p-2">
                <input value={b.label} onChange={(e) => patchBed(ri, bi, { label: e.target.value })} className="rounded-md border border-border bg-background px-2 py-1 text-xs" />
                <select value={b.state} onChange={(e) => patchBed(ri, bi, { state: e.target.value as BedState })} className={cn("rounded-md border px-2 py-1 text-xs", BED_STATE_TONE[b.state])}>
                  {BED_STATES.map((s) => <option key={s} value={s}>{BED_STATE_LABEL[s]}</option>)}
                </select>
                <input type="date" value={b.from ?? ""} onChange={(e) => patchBed(ri, bi, { from: e.target.value })} className="rounded-md border border-border bg-background px-2 py-1 text-xs" />
                <NumIn value={b.asking} onChange={(n) => patchBed(ri, bi, { asking: n })} ph="Asking" />
                <NumIn value={b.target} onChange={(n) => patchBed(ri, bi, { target: n })} ph="Target" />
                <NumIn value={b.floor} onChange={(n) => patchBed(ri, bi, { floor: n })} ph="Floor" />
                <div className="flex items-center gap-1">
                  <span className={cn("rounded border px-1.5 py-0.5 text-[10px] truncate", PRICE_BAND_TONE[band])} title={PRICE_BAND_LABEL[band]}>
                    {b.floor > b.target || b.target > b.asking ? "⚠ ladder" : `≥₹${b.target.toLocaleString("en-IN")} instant`}
                  </span>
                  <button onClick={() => onChange(rooms.map((x, i) => i === ri ? { ...x, beds: x.beds.filter((_, j) => j !== bi) } : x))} className="rounded border border-destructive/40 px-1 py-0.5 text-[10px] text-destructive">×</button>
                </div>
              </div>
            );
          })}
        </div>
      ))}
      {rooms.length === 0 && <div className="text-xs text-muted-foreground">No bed-level inventory yet — seed it from the price list and edit.</div>}
    </div>
  );
}

function NumIn({ value, onChange, ph }: { value: number; onChange: (n: number) => void; ph: string }) {
  return (
    <div className="relative">
      <IndianRupee className="absolute left-1.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
      <input type="number" value={value || ""} placeholder={ph} onChange={(e) => onChange(Number(e.target.value) || 0)} className="w-full rounded-md border border-border bg-background pl-6 pr-2 py-1 text-xs" />
    </div>
  );
}

const CHARGE_FIELDS: [keyof NonNullable<PGX["charges"]>, string][] = [
  ["deposit", "Deposit"], ["maintenance", "Maintenance"], ["food", "Food charge"],
  ["setup", "Setup / onboarding"], ["discount", "Discount policy"], ["joiningOffer", "Joining offer"],
  ["longStay", "Long-stay pricing"], ["immediateMove", "Immediate-move pricing"],
];

function ChargesEditor({ draft, onChange, onSave, busy }: { draft: PGX; onChange: (p: PGX) => void; onSave: () => void; busy: boolean }) {
  const c = draft.charges ?? {};
  return (
    <div className="rounded-lg border bg-card p-3 space-y-2">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold inline-flex items-center gap-1.5"><Wallet className="h-4 w-4 text-accent" /> Charges & offers</h3>
        <div className="ml-auto flex items-center gap-2">
          <CopyButton text={CHARGE_FIELDS.map(([k, l]) => `${l}: ${c[k] ?? "—"}`).join("\n")} label="Copy" />
          <button disabled={busy} onClick={onSave} className="rounded-md border border-accent px-2 py-1 text-[11px] font-semibold text-accent hover:bg-accent/10 disabled:opacity-50">Save</button>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {CHARGE_FIELDS.map(([k, l]) => (
          <label key={k} className="block">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{l}</span>
            <input value={c[k] ?? ""} onChange={(e) => onChange({ ...draft, charges: { ...c, [k]: e.target.value } })} className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm" />
          </label>
        ))}
      </div>
    </div>
  );
}

function HistoryPanel({ draft }: { draft: PGX }) {
  const h = draft.history ?? [];
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex items-center gap-2 mb-2">
        <h3 className="text-sm font-semibold">Change & verification history</h3>
        <CopyButton text={h.map((e) => `${new Date(e.at).toLocaleString("en-IN")} · ${e.what}${e.to ? ` → ${e.to}` : ""}${e.by ? ` (${e.by})` : ""}`).join("\n")} label="Copy" />
      </div>
      {h.length === 0 && <div className="text-xs text-muted-foreground">Nothing recorded yet.</div>}
      <div className="space-y-1">
        {h.map((e, i) => (
          <div key={i} className="flex items-center gap-2 text-[11px] border-b border-border/60 py-1">
            <BadgeCheck className="h-3 w-3 text-accent shrink-0" />
            <span className="font-medium">{e.what}</span>
            {e.from && <span className="text-muted-foreground">{e.from} →</span>}
            {e.to && <span className="text-muted-foreground">{e.to}</span>}
            <span className="ml-auto text-muted-foreground">{new Date(e.at).toLocaleString("en-IN")}{e.by ? ` · ${e.by}` : ""}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function FieldEditor({ field, draft, onChange }: { field: VField; draft: PGX; onChange: (p: PGX) => void }) {
  const value = field.get(draft);
  const big = field.kind === "area" || field.kind === "lines";
  return (
    <label className={cn("block", big && "md:col-span-2")}>
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{field.label}</span>
      {big ? (
        <textarea rows={field.kind === "lines" ? 5 : 3} value={value} onChange={(e) => onChange(field.set(draft, e.target.value) as PGX)} className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm" />
      ) : (
        <input value={value} onChange={(e) => onChange(field.set(draft, e.target.value) as PGX)} className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm" />
      )}
    </label>
  );
}

export { healthTone, sellability, healthScore, verifySummary };
