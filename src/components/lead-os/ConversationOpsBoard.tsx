// Shared SLA + conversation analytics. Used by Control Tower and Admin so both
// read exactly the same numbers off the same canonical leads.
import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, Filter, RefreshCw, Search, ShieldAlert, Timer } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  listLeadOpsRows,
  listLibraryBuckets,
  type LeadOpsRow,
  type LibraryBucket,
} from "@/lib/lead-os/library";
import { computeSla, humanAge, SLA_FILTERS, WAITING_PARTIES, type SlaFilter, type SlaVerdict } from "@/lib/lead-os/sla";

const pretty = (v?: string | null) => (v || "—").replaceAll("_", " ");
const CLOSED = new Set(["closed", "lost", "expired", "booked"]);

const TONE: Record<string, string> = {
  ok: "border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  warn: "border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  danger: "border-red-500/60 bg-red-500/10 text-red-600",
  muted: "border-border text-muted-foreground",
};

export interface ScoredLead extends LeadOpsRow {
  sla: SlaVerdict;
  waiting: string;
  bucketMeta: LibraryBucket | null;
}

export function useScoredLeads() {
  const [leads, setLeads] = useState<LeadOpsRow[]>([]);
  const [buckets, setBuckets] = useState<LibraryBucket[]>([]);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [rows, libBuckets] = await Promise.all([listLeadOpsRows(), listLibraryBuckets()]);
      setLeads(rows);
      setBuckets(libBuckets);
    } catch {
      /* keep the board usable even without evidence tables */
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const scored = useMemo<ScoredLead[]>(() => {
    const map = new Map(buckets.map((b) => [b.bucket, b]));
    return leads.map((lead) => {
      const bucketMeta = lead.conversation_bucket ? map.get(lead.conversation_bucket) ?? null : null;
      const closed = CLOSED.has(String(lead.status || "").toLowerCase());
      const sla = computeSla({
        lastActivityAt: lead.last_operator_action_at || lead.latest_whatsapp_observation_at || lead.updated_at,
        bucket: bucketMeta,
        owned: Boolean(lead.current_owner),
        closed,
      });
      return { ...lead, sla, bucketMeta, waiting: String(bucketMeta?.waiting_on || "REVIEW").toUpperCase() };
    });
  }, [leads, buckets]);

  return { scored, buckets, loading, reload: load };
}

