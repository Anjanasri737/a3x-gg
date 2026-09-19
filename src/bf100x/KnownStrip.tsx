// Everything already answered on this customer, pinned under the name so the
// operator can read it while typing the next answer — no scrolling, no tab switch.
import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { JOURNEY } from "@/bookingflow/journey";
import type { JStep } from "@/bookingflow/journey";
import type { FlowLead } from "@/bookingflow/types";
import { cn } from "@/lib/utils";

const labelFor = (st: JStep, field: string) =>
  field === st.field ? st.title : (st.extra ?? []).find((x) => x.field === field)?.label ?? field;

export interface KnownRow {
  group: string;
  label: string;
  value: string;
}

export function knownRows(lead: FlowLead): KnownRow[] {
  const f = lead.f ?? {};
  const rows: KnownRow[] = [];
  JOURNEY.forEach((st) => {
    [st.field, ...(st.extra ?? []).map((x) => x.field)].forEach((k) => {
      if (f[k]) rows.push({ group: st.group, label: labelFor(st, k), value: f[k]! });
    });
  });
  return rows;
}

/** A short label so a long sentence still fits a chip. */
const short = (v: string) => (v.length > 34 ? `${v.slice(0, 33)}…` : v);

export function KnownStrip({ lead }: { lead: FlowLead }) {
  const [open, setOpen] = useState(false);
  const rows = useMemo(() => knownRows(lead), [lead]);

  const grouped = useMemo(() => {
    const out: { group: string; rows: KnownRow[] }[] = [];
    rows.forEach((r) => {
      const last = out[out.length - 1];
      if (last && last.group === r.group) last.rows.push(r);
      else out.push({ group: r.group, rows: [r] });
    });
    return out;
  }, [rows]);

  return (
    <div className="shrink-0 border-b bg-muted/30 px-3 py-1.5">
      <div className="flex items-center gap-2">
        <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Already filled · {rows.length}
        </span>
        {rows.length > 0 && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="ml-auto flex shrink-0 items-center gap-0.5 rounded-md border px-1.5 py-0.5 text-[10px] text-muted-foreground hover:text-foreground"
          >
            {open ? "Hide all" : "Read all"}
            {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="mt-0.5 text-[10px] text-muted-foreground">
          Nothing answered yet — the first answer you save appears right here.
        </p>
      ) : !open ? (
        // newest answers first, one scrollable line so the layout never grows
        <div className="mt-1 flex gap-1 overflow-x-auto pb-0.5">
          {[...rows].reverse().map((r, i) => (
            <span
              key={`${r.label}-${i}`}
              title={`${r.label}: ${r.value}`}
              className={cn(
                "shrink-0 rounded-md border bg-background px-1.5 py-0.5 text-[10px]",
                i === 0 && "border-primary/50 text-primary",
              )}
            >
              <span className="text-muted-foreground">{r.label}:</span> <span className="font-medium">{short(r.value)}</span>
            </span>
          ))}
        </div>
      ) : (
        <div className="mt-1 max-h-40 space-y-1.5 overflow-y-auto pr-1">
          {grouped.map((g, i) => (
            <div key={`${g.group}-${i}`}>
              <p className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">{g.group}</p>
              <div className="mt-0.5 grid gap-0.5">
                {g.rows.map((r, j) => (
                  <div key={`${r.label}-${j}`} className="flex gap-2 text-[10px]">
                    <span className="w-[7.5rem] shrink-0 text-muted-foreground">{r.label}</span>
                    <span className="min-w-0 font-medium">{r.value}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
