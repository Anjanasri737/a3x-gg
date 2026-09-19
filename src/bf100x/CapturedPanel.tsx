// Everything captured on one customer, in one glance — so nobody has to walk the
// screens to find out what is already known.
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { JOURNEY } from "@/bookingflow/journey";
import type { JStep } from "@/bookingflow/journey";
import { health, fmtMins } from "@/bookingflow/engine";
import type { FlowLead } from "@/bookingflow/types";
import { useCommitments, openCommitmentFor, hoursLeft } from "@/lib/commitments/store";

const labelFor = (st: JStep, field: string) =>
  field === st.field ? st.title : (st.extra ?? []).find((x) => x.field === field)?.label ?? field;

export function CapturedPanel({ lead }: { lead: FlowLead }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const all = useCommitments();
  const promise = openCommitmentFor(all, lead.id);

  const f = lead.f ?? {};
  const h = mounted ? health(lead) : undefined;

  const groups: { group: string; rows: { label: string; value: string }[] }[] = [];
  JOURNEY.forEach((st) => {
    const rows = [st.field, ...(st.extra ?? []).map((x) => x.field)]
      .filter((k) => f[k])
      .map((k) => ({ label: labelFor(st, k), value: f[k]! }));
    if (!rows.length) return;
    const last = groups[groups.length - 1];
    if (last && last.group === st.group) last.rows.push(...rows);
    else groups.push({ group: st.group, rows });
  });

  const answered = groups.reduce((n, g) => n + g.rows.length, 0);

  return (
    <Card className="p-3 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Everything captured</p>
      <p className="mt-0.5 text-[11px] text-muted-foreground">{answered} details recorded on {lead.name}</p>

      <div className="mt-2 grid gap-1 text-[11px]">
        <Line label="Owner" value={lead.owner ?? "NOBODY"} bad={!lead.owner} />
        <Line label="Stage" value={mounted && h ? (h.complete ? "Checked in" : h.step?.title ?? "—") : "—"} />
        <Line label="Waiting on" value={mounted && h ? h.waitingOn : "—"} />
        <Line label="Next step" value={lead.nextAction ?? "NOT SET"} bad={!lead.nextAction} />
        <Line
          label="By when"
          value={mounted && lead.nextActionAt ? new Date(lead.nextActionAt).toLocaleString() : "NO DEADLINE"}
          bad={!lead.nextActionAt || h?.sla === "LATE"}
        />
        <Line
          label="Closing promise"
          value={mounted && promise ? `${new Date(promise.dueAt).toLocaleString()} · ${Math.round(hoursLeft(promise))}h left` : "not promised"}
          bad={!promise}
        />
      </div>

      {mounted && h && (h.sla === "LATE" || h.toTower || h.signals.length > 0) && (
        <div className="mt-2 flex flex-wrap gap-1">
          {h.sla === "LATE" && <Badge variant="destructive" className="text-[10px]">late {fmtMins(h.minutesLate)}</Badge>}
          {h.toTower && <Badge variant="destructive" className="text-[10px]">Control Tower</Badge>}
          {h.signals.map((s) => (
            <Badge key={s} variant="outline" className="border-destructive/40 text-[10px] text-destructive">{s}</Badge>
          ))}
        </div>
      )}

      {lead.labels.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {lead.labels.map((l) => <Badge key={l} variant="outline" className="text-[10px]">{l}</Badge>)}
        </div>
      )}

      <div className="mt-3 space-y-2 border-t pt-2">
        {groups.length === 0 && (
          <p className="text-[11px] text-muted-foreground">
            Answer the first screen and every detail will start listing here.
          </p>
        )}
        {groups.map((g, i) => (
          <div key={`${g.group}-${i}`}>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{g.group}</p>
            <div className="mt-0.5 grid gap-0.5">
              {g.rows.map((r, j) => <Line key={`${r.label}-${j}`} label={r.label} value={r.value} />)}
            </div>
          </div>
        ))}
      </div>

      {lead.events.length > 0 && (
        <div className="mt-3 border-t pt-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Last moves</p>
          <ol className="mt-1 space-y-1 text-[11px]">
            {[...lead.events].slice(-6).reverse().map((e, i) => (
              <li key={i} className="text-muted-foreground">
                <span className="font-medium text-foreground">{e.label}</span>
                {e.detail ? ` — ${e.detail}` : ""} · {mounted ? new Date(e.at).toLocaleTimeString() : ""}
              </li>
            ))}
          </ol>
        </div>
      )}
    </Card>
  );
}

function Line({ label, value, bad }: { label: string; value: string; bad?: boolean }) {
  return (
    <div className="flex gap-2">
      <span className="w-[6.5rem] shrink-0 text-muted-foreground">{label}</span>
      <span className={bad ? "font-medium text-destructive" : "font-medium"}>{value}</span>
    </div>
  );
}