export function ConversationOpsBoard({ title, subtitle }: { title: string; subtitle: string }) {
  const { scored, loading, reload } = useScoredLeads();
  const [slaFilter, setSlaFilter] = useState<SlaFilter>("BREACH");
  const [waiting, setWaiting] = useState("ALL");
  const [bucketFilter, setBucketFilter] = useState("ALL");
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(50);

  const stats = useMemo(() => ({
    total: scored.length,
    breached: scored.filter((l) => l.sla.state === "BREACH" || l.sla.state === "CRITICAL").length,
    critical: scored.filter((l) => l.sla.state === "CRITICAL").length,
    due: scored.filter((l) => l.sla.state === "DUE").length,
    review: scored.filter((l) => l.sla.state === "REVIEW").length,
    escalated: scored.filter((l) => l.sla.escalate).length,
    unowned: scored.filter((l) => !l.current_owner).length,
  }), [scored]);

  const byWaiting = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const lead of scored) counts[lead.waiting] = (counts[lead.waiting] || 0) + 1;
    return counts;
  }, [scored]);

  const worstBuckets = useMemo(() => {
    const counts = new Map<string, number>();
    for (const lead of scored) {
      if (lead.sla.state !== "BREACH" && lead.sla.state !== "CRITICAL") continue;
      const key = lead.conversation_bucket || "UNCLASSIFIED";
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [scored]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return scored
      .filter((lead) => {
        if (slaFilter === "BREACH" && !(lead.sla.state === "BREACH" || lead.sla.state === "CRITICAL")) return false;
        if (slaFilter === "DUE" && lead.sla.state !== "DUE") return false;
        if (slaFilter === "OK" && lead.sla.state !== "OK") return false;
        if (slaFilter === "REVIEW" && lead.sla.state !== "REVIEW") return false;
        if (slaFilter === "ESCALATED" && !lead.sla.escalate) return false;
        if (waiting !== "ALL" && lead.waiting !== waiting) return false;
        if (bucketFilter !== "ALL" && (lead.conversation_bucket || "UNCLASSIFIED") !== bucketFilter) return false;
        if (needle && ![lead.wa_name, lead.phone, lead.conversation_bucket, lead.latest_whatsapp_preview].some((v) => String(v || "").toLowerCase().includes(needle))) return false;
        return true;
      })
      .sort((a, b) => b.sla.overdueMin - a.sla.overdueMin || b.sla.ageMin - a.sla.ageMin);
  }, [scored, slaFilter, waiting, bucketFilter, query]);

  useEffect(() => { setLimit(50); }, [slaFilter, waiting, bucketFilter, query]);

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{subtitle}</p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm"><Link to="/flow-os">Lead OS</Link></Button>
          <Button variant="outline" size="sm" onClick={() => void reload()} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />Refresh
          </Button>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="Customers tracked" value={stats.total} />
        <Stat label="SLA breached" value={stats.breached} danger={stats.breached > 0} icon={Timer} />
        <Stat label="Critical (3× SLA)" value={stats.critical} danger={stats.critical > 0} icon={AlertTriangle} />
        <Stat label="Due soon" value={stats.due} warn={stats.due > 0} />
        <Stat label="Nobody owns it" value={stats.unowned} warn={stats.unowned > 0} />
        <Stat label="Escalated to tower" value={stats.escalated} danger={stats.escalated > 0} icon={ShieldAlert} />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card className="p-4">
          <h2 className="text-sm font-semibold">Who the conversation is waiting on</h2>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {WAITING_PARTIES.filter((w) => byWaiting[w]).map((w) => (
              <button key={w} onClick={() => setWaiting(waiting === w ? "ALL" : w)}>
                <Badge variant={waiting === w ? "default" : "secondary"}>{pretty(w)} · {byWaiting[w]}</Badge>
              </button>
            ))}
            {!Object.keys(byWaiting).length && <span className="text-xs text-muted-foreground">No classified conversations yet.</span>}
          </div>
        </Card>
        <Card className="p-4">
          <h2 className="text-sm font-semibold">Conversation states breaching SLA most</h2>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {worstBuckets.map(([bucket, count]) => (
              <button key={bucket} onClick={() => setBucketFilter(bucketFilter === bucket ? "ALL" : bucket)}>
                <Badge variant={bucketFilter === bucket ? "default" : "outline"} className={bucketFilter === bucket ? "" : TONE.danger}>{pretty(bucket)} · {count}</Badge>
              </button>
            ))}
            {!worstBuckets.length && <span className="text-xs text-muted-foreground">Nothing breaching right now.</span>}
          </div>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <div className="space-y-3 border-b p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">Work queue — slowest first</h2>
            <Badge variant="secondary">{filtered.length} shown</Badge>
          </div>
          <div className="grid gap-2 md:grid-cols-[1.6fr_repeat(2,1fr)]">
            <label className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input className="pl-9" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, phone, state or last message…" /></label>
            <select className="h-10 rounded-md border bg-background px-3 text-sm" value={slaFilter} onChange={(e) => setSlaFilter(e.target.value as SlaFilter)}>
              {SLA_FILTERS.map((f) => <option key={f} value={f}>{f === "ALL" ? "All SLA states" : pretty(f)}</option>)}
            </select>
            <select className="h-10 rounded-md border bg-background px-3 text-sm" value={waiting} onChange={(e) => setWaiting(e.target.value)}>
              <option value="ALL">All waiting parties</option>
              {WAITING_PARTIES.map((w) => <option key={w} value={w}>{pretty(w)}</option>)}
            </select>
          </div>
        </div>

        <div className="divide-y">
          {filtered.slice(0, limit).map((lead) => (
            <div key={lead.id} className={`grid gap-2 p-3 text-sm lg:grid-cols-[1.2fr_.8fr_.9fr_1.4fr_.9fr] lg:items-center ${lead.sla.tone === "danger" ? "bg-red-500/5" : ""}`}>
              <div className="min-w-0">
                <div className="truncate font-semibold">{lead.wa_name || "Unnamed customer"}</div>
                <div className="text-xs text-muted-foreground">{lead.phone}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase text-muted-foreground">Step / stage</div>
                <div className="text-xs">{lead.journey_step || "S1"} · {pretty(lead.current_pipeline_stage)}</div>
              </div>
              <div className="min-w-0">
                <div className="text-[10px] uppercase text-muted-foreground">Conversation state</div>
                <div className="truncate text-xs">{pretty(lead.conversation_bucket)}</div>
                <div className="text-[10px] text-muted-foreground">waiting {pretty(lead.waiting)}</div>
              </div>
              <div className="min-w-0">
                <div className="text-[10px] uppercase text-muted-foreground">Next action</div>
                <div className="truncate text-xs">{pretty(lead.bucketMeta?.default_next_action)}</div>
                <div className="truncate text-[10px] text-muted-foreground">{lead.latest_whatsapp_preview || "No captured message"}</div>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-1.5">
                <Badge variant="outline" className={TONE[lead.sla.tone]}>{lead.sla.label}</Badge>
                {!lead.current_owner && <Badge variant="outline" className={TONE.warn}>Unowned · idle {humanAge(lead.sla.ageMin)}</Badge>}
                {lead.sla.escalate && <Badge variant="outline" className={TONE.danger}><ShieldAlert className="mr-1 h-3 w-3" />Control Tower</Badge>}
              </div>
            </div>
          ))}
          {filtered.length > limit && <div className="flex justify-center p-3"><Button variant="outline" size="sm" onClick={() => setLimit((v) => v + 50)}>Show 50 more</Button></div>}
          {!filtered.length && <div className="p-10 text-center text-sm text-muted-foreground"><Filter className="mx-auto mb-2 h-5 w-5" />Nothing matches these filters.</div>}
        </div>
      </Card>
    </div>
  );
}

function Stat({ label, value, danger, warn, icon: Icon }: { label: string; value: number; danger?: boolean; warn?: boolean; icon?: React.ComponentType<{ className?: string }> }) {
  return (
    <Card className={`p-3 ${danger ? "border-red-500/50" : warn ? "border-amber-500/45" : ""}`}>
      <div className="flex items-center justify-between">
        <div className="text-2xl font-bold tabular-nums">{value}</div>
        {Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
      </div>
      <div className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
    </Card>
  );
}
