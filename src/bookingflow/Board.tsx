// Every lead, with filters an operator and an admin actually use.
import { useMemo, useState } from "react";
import { AlertTriangle, Search, ShieldAlert } from "lucide-react";
import { ContactActions } from "@/components/common/ContactActions";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { health, fmtMins } from "./engine";
import { GROUPS } from "./journey";
import { useBookingFlow } from "./store";
import { useHydrated } from "./useHydrated";

type Filter = "ALL" | "MINE" | "NO_OWNER" | "NO_NEXT" | "LATE" | "TOWER" | "STUCK" | "DONE";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "ALL", label: "Everything" },
  { key: "MINE", label: "Mine" },
  { key: "NO_OWNER", label: "No owner" },
  { key: "NO_NEXT", label: "No next step" },
  { key: "LATE", label: "Past deadline" },
  { key: "STUCK", label: "Not moving 7d+" },
  { key: "TOWER", label: "Control Tower" },
  { key: "DONE", label: "Checked in" },
];

export function Board({ onOpenLead }: { onOpenLead: (id: string) => void }) {
  const { leads, me } = useBookingFlow();
  const hydrated = useHydrated();
  const [filter, setFilter] = useState<Filter>("ALL");
  const [group, setGroup] = useState<string>("ALL");
  const [q, setQ] = useState("");

  const rows = useMemo(() => {
    if (!hydrated) return [];
    return leads
      .map((l) => ({ l, h: health(l) }))
      .filter(({ l, h }) => {
        if (group !== "ALL" && h.step?.group !== group) return false;
        if (q && !(`${l.name} ${l.phone} ${l.owner ?? ""}`.toLowerCase().includes(q.toLowerCase()))) return false;
        switch (filter) {
          case "MINE": return l.owner === me;
          case "NO_OWNER": return !l.owner;
          case "NO_NEXT": return !l.nextAction || !l.nextActionAt;
          case "LATE": return h.sla === "LATE";
          case "STUCK": return h.signals.some((s) => s.startsWith("No movement"));
          case "TOWER": return h.toTower;
          case "DONE": return h.complete;
          default: return true;
        }
      })
      .sort((a, b) => b.h.signals.length - a.h.signals.length || a.h.stepNo - b.h.stepNo);
  }, [leads, filter, group, q, me, hydrated]);

  const counts = useMemo(() => {
    if (!hydrated) return { total: 0, noOwner: 0, noNext: 0, late: 0, tower: 0, done: 0 };
    const hs = leads.map((l) => ({ l, h: health(l) }));
    return {
      total: hs.length,
      noOwner: hs.filter((x) => !x.l.owner).length,
      noNext: hs.filter((x) => !x.l.nextAction || !x.l.nextActionAt).length,
      late: hs.filter((x) => x.h.sla === "LATE").length,
      tower: hs.filter((x) => x.h.toTower).length,
      done: hs.filter((x) => x.h.complete).length,
    };
  }, [leads, hydrated]);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Customers" value={counts.total} />
        <Stat label="No owner" value={counts.noOwner} bad />
        <Stat label="No next step" value={counts.noNext} bad />
        <Stat label="Past deadline" value={counts.late} bad />
        <Stat label="Control Tower" value={counts.tower} bad />
        <Stat label="Checked in" value={counts.done} />
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {FILTERS.map((f) => (
          <Button key={f.key} size="sm" variant={filter === f.key ? "default" : "outline"} className="h-7 px-2 text-[11px]" onClick={() => setFilter(f.key)}>{f.label}</Button>
        ))}
        <div className="relative ml-auto">
          <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
          <Input className="h-8 w-48 pl-7 text-xs" placeholder="Name, number, owner" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <Button size="sm" variant={group === "ALL" ? "secondary" : "ghost"} className="h-7 px-2 text-[11px]" onClick={() => setGroup("ALL")}>All stages</Button>
        {GROUPS.map((g) => (
          <Button key={g} size="sm" variant={group === g ? "secondary" : "ghost"} className="h-7 px-2 text-[11px]" onClick={() => setGroup(g)}>{g}</Button>
        ))}
      </div>

      <div className="space-y-1.5">
        {rows.map(({ l, h }) => (
          <button key={l.id} type="button" onClick={() => onOpenLead(l.id)} className="w-full rounded-lg border p-3 text-left transition hover:border-primary hover:bg-accent">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{l.name}</span>
              <span className="text-xs text-muted-foreground">{l.phone}</span>
              <ContactActions compact phone={l.phone} name={l.name} />
              <Badge variant="outline" className="text-[10px]">{h.stepNo}. {h.complete ? "Checked in" : h.step?.title}</Badge>
              <Badge variant="secondary" className="text-[10px]">{l.owner ?? "no owner"}</Badge>
              {h.sla === "LATE" && <Badge variant="destructive" className="text-[10px]">late {fmtMins(h.minutesLate)}</Badge>}
              {h.toTower && <Badge variant="destructive" className="text-[10px]"><ShieldAlert className="mr-1 h-3 w-3" />tower</Badge>}
              <span className="ml-auto text-xs text-muted-foreground">waiting on {h.waitingOn}</span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>Next: {l.nextAction ?? "—"}</span>
              <span>By: {l.nextActionAt ? new Date(l.nextActionAt).toLocaleString() : "—"}</span>
              {h.signals.slice(0, 2).map((s) => (
                <span key={s} className="flex items-center gap-1 text-destructive"><AlertTriangle className="h-3 w-3" />{s}</span>
              ))}
            </div>
          </button>
        ))}
        {hydrated && rows.length === 0 && (
          <Card className="p-6 text-center text-sm text-muted-foreground">No customer matches this filter. Try another one.</Card>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, bad }: { label: string; value: number; bad?: boolean }) {
  return (
    <Card className="p-2.5">
      <p className="text-[10px] uppercase text-muted-foreground">{label}</p>
      <p className={`text-lg font-semibold ${bad && value > 0 ? "text-destructive" : ""}`}>{value}</p>
    </Card>
  );
}
