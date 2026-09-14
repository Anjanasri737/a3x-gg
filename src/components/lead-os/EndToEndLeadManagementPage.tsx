import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  CalendarCheck2,
  History,
  Filter,
  Layers3,
  MessageSquare,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { UnifiedCustomerWorkspace } from "@/components/flow-os/UnifiedCustomerWorkspace";
import { LeadQualificationEditor } from "./LeadQualificationEditor";
import { currentUserId, getTruthRow, listTruthRows, type TruthRow } from "@/lib/flow-os/service";
import { createOrOpenCanonicalLead } from "@/lib/lead-os/service";
import { listLeadJourneyMap, listLibraryBuckets, type LeadJourneyMeta, type LibraryBucket } from "@/lib/lead-os/library";
import { computeSla, humanAge, SLA_FILTERS, WAITING_PARTIES, type SlaFilter, type SlaVerdict } from "@/lib/lead-os/sla";
import { LeadJourneyStrip } from "./LeadJourneyStrip";
import { LeadStoryPanel } from "./LeadStoryPanel";

const PIPELINE = [
  "DOSSIER",
  "MATCHED",
  "TOUR_SCHEDULED",
  "TOUR_CONFIRMED",
  "TOUR_IN_PROGRESS",
  "POST_VISIT",
  "QUOTED",
  "NEGOTIATION",
  "BOOKED",
  "CHECKED_IN",
] as const;

type Cohort = "ALL" | "CURRENT" | "OLD" | "EXPIRED" | "TOURS";

const TOUR_STAGES = new Set(["TOUR_SCHEDULED", "TOUR_CONFIRMED", "TOUR_IN_PROGRESS"]);

function activityAt(row: TruthRow) {
  return row.last_operator_action_at || row.latest_observation_at || row.updated_at || row.created_at || null;
}

function isExpired(row: TruthRow) {
  return ["expired", "closed", "lost"].includes(String(row.lead_status || "").toLowerCase()) || row.current_pipeline_stage === "LOST";
}

function isOld(row: TruthRow) {
  const value = activityAt(row);
  return !isExpired(row) && Boolean(value && Date.parse(value) < Date.now() - 30 * 24 * 60 * 60 * 1000);
}

function cohortOf(row: TruthRow): Exclude<Cohort, "ALL"> {
  if (isExpired(row)) return "EXPIRED";
  if (TOUR_STAGES.has(row.current_pipeline_stage || "")) return "TOURS";
  if (isOld(row)) return "OLD";
  return "CURRENT";
}

function pretty(value?: string | null) {
  return (value || "—").replaceAll("_", " ");
}

