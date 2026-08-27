import { useEffect, useMemo, useState } from "react";
import { BadgeCheck, CalendarClock, Check, IndianRupee, ShieldCheck, Save } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { CopyButton } from "@/components/supply/MessageKit";
import {
  AVAIL_LABEL, AVAIL_TONE, VERIFY_SECTIONS, availabilityLine, blankAvailability,
  type AvailStatus, type Availability, type PGDoc, type VField,
} from "@/supply-hub/lib/verify";

/**
 * One sheet to verify a property end-to-end: every section is editable inline,
 * each gets its own verify stamp, and availability (per room, from-date and the
 * best price we can still close at) sits on top.
 */
export function VerifySheet({ pg, onSave }: { pg: PGDoc; onSave: (next: PGDoc) => Promise<{ ok: boolean; error?: string }> }) {
  const [draft, setDraft] = useState<PGDoc>(() => JSON.parse(JSON.stringify(pg)) as PGDoc);
  const [busy, setBusy] = useState(false);

  useEffect(() => { setDraft(JSON.parse(JSON.stringify(pg)) as PGDoc); }, [pg]);

  const avail = draft.availability ?? blankAvailability(draft);
  const stamps = draft.verification?.sections ?? {};
  const doneCount = VERIFY_SECTIONS.filter((s) => stamps[s.id]).length;
  const pct = Math.round((doneCount / VERIFY_SECTIONS.length) * 100);

  const persist = async (next: PGDoc, msg: string) => {
    setBusy(true);
    setDraft(next);
    const res = await onSave(next);
    setBusy(false);
    if (res.ok) toast.success(msg);
    else toast.error(res.error ?? "Could not save");
  };

  const saveDraft = () => void persist(draft, "Changes saved");

  const verifySection = (id: string) => {
    const now = new Date().toISOString();
    const sections = { ...stamps, [id]: { at: now } };
    const all = VERIFY_SECTIONS.every((s) => sections[s.id]);
    void persist(
      { ...draft, verification: { ...draft.verification, sections, verifiedAt: all ? now : null } },
      all ? "Property fully verified" : "Section verified",
    );
  };

  const unverifySection = (id: string) => {
    const sections = { ...stamps };
    delete sections[id];
    void persist({ ...draft, verification: { ...draft.verification, sections, verifiedAt: null } }, "Section reopened");
  };

  const verifyAll = () => {
    const now = new Date().toISOString();
    const sections: Record<string, { at: string }> = {};
    for (const s of VERIFY_SECTIONS) sections[s.id] = { at: now };
    void persist({ ...draft, verification: { sections, verifiedAt: now } }, "Everything verified");
  };

  const setAvail = (patch: Partial<Availability>) =>
    setDraft((d) => ({ ...d, availability: { ...avail, ...patch, updatedAt: new Date().toISOString() } }));

  const summary = useMemo(() => availabilityLine({ ...draft, availability: avail }), [draft, avail]);

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-card p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn("inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-semibold",
            draft.verification?.verifiedAt ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-400" : "border-border text-muted-foreground")}>
            <BadgeCheck className="h-3.5 w-3.5" /> {draft.verification?.verifiedAt ? "Verified" : "Not verified"}
          </span>
          <span className="text-xs text-muted-foreground">{doneCount}/{VERIFY_SECTIONS.length} sections · {pct}%</span>
          <div className="ml-auto flex items-center gap-2">
            <button disabled={busy} onClick={saveDraft} className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50">
              <Save className="h-3.5 w-3.5" /> Save edits
            </button>
            <button disabled={busy} onClick={verifyAll} className="inline-flex items-center gap-1 rounded-md bg-accent px-2.5 py-1.5 text-xs font-semibold text-accent-foreground hover:opacity-90 disabled:opacity-50">
              <ShieldCheck className="h-3.5 w-3.5" /> Verify everything
            </button>
          </div>
        </div>
        <div className="mt-2 h-1.5 rounded bg-muted overflow-hidden">
          <div className="h-full bg-emerald-400" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {/* Availability */}
      <div className="rounded-lg border bg-card p-3 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold inline-flex items-center gap-1.5"><CalendarClock className="h-4 w-4 text-accent" /> Availability</h3>
          <span className={cn("rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider", AVAIL_TONE[avail.status])}>
            {AVAIL_LABEL[avail.status]}
          </span>
          <div className="ml-auto flex items-center gap-2">
            <CopyButton text={`${draft.name}\n${summary}`} label="Copy availability" />
            <button disabled={busy} onClick={saveDraft} className="rounded-md border border-border px-2 py-1 text-[11px] font-medium hover:bg-muted disabled:opacity-50">Save</button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Status
            <select value={avail.status} onChange={(e) => setAvail({ status: e.target.value as AvailStatus })} className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm">
              {(Object.keys(AVAIL_LABEL) as AvailStatus[]).map((s) => <option key={s} value={s}>{AVAIL_LABEL[s]}</option>)}
            </select>
          </label>
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Available from
            <input type="date" value={avail.from} onChange={(e) => setAvail({ from: e.target.value })} className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm" />
          </label>
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Note
            <input value={avail.note} onChange={(e) => setAvail({ note: e.target.value })} placeholder="e.g. 2 beds blocked till 5th" className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm" />
          </label>
        </div>

        <div className="space-y-2">
          {avail.rooms.map((r, i) => (
            <div key={i} className="grid grid-cols-2 sm:grid-cols-6 gap-2 rounded-md border border-border p-2">
              <input value={r.type} onChange={(e) => setAvail({ rooms: avail.rooms.map((x, j) => j === i ? { ...x, type: e.target.value } : x) })} placeholder="Room type" className="rounded-md border border-border bg-background px-2 py-1 text-xs" />
              <input type="number" value={r.beds || ""} onChange={(e) => setAvail({ rooms: avail.rooms.map((x, j) => j === i ? { ...x, beds: Number(e.target.value) || 0 } : x) })} placeholder="Beds free" className="rounded-md border border-border bg-background px-2 py-1 text-xs" />
              <input type="date" value={r.from} onChange={(e) => setAvail({ rooms: avail.rooms.map((x, j) => j === i ? { ...x, from: e.target.value } : x) })} className="rounded-md border border-border bg-background px-2 py-1 text-xs" />
              <div className="relative">
                <IndianRupee className="absolute left-1.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                <input type="number" value={r.lastPrice || ""} onChange={(e) => setAvail({ rooms: avail.rooms.map((x, j) => j === i ? { ...x, lastPrice: Number(e.target.value) || 0 } : x) })} placeholder="Last price" className="w-full rounded-md border border-border bg-background pl-6 pr-2 py-1 text-xs" />
              </div>
              <label className="inline-flex items-center gap-1.5 text-[11px]">
                <input type="checkbox" checked={r.available} onChange={(e) => setAvail({ rooms: avail.rooms.map((x, j) => j === i ? { ...x, available: e.target.checked } : x) })} />
                Available
              </label>
              <button onClick={() => setAvail({ rooms: avail.rooms.filter((_, j) => j !== i) })} className="rounded-md border border-destructive/40 px-2 py-1 text-[11px] text-destructive hover:bg-destructive/10">Remove</button>
            </div>
          ))}
          <button
            onClick={() => setAvail({ rooms: [...avail.rooms, { type: "", beds: 0, available: true, from: new Date().toISOString().slice(0, 10), lastPrice: 0, note: "" }] })}
            className="rounded-md border border-border px-2 py-1 text-[11px] font-medium hover:bg-muted"
          >
            + Add room type
          </button>
        </div>
      </div>

      {/* Sections */}
      {VERIFY_SECTIONS.map((sec) => {
        const done = !!stamps[sec.id];
        return (
          <div key={sec.id} className={cn("rounded-lg border bg-card p-3 space-y-2", done && "border-emerald-400/40")}>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold">{sec.label}</h3>
              {done && <span className="inline-flex items-center gap-1 rounded border border-emerald-400/40 bg-emerald-400/10 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-400"><Check className="h-3 w-3" /> Verified</span>}
              <div className="ml-auto flex items-center gap-2">
                <CopyButton text={sec.fields.map((f) => `${f.label}: ${f.get(draft)}`).join("\n")} label="Copy" />
                {done ? (
                  <button disabled={busy} onClick={() => unverifySection(sec.id)} className="rounded-md border border-border px-2 py-1 text-[11px] font-medium hover:bg-muted disabled:opacity-50">Reopen</button>
                ) : (
                  <button disabled={busy} onClick={() => verifySection(sec.id)} className="inline-flex items-center gap-1 rounded-md border border-emerald-400/50 px-2 py-1 text-[11px] font-semibold text-emerald-400 hover:bg-emerald-400/10 disabled:opacity-50">
                    <Check className="h-3 w-3" /> Verify section
                  </button>
                )}
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {sec.fields.map((f) => (
                <FieldEditor key={f.key} field={f} draft={draft} onChange={setDraft} />
              ))}
            </div>
            <div className="flex justify-end">
              <button disabled={busy} onClick={saveDraft} className="rounded-md border border-border px-2 py-1 text-[11px] font-medium hover:bg-muted disabled:opacity-50">Save edits</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function FieldEditor({ field, draft, onChange }: { field: VField; draft: PGDoc; onChange: (p: PGDoc) => void }) {
  const value = field.get(draft);
  const big = field.kind === "area" || field.kind === "lines";
  return (
    <label className={cn("block", big && "md:col-span-2")}>
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{field.label}</span>
      {big ? (
        <textarea
          rows={field.kind === "lines" ? 5 : 3}
          value={value}
          onChange={(e) => onChange(field.set(draft, e.target.value))}
          className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
        />
      ) : (
        <input
          value={value}
          onChange={(e) => onChange(field.set(draft, e.target.value))}
          className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
        />
      )}
    </label>
  );
}
