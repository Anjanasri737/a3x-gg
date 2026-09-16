// Every lead in one list: stage, owner, next action, deadline and exceptions.
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { Lead } from "./types";
import { STAGE_ORDER, WORKFLOW } from "./workflow";
import { batchComplete, controlTowerExceptions, redSignals, sla, universalGaps } from "./engine";
import { GROUPS, TOTAL_STEPS, stepNumber, stepRange } from "./StepLadder";

type Filter = "ALL" | "MINE" | "UNOWNED" | "OVERDUE" | "EXCEPTIONS" | "TOURS" | "BOOKINGS" | "CLOSED";

export function AllMovesBoard({ leads, me, onOpen, selectedId }: {
  leads: Lead[]; me: string; onOpen: (id: string) => void; selectedId?: string;
}) {
  const [filter, setFilter] = useState<Filter>("ALL");
  const [q, setQ] = useState("");

  const rows = useMemo(() => leads.filter((l) => {
    const group = WORKFLOW[l.stage].group;
    const ok =
      filter === "ALL" ? true :
      filter === "MINE" ? l.owner === me :
      filter === "UNOWNED" ? !l.owner :
      filter === "OVERDUE" ? sla(l).overdue :
      filter === "EXCEPTIONS" ? controlTowerExceptions(l).length > 0 :
      filter === "TOURS" ? group === "tour" :
      filter === "BOOKINGS" ? group === "booking" || group === "checkin" :
      group === "closed";
    if (!ok) return false;
    const t = q.trim().toLowerCase();
    return !t || `${l.name} ${l.phone} ${l.stage} ${l.useCase}`.toLowerCase().includes(t);
  }).sort((a, b) => (STAGE_ORDER.indexOf(a.stage) - STAGE_ORDER.indexOf(b.stage)) || a.name.localeCompare(b.name)),
  [leads, filter, q, me]);

  const counts = {
    all: leads.length,
    unowned: leads.filter((l) => !l.owner).length,
    overdue: leads.filter((l) => sla(l).overdue).length,
    exceptions: leads.filter((l) => controlTowerExceptions(l).length > 0).length,
    incomplete: leads.filter((l) => !batchComplete(l)).length,
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <Stat label="All leads" value={counts.all} />
        <Stat label="Unowned" value={counts.unowned} bad={counts.unowned > 0} />
        <Stat label="Overdue" value={counts.overdue} bad={counts.overdue > 0} />
        <Stat label="Control Tower" value={counts.exceptions} bad={counts.exceptions > 0} />
        <Stat label="Batch incomplete" value={counts.incomplete} bad={counts.incomplete > 0} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {(["ALL", "MINE", "UNOWNED", "OVERDUE", "EXCEPTIONS", "TOURS", "BOOKINGS", "CLOSED"] as Filter[]).map((f) => (
          <Button key={f} size="sm" variant={filter === f ? "default" : "outline"} onClick={() => setFilter(f)}>{f}</Button>
        ))}
        <Input className="w-56" placeholder="Search name, number, stage" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <div className="space-y-2">
        {rows.map((l) => {
          const t = sla(l);
          const ex = controlTowerExceptions(l);
          const sig = redSignals(l);
          const gaps = universalGaps(l);
          return (
            <Card key={l.id} onClick={() => onOpen(l.id)}
              className={`cursor-pointer p-3 transition hover:bg-muted/50 ${l.id === selectedId ? "border-primary" : ""} ${t.overdue ? "border-destructive/50" : ""}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{l.name}</span>
                  <Badge variant="outline">{l.stage.replace(/_/g, " ")}</Badge>
                  {l.labels.timing && <Badge variant="secondary">{l.labels.timing.replace(/_/g, " ")}</Badge>}
                  <span className="text-xs text-muted-foreground">{l.owner ?? "UNOWNED"}</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground">{l.nextAction ?? "no next action"}</span>
                  <Badge variant={t.overdue ? "destructive" : t.severity === "WARNING" ? "secondary" : "outline"}>{t.label}</Badge>
                </div>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{l.useCase}</p>
              {(sig.length > 0 || gaps.length > 0 || ex.length > 0) && (
                <p className="mt-1 text-xs text-destructive">
                  {[...sig.map((s) => s.label), ...gaps.map((g) => `${g} missing`), ...ex].slice(0, 3).join(" · ")}
                </p>
              )}
            </Card>
          );
        })}
        {rows.length === 0 && <p className="p-4 text-sm text-muted-foreground">Nothing matches this filter.</p>}
      </div>
    </div>
  );
}

function Stat({ label, value, bad }: { label: string; value: number; bad?: boolean }) {
  return (
    <Card className="p-3">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`text-xl font-semibold ${bad ? "text-destructive" : ""}`}>{value}</p>
    </Card>
  );
}