export function EndToEndLeadManagementPage() {
  const [rows, setRows] = useState<TruthRow[]>([]);
  const [selected, setSelected] = useState<TruthRow | null>(null);
  const [me, setMe] = useState<string | null>(null);
  const [journey, setJourney] = useState<Record<string, LeadJourneyMeta>>({});
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [stage, setStage] = useState("ALL");
  const [ownership, setOwnership] = useState("ALL");
  const [sync, setSync] = useState("ALL");
  const [cohort, setCohort] = useState<Cohort>("ALL");
  const [visibleLimit, setVisibleLimit] = useState(75);
  const [newOpen, setNewOpen] = useState(false);
  const [newBusy, setNewBusy] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [location, setLocation] = useState("");
  const [moveIn, setMoveIn] = useState("");

  async function load() {
    setLoading(true);
    try {
      const [truth, userId, journeyMap] = await Promise.all([
        listTruthRows(),
        currentUserId(),
        listLeadJourneyMap().catch(() => ({} as Record<string, LeadJourneyMeta>)),
      ]);
      setRows(truth);
      setMe(userId);
      setJourney(journeyMap);
      if (selected) {
        const fresh = await getTruthRow(selected.lead_id);
        if (fresh) setSelected(fresh);
      }
    } catch (error: any) {
      toast.error(error?.message || "Could not load Lead OS");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (needle && ![
        row.wa_name,
        row.phone,
        row.location_text,
        row.current_owner_name,
        row.last_message_preview,
      ].some((value) => String(value || "").toLowerCase().includes(needle))) return false;
      if (stage !== "ALL" && row.current_pipeline_stage !== stage) return false;
      if (sync !== "ALL" && row.sync_state !== sync) return false;
      if (cohort !== "ALL" && cohortOf(row) !== cohort) return false;
      if (ownership === "MINE" && row.current_owner !== me && row.current_handler !== me && row.reservation_operator !== me) return false;
      if (ownership === "UNOWNED" && row.current_owner) return false;
      return true;
    });
  }, [rows, query, stage, sync, ownership, cohort, me]);

  useEffect(() => { setVisibleLimit(75); }, [query, stage, sync, ownership, cohort]);

  const stats = useMemo(() => ({
    open: rows.filter((row) => !["CHECKED_IN", "LOST"].includes(row.current_pipeline_stage || "")).length,
    mine: rows.filter((row) => me && (row.current_owner === me || row.current_handler === me || row.reservation_operator === me)).length,
    red: rows.filter((row) => row.sync_state === "RED").length,
    due: rows.filter((row) => row.next_action_at && Date.parse(row.next_action_at) <= Date.now()).length,
    booked: rows.filter((row) => row.current_pipeline_stage === "BOOKED").length,
    checkedIn: rows.filter((row) => row.current_pipeline_stage === "CHECKED_IN").length,
    current: rows.filter((row) => cohortOf(row) === "CURRENT").length,
    old: rows.filter((row) => cohortOf(row) === "OLD").length,
    expired: rows.filter((row) => cohortOf(row) === "EXPIRED").length,
    tours: rows.filter((row) => cohortOf(row) === "TOURS").length,
  }), [rows, me]);

  const stageCounts = useMemo(() => Object.fromEntries(
    PIPELINE.map((key) => [key, rows.filter((row) => row.current_pipeline_stage === key).length]),
  ), [rows]);

  async function createLead() {
    if (!phone.trim()) { toast.error("Phone is required"); return; }
    setNewBusy(true);
    try {
      const result = await createOrOpenCanonicalLead({
        name,
        phone,
        locationText: location,
        moveInDate: moveIn || undefined,
      });
      toast.success(result.created ? "Canonical lead created and assigned to you" : "Existing canonical lead opened — duplicate avoided");
      setName(""); setPhone(""); setLocation(""); setMoveIn(""); setNewOpen(false);
      await load();
      const fresh = await getTruthRow(result.lead.lead_id);
      setSelected(fresh || result.lead);
    } catch (error: any) {
      toast.error(error?.message || "Could not create/open lead");
    } finally {
      setNewBusy(false);
    }
  }

  if (selected) {
    return <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="outline" onClick={() => setSelected(null)}>← All Leads</Button>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm"><Link to="/vision"><MessageSquare className="mr-1.5 h-4 w-4" />WhatsApp Truth</Link></Button>
          <Button asChild variant="outline" size="sm"><Link to="/my-work"><Layers3 className="mr-1.5 h-4 w-4" />My 30</Link></Button>
          <Badge variant="outline" className="px-3">END-TO-END LEAD OS</Badge>
        </div>
      </div>
      <LeadConversationLibraryPanel leadId={selected.lead_id} stepIndex={journey[selected.lead_id]?.journey_step_index} />
      <LeadQualificationEditor
        lead={selected}
        onSaved={async (fresh) => {
          setSelected(fresh);
          await load();
        }}
      />
      <UnifiedCustomerWorkspace
        lead={selected}
        onClose={() => setSelected(null)}
        onChanged={async () => {
          await load();
          const fresh = await getTruthRow(selected.lead_id);
          if (fresh) setSelected(fresh);
        }}
      />
    </div>;
  }

  return <div className="space-y-5">
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-3xl font-bold tracking-tight">Lead OS</h1>
          <Badge className="gap-1"><ShieldCheck className="h-3 w-3" /> END-TO-END</Badge>
        </div>
        <p className="mt-2 max-w-4xl text-sm text-muted-foreground">
          One place to manage every canonical customer from intake to physical check-in. WhatsApp Truth, Draft 30 and Control Tower are supporting engines; this is the day-to-day lead-management front door.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline"><Link to="/vision"><MessageSquare className="mr-2 h-4 w-4" />Sync WhatsApp</Link></Button>
        <Button asChild variant="outline"><Link to="/conversation-library" search={{ bucket: undefined }}><MessageSquare className="mr-2 h-4 w-4" />Conversation Library</Link></Button>
        <Button asChild variant="outline"><Link to="/my-work"><Layers3 className="mr-2 h-4 w-4" />My 30 / Active 13</Link></Button>
        <Button asChild variant="outline"><Link to="/tower/final-moment"><CalendarCheck2 className="mr-2 h-4 w-4" />Control Tower</Link></Button>
        <Button variant="outline" onClick={() => void load()} disabled={loading}><RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />Refresh</Button>
        <Button onClick={() => setNewOpen((value) => !value)}><Plus className="mr-2 h-4 w-4" />New / Find Lead</Button>
      </div>
    </header>

    <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
      <CohortButton label="All leads" value={rows.length} active={cohort === "ALL"} onClick={() => setCohort("ALL")} icon={Layers3} />
      <CohortButton label="Current" value={stats.current} active={cohort === "CURRENT"} onClick={() => setCohort("CURRENT")} icon={UserRound} />
      <CohortButton label="Old · 30+ days" value={stats.old} active={cohort === "OLD"} onClick={() => setCohort("OLD")} icon={History} />
      <CohortButton label="Expired / lost" value={stats.expired} active={cohort === "EXPIRED"} onClick={() => setCohort("EXPIRED")} icon={Clock3} />
      <CohortButton label="Tours live" value={stats.tours} active={cohort === "TOURS"} onClick={() => setCohort("TOURS")} icon={CalendarCheck2} />
    </div>

    <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
      <Stat label="Active customers" value={stats.open} icon={UserRound} />
      <Stat label="My universe" value={stats.mine} icon={UserRound} good />
      <Stat label="Revenue leaks" value={stats.red} icon={AlertTriangle} danger={stats.red > 0} />
      <Stat label="Due now" value={stats.due} icon={Clock3} warn={stats.due > 0} />
      <Stat label="Booked / check-in pending" value={stats.booked} icon={ShieldCheck} warn={stats.booked > 0} />
      <Stat label="Checked in" value={stats.checkedIn} icon={CheckCircle2} good />
    </div>

    {newOpen && <Card className="border-primary/40 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div><h2 className="font-semibold">New / Find canonical lead</h2><p className="text-xs text-muted-foreground">Phone is the identity key. If the customer already exists, Lead OS opens that record instead of creating another one.</p></div>
        <Badge variant="outline">NO DUPLICATES</Badge>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[1fr_1fr_1.3fr_1fr_auto] items-end">
        <label className="space-y-1 text-xs"><span>Name</span><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Customer name" /></label>
        <label className="space-y-1 text-xs"><span>Phone *</span><Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="9876543210" /></label>
        <label className="space-y-1 text-xs"><span>Location requirement</span><Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Koramangala / Whitefield..." /></label>
        <label className="space-y-1 text-xs"><span>Move-in date</span><Input type="date" value={moveIn} onChange={(e) => setMoveIn(e.target.value)} /></label>
        <Button disabled={newBusy || !phone.trim()} onClick={() => void createLead()}>{newBusy ? "Opening…" : "Create / Open"}<ArrowRight className="ml-2 h-4 w-4" /></Button>
      </div>
    </Card>}

    <Card className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="font-semibold">Pipeline at a glance</h2><p className="text-xs text-muted-foreground">Click a stage to filter the same canonical lead universe.</p></div>
        <Badge variant="outline">{rows.length} canonical records</Badge>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        {PIPELINE.map((key) => <button key={key} onClick={() => setStage(stage === key ? "ALL" : key)} className={`rounded-lg border p-3 text-left transition-colors ${stage === key ? "border-primary bg-primary/5" : "hover:bg-muted/40"}`}>
          <div className="text-xl font-bold tabular-nums">{stageCounts[key] || 0}</div>
          <div className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">{pretty(key)}</div>
        </button>)}
      </div>
    </Card>

    <Card className="overflow-hidden">
      <div className="border-b p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="font-semibold">All Leads</h2><p className="text-xs text-muted-foreground">Search, filter, open, work and move one canonical customer through the full lifecycle.</p></div>
          <Badge variant="secondary">{filtered.length} shown</Badge>
        </div>
        <div className="grid gap-2 md:grid-cols-[1.6fr_repeat(3,1fr)]">
          <label className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input className="pl-9" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, phone, location, owner or last message…" /></label>
          <select className="h-10 rounded-md border bg-background px-3 text-sm" value={stage} onChange={(e) => setStage(e.target.value)}><option value="ALL">All stages</option>{PIPELINE.map((key) => <option key={key} value={key}>{pretty(key)}</option>)}<option value="LOST">Lost</option></select>
          <select className="h-10 rounded-md border bg-background px-3 text-sm" value={ownership} onChange={(e) => setOwnership(e.target.value)}><option value="ALL">All ownership</option><option value="MINE">My universe</option><option value="UNOWNED">Unowned only</option></select>
          <select className="h-10 rounded-md border bg-background px-3 text-sm" value={sync} onChange={(e) => setSync(e.target.value)}><option value="ALL">All truth states</option><option value="RED">RED — leakage</option><option value="AMBER">AMBER — sync</option><option value="GREEN">GREEN</option><option value="GREY">GREY — future</option></select>
        </div>
      </div>

      <div className="divide-y">
        {filtered.slice(0, visibleLimit).map((row) => <button key={row.lead_id} onClick={() => setSelected(row)} className="grid w-full gap-3 p-4 text-left hover:bg-muted/30 lg:grid-cols-[1.25fr_.8fr_.9fr_.9fr_1.6fr_auto] lg:items-center">
          <div className="min-w-0">
            <div className="flex items-center gap-2"><span className="truncate font-semibold">{row.wa_name || "Unnamed customer"}</span><SyncDot state={row.sync_state} /></div>
            <div className="mt-0.5 text-xs text-muted-foreground">{row.phone}</div><div className="mt-1 text-[10px] uppercase text-muted-foreground">{pretty(cohortOf(row))} · {activityAt(row) ? new Date(activityAt(row) as string).toLocaleDateString() : "No activity"}</div>
          </div>
          <div><div className="text-[10px] uppercase text-muted-foreground">Stage</div><Badge variant="outline" className="mt-1">{pretty(row.current_pipeline_stage)}</Badge></div>
          <div className="min-w-0"><div className="text-[10px] uppercase text-muted-foreground">Requirement</div><div className="mt-1 truncate text-sm">{row.location_text || "Location missing"}</div><div className="text-xs text-muted-foreground">{row.movein_date || "Move-in missing"}</div></div>
          <div className="min-w-0"><div className="text-[10px] uppercase text-muted-foreground">Owner / handler</div><div className="mt-1 truncate text-sm">{row.current_owner_name || "Unowned"}</div><div className="truncate text-xs text-muted-foreground">{row.current_handler_name ? `Live: ${row.current_handler_name}` : row.reservation_operator_name ? `Draft: ${row.reservation_operator_name}` : "No live handler"}</div></div>
          <div className="min-w-0"><div className="text-[10px] uppercase text-muted-foreground">What happens next</div><div className="mt-1 truncate text-sm">{row.next_action_kind || row.current_mission || "No dated next action"}</div><div className={`text-xs ${row.next_action_at && Date.parse(row.next_action_at) <= Date.now() ? "text-red-600" : "text-muted-foreground"}`}>{row.next_action_at ? new Date(row.next_action_at).toLocaleString() : "Missing"}</div></div>
          <div className="flex justify-end"><Button size="sm">Open customer <ArrowRight className="ml-1.5 h-3.5 w-3.5" /></Button></div>
          <div className="lg:col-span-6 space-y-1.5">
            <LeadJourneyStrip currentIndex={journey[row.lead_id]?.journey_step_index ?? 1} compact />
            <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
              {journey[row.lead_id]?.conversation_bucket && <Badge variant="secondary" className="text-[10px]">{String(journey[row.lead_id]?.conversation_bucket).replaceAll("_", " ")}</Badge>}
              {Boolean(journey[row.lead_id]?.library_rows_count) && <span>{journey[row.lead_id]?.library_rows_count} captured chat lines</span>}
            </div>
          </div>
        </button>)}
        {filtered.length > visibleLimit && <div className="flex justify-center p-4"><Button variant="outline" onClick={() => setVisibleLimit((value) => value + 75)}>Show 75 more</Button></div>}
        {!filtered.length && <div className="p-10 text-center text-sm text-muted-foreground"><Filter className="mx-auto mb-2 h-5 w-5" />No leads match these filters.</div>}
      </div>
    </Card>
  </div>;
}

