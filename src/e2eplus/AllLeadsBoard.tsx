// Every lead in one execution list: stage, owner, what happened, next action,
// deadline — with SLA colours, red-signal counts and the execution drawer.
import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  listLeadOpsRows, listLibraryBuckets, type LeadOpsRow, type LibraryBucket,
} from "@/lib/lead-os/library";
import { computeSla, humanAge, SLA_FILTERS, WAITING_PARTIES, type SlaFilter, type SlaVerdict } from "@/lib/lead-os/sla";
import { MASTER_JOURNEY, masterStageIndex, redSignals, screenshotSafe } from "./journey";
import { LeadDrawer } from "./LeadDrawer";
import { useE2EPlus } from "./store";

interface Scored { row: LeadOpsRow; bucket: LibraryBucket | null; sla: SlaVerdict; signals: number; stage: number }

const CLOSED = new Set(["closed", "lost", "expired", "booked"]);

export function AllLeadsBoard() {
  const [rows, setRows] = useState<LeadOpsRow[]>([]);
  const [buckets, setBuckets] = useState<LibraryBucket[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [slaFilter, setSlaFilter] = useState<SlaFilter>("ALL");
  const [waiting, setWaiting] = useState<string>("ALL");
  const [limit, setLimit] = useState(50);
  const [openId, setOpenId] = useState<string | null>(null);
  const execs = useE2EPlus((s) => s.leads);
  const hydrate = useE2EPlus((s) => s.hydrate);

  useEffect(() => {
    void (async () => {
      try {
        const [r, b] = await Promise.all([listLeadOpsRows(), listLibraryBuckets().catch(() => [])]);
        setRows(r); setBuckets(b);
        // Ownership, next actions and timelines are team-wide, not per browser.
        await hydrate();
      } finally { setLoading(false); }
    })();
  }, [hydrate]);

  const bucketMap = useMemo(() => {
    const m = new Map<string, LibraryBucket>();
    for (const b of buckets) m.set(b.bucket, b);
    return m;
  }, [buckets]);

  const scored = useMemo<Scored[]>(() => rows.map((row) => {
    const bucket = row.conversation_bucket ? bucketMap.get(row.conversation_bucket) ?? null : null;
    const activity = row.last_operator_action_at || row.latest_whatsapp_observation_at || row.updated_at;
    const claimed = Boolean(execs[row.id]?.ownerId) || Boolean(row.current_owner);
    const closed = CLOSED.has(String(row.status || "").toLowerCase());
    const sla = computeSla({ lastActivityAt: activity, bucket, owned: claimed, closed });
    const signals = redSignals({ row, bucket, sla, claimed, heartbeatState: screenshotSafe(activity, closed) }).length;
    return { row, bucket, sla, signals, stage: masterStageIndex(row, claimed) };
  }), [rows, bucketMap, execs]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return scored
      .filter((s) => {
        if (q && !`${s.row.wa_name ?? ""} ${s.row.phone ?? ""} ${s.row.conversation_bucket ?? ""}`.toLowerCase().includes(q)) return false;
        if (slaFilter === "BREACH" && !(s.sla.state === "BREACH" || s.sla.state === "CRITICAL")) return false;
        if (slaFilter === "DUE" && s.sla.state !== "DUE") return false;
        if (slaFilter === "OK" && s.sla.state !== "OK") return false;
        if (slaFilter === "REVIEW" && s.sla.state !== "REVIEW") return false;
        if (slaFilter === "ESCALATED" && !s.sla.escalate) return false;
        if (waiting !== "ALL" && String(s.bucket?.waiting_on || "REVIEW").toUpperCase() !== waiting) return false;
        return true;
      })
      .sort((a, b) => b.sla.overdueMin - a.sla.overdueMin || b.signals - a.signals);
  }, [scored, query, slaFilter, waiting]);

  const active = filtered.find((s) => s.row.id === openId) ?? scored.find((s) => s.row.id === openId) ?? null;

  const stat = (label: string, value: number | string) => (
    <div className="rounded-lg border bg-muted/30 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold leading-tight">{value}</div>
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {stat("All leads", scored.length)}
        {stat("Breached", scored.filter((s) => s.sla.state === "BREACH" || s.sla.state === "CRITICAL").length)}
        {stat("Due soon", scored.filter((s) => s.sla.state === "DUE").length)}
        {stat("Unowned", scored.filter((s) => !s.row.current_owner && !execs[s.row.id]?.ownerId).length)}
        {stat("To Control Tower", scored.filter((s) => s.sla.escalate).length)}
      </div>

      <Card className="space-y-2 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-56 flex-1">
            <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input className="h-9 pl-7 text-xs" placeholder="Search name, number or conversation state"
              value={query} onChange={(e) => { setQuery(e.target.value); setLimit(50); }} />
          </div>
          <div className="flex flex-wrap gap-1">
            {SLA_FILTERS.map((f) => (
              <button key={f} type="button" onClick={() => { setSlaFilter(f); setLimit(50); }}
                className={cn("rounded-full border px-2.5 py-1 text-[11px]",
                  slaFilter === f ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground hover:bg-muted")}>
                {f}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1">
            {["ALL", ...WAITING_PARTIES].map((w) => (
              <button key={w} type="button" onClick={() => { setWaiting(w); setLimit(50); }}
                className={cn("rounded-full border px-2 py-0.5 text-[10px]",
                  waiting === w ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground hover:bg-muted")}>
                {w === "ALL" ? "Any waiting party" : w}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {loading && <div className="rounded-lg border border-dashed p-8 text-center text-xs text-muted-foreground">Loading leads…</div>}

      <div className="space-y-1.5">
        {filtered.slice(0, limit).map(({ row, bucket, sla, signals, stage }) => {
          const exec = execs[row.id];
          const owner = exec?.ownerName || row.current_owner;
          return (
            <button key={row.id} type="button" onClick={() => setOpenId(row.id)}
              className={cn("w-full rounded-lg border-l-4 border p-2.5 text-left transition-colors hover:bg-muted/50",
                sla.tone === "danger" ? "border-l-red-500 bg-red-500/5"
                  : sla.tone === "warn" ? "border-l-amber-500 bg-amber-500/5" : "border-l-transparent")}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">{row.wa_name || "Unnamed"}</span>
                <span className="text-[11px] text-muted-foreground">{row.phone}</span>
                <Badge variant="secondary" className="text-[10px]">{MASTER_JOURNEY[stage]?.label}</Badge>
                {bucket?.bucket && <Badge variant="outline" className="text-[10px]">{bucket.bucket.replaceAll("_", " ")}</Badge>}
                {signals > 0 && <Badge variant="outline" className="border-red-500/50 text-[10px] text-red-600">{signals} red signals</Badge>}
                <span className="ml-auto text-[11px] text-muted-foreground">idle {humanAge(sla.ageMin)}</span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px]">
                <Badge variant="outline" className={cn("text-[10px]",
                  sla.tone === "danger" ? "border-red-500/60 text-red-600" : sla.tone === "warn" ? "border-amber-500/50 text-amber-700 dark:text-amber-400" : "")}>
                  {sla.label}
                </Badge>
                <span className="text-muted-foreground">Owner: {owner ? String(owner) : "nobody"}</span>
                <span className="text-muted-foreground">Waiting on {String(bucket?.waiting_on || "REVIEW").toLowerCase()}</span>
                <span className="text-muted-foreground">
                  Next: {exec?.nextAction || (bucket?.default_next_action || "unset").replaceAll("_", " ")}
                  {exec?.nextActionAt ? ` · by ${new Date(exec.nextActionAt).toLocaleString()}` : bucket?.sla_min ? ` · within ${humanAge(bucket.sla_min)}` : ""}
                </span>
                {sla.escalate && <Badge variant="outline" className="border-red-500/60 text-[10px] text-red-600">Escalated to Control Tower</Badge>}
              </div>
            </button>
          );
        })}
        {!loading && !filtered.length && (
          <div className="rounded-lg border border-dashed p-8 text-center text-xs text-muted-foreground">No lead matches these filters.</div>
        )}
      </div>

      {filtered.length > limit && (
        <Button variant="outline" size="sm" onClick={() => setLimit((l) => l + 50)}>Show 50 more ({filtered.length - limit} left)</Button>
      )}

      <LeadDrawer row={active?.row ?? null} bucket={active?.bucket ?? null} sla={active?.sla ?? null}
        open={Boolean(openId)} onOpenChange={(v) => !v && setOpenId(null)} />
    </div>
  );
}