function CohortButton({ label, value, active, onClick, icon: Icon }: { label: string; value: number; active: boolean; onClick: () => void; icon: React.ComponentType<{ className?: string }> }) {
  return <Button variant={active ? "default" : "outline"} className="h-auto min-h-16 justify-between px-3 py-2 text-left" onClick={onClick}>
    <span><span className="block text-xl font-bold tabular-nums">{value}</span><span className="block text-[10px] uppercase">{label}</span></span><Icon className="h-4 w-4 opacity-70" />
  </Button>;
}

function SyncDot({ state }: { state: TruthRow["sync_state"] }) {
  return <span title={state} className={`h-2.5 w-2.5 shrink-0 rounded-full ${state === "RED" ? "bg-red-500" : state === "AMBER" ? "bg-amber-500" : state === "GREY" ? "bg-slate-400" : "bg-emerald-500"}`} />;
}

function Stat({ label, value, icon: Icon, danger, warn, good }: { label: string; value: number; icon: React.ComponentType<{ className?: string }>; danger?: boolean; warn?: boolean; good?: boolean }) {
  return <Card className={`p-3 ${danger ? "border-red-500/45" : warn ? "border-amber-500/45" : good ? "border-emerald-500/40" : ""}`}>
    <div className="flex items-center justify-between"><div className="text-2xl font-bold tabular-nums">{value}</div><Icon className="h-4 w-4 text-muted-foreground" /></div>
    <div className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
  </Card>;
}
