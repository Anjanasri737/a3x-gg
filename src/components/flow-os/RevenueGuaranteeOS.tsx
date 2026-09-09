import { useCallback, useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Eye,
  FileImage,
  Inbox,
  Layers3,
  LockKeyhole,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  UploadCloud,
  Users,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ChatSignalStrip } from "./ChatSignalStrip";
import { LeadCommandWorkspace } from "./LeadCommandWorkspace";
import { classifyLastMessage } from "@/lib/flow-os/chat-intelligence";
import {
  createDraft30,
  getFlowSession,
  ingestScreenshotBatch,
  loadIdentityReviewRows,
  loadLabelColourMappings,
  loadLeakageBuckets,
  loadOperatorWork,
  loadRecentBatches,
  loadThreeDayTruthSummary,
  parseStructuredChatRows,
  requestTakeover,
  saveLabelColourMapping,
  signInFlowOperator,
  signOutFlowOperator,
  type BatchReconciliationSummary,
  type LeakageBucket,
  type OperatorWorkState,
  type WorkItemView,
} from "@/lib/flow-os/revenue-api";

const MAIN_TABS = ["My Work", "Screenshot Intake", "Revenue Leakage", "Label Map"] as const;
type MainTab = (typeof MAIN_TABS)[number];
const WORK_TABS = ["NOW", "MY 30", "WAITING / FUTURE", "DONE TODAY"] as const;
type WorkTab = (typeof WORK_TABS)[number];

export function RevenueGuaranteeOS() {
  const [session, setSession] = useState<any>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [tab, setTab] = useState<MainTab>("My Work");

  useEffect(() => {
    getFlowSession().then((value) => {
      setSession(value);
      setAuthChecked(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  if (!authChecked) return <div className="py-16 text-center text-sm text-muted-foreground">Loading Flow OS…</div>;
  if (!session) return <FlowSignIn />;

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Gharpayy Flow OS</div>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">WhatsApp Reality → CRM Reality</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Every visible customer must be represented, owned and moving. Screenshot observations update the same lead; Draft 30 prevents eight-person collision; red exceptions are revenue leakage.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="h-8">{session.user.email}</Badge>
          <Button variant="outline" size="sm" onClick={() => signOutFlowOperator()}>Sign out</Button>
        </div>
      </header>

      <div className="flex flex-wrap gap-1 rounded-xl border border-border bg-muted/30 p-1.5">
        {MAIN_TABS.map((name) => (
          <button
            key={name}
            onClick={() => setTab(name)}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${tab === name ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:bg-background/60"}`}
          >
            {name}
          </button>
        ))}
      </div>

      {tab === "My Work" && <MyWorkPanel />}
      {tab === "Screenshot Intake" && <ScreenshotIntakePanel />}
      {tab === "Revenue Leakage" && <RevenueLeakagePanel />}
      {tab === "Label Map" && <LabelMapPanel />}
    </div>
  );
}

function FlowSignIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      if (mode === "signin") {
        await signInFlowOperator(email, password);
      } else {
        const { error: signUpError } = await supabase.auth.signUp({ email, password });
        if (signUpError) throw signUpError;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Authentication failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md py-16">
      <Card className="p-6">
        <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary"><LockKeyhole className="h-5 w-5" /></div>
        <h1 className="text-2xl font-bold">Flow OS team sign-in</h1>
        <p className="mt-1 text-sm text-muted-foreground">Claims must be tied to a real operator so eight people cannot unknowingly work the same customer.</p>
        <div className="mt-5 space-y-3">
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="work@email.com" />
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" />
          {error && <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>}
          <Button className="w-full" disabled={busy || !email || password.length < 6} onClick={submit}>
            {busy ? "Working…" : mode === "signin" ? "Sign in" : "Create team account"}
          </Button>
          <button className="w-full text-center text-xs text-muted-foreground underline" onClick={() => setMode(mode === "signin" ? "signup" : "signin")}>
            {mode === "signin" ? "First time? Create team account" : "Already have an account? Sign in"}
          </button>
        </div>
      </Card>
    </div>
  );
}

function MyWorkPanel() {
  const [work, setWork] = useState<OperatorWorkState | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [workTab, setWorkTab] = useState<WorkTab>("NOW");
  const [selected, setSelected] = useState<WorkItemView | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setWork(await loadOperatorWork());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load work");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const items = useMemo(() => {
    const list = work?.items ?? [];
    if (workTab === "NOW") return list.filter((i) => (i.activeTray || i.dueNow || i.isPriorityInterrupt) && !["done", "future", "released", "passed"].includes(i.state)).sort((a, b) => Number(b.isPriorityInterrupt) - Number(a.isPriorityInterrupt) || b.roiScore - a.roiScore);
    if (workTab === "MY 30") return list.filter((i) => !["done", "future", "released", "passed"].includes(i.state));
    if (workTab === "WAITING / FUTURE") return list.filter((i) => i.state === "future" || (i.lead.pipeline_stage ?? "").toUpperCase() === "FUTURE");
    return list.filter((i) => i.state === "done");
  }, [work, workTab]);

  async function startDraft() {
    setCreating(true);
    setError(null);
    try {
      await createDraft30();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create Draft 30");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-4">
        <Metric label="My Draft" value={`${work?.myDraftCount ?? 0}/30`} icon={<Layers3 className="h-4 w-4" />} />
        <Metric label="Active Tray" value={`${work?.activeTrayCount ?? 0}/13`} icon={<Users className="h-4 w-4" />} />
        <Metric label="Due Now" value={String(work?.dueNowCount ?? 0)} danger={(work?.dueNowCount ?? 0) > 0} icon={<AlertTriangle className="h-4 w-4" />} />
        <Metric label="Priority Interrupts" value={String(work?.priorityInterruptCount ?? 0)} danger={(work?.priorityInterruptCount ?? 0) > 0} icon={<Sparkles className="h-4 w-4" />} />
      </div>

      {error && <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</div>}

      {!loading && !work?.batchId && (
        <Card className="flex flex-wrap items-center justify-between gap-3 border-primary/20 p-5">
          <div>
            <div className="font-semibold">No open Draft 30</div>
            <div className="text-sm text-muted-foreground">The engine will rank available customers by inbound movement, urgency, move-in, stage, SLA and opportunity score, then atomically reserve up to 30.</div>
          </div>
          <Button disabled={creating} onClick={startDraft}>{creating ? "Drafting…" : "Start Draft 30"}</Button>
        </Card>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1 rounded-lg border border-border bg-muted/30 p-1">
          {WORK_TABS.map((name) => (
            <button key={name} onClick={() => setWorkTab(name)} className={`rounded-md px-3 py-1.5 text-xs font-semibold ${workTab === name ? "bg-background shadow-sm" : "text-muted-foreground"}`}>{name}</button>
          ))}
        </div>
        <Button variant="outline" size="sm" disabled={loading} onClick={refresh}><RefreshCw className="mr-1.5 h-4 w-4" />Refresh</Button>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(520px,0.95fr)]">
        <div className="space-y-2">
          {loading && <Card className="p-8 text-center text-sm text-muted-foreground">Loading work…</Card>}
          {!loading && items.length === 0 && <Card className="p-8 text-center text-sm text-muted-foreground">Nothing in this work bucket.</Card>}
          {items.map((item) => (
            <WorkLeadCard key={item.itemId} item={item} selected={selected?.itemId === item.itemId} onOpen={() => setSelected(item)} />
          ))}
        </div>

        <div className="xl:sticky xl:top-20 xl:h-[calc(100vh-7rem)]">
          {selected && work ? (
            <Card className="h-full overflow-hidden">
              <LeadCommandWorkspace item={selected} operator={work.operator} onChanged={refresh} onClose={() => setSelected(null)} />
            </Card>
          ) : (
            <Card className="flex min-h-[520px] items-center justify-center p-8 text-center">
              <div>
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Inbox className="h-5 w-5" /></div>
                <div className="font-semibold">Open a customer</div>
                <div className="mt-1 max-w-xs text-sm text-muted-foreground">Understand them in seconds: WhatsApp movement, stage suggestion, handler, mission, blocker and one next action.</div>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function WorkLeadCard({ item, selected, onOpen }: { item: WorkItemView; selected: boolean; onOpen: () => void }) {
  const message = item.latestObservation?.last_message ?? item.lead.last_wa_message ?? "";
  const suggestion = classifyLastMessage(message);
  const currentHandler = item.claim?.operator_name ?? item.lead.current_handler_name;
  return (
    <button onClick={onOpen} className={`w-full rounded-xl border p-4 text-left transition hover:border-primary/40 hover:bg-muted/20 ${selected ? "border-primary bg-primary/5" : "border-border bg-card"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{item.position}. {item.lead.wa_name || "Unnamed customer"}</span>
            <Badge variant="outline" className="h-5 text-[10px]">{(item.lead.pipeline_stage || "NEW").replaceAll("_", " ")}</Badge>
            {item.isPriorityInterrupt && <Badge className="h-5 bg-red-600 text-[10px]">Interrupt</Badge>}
            {item.dueNow && <Badge variant="destructive" className="h-5 text-[10px]">Due now</Badge>}
          </div>
          <div className="mt-1 truncate text-xs text-muted-foreground">{item.lead.phone} · {item.lead.location_text || "Location unknown"}</div>
          <div className="mt-2 line-clamp-2 text-sm">{message ? `“${message}”` : "No last-message preview yet"}</div>
          <ChatSignalStrip
            compact
            seenState={(item.latestObservation?.seen_state ?? item.lead.wa_seen_state) as any}
            unreadCount={item.latestObservation?.unread_count ?? item.lead.wa_unread_count}
            observedAt={item.latestObservation?.captured_at ?? item.lead.last_wa_seen_at}
            labelColour={item.latestObservation?.label_colour ?? item.lead.wa_label_colour}
            labelName={item.latestObservation?.label_name ?? item.lead.wa_label_name}
            currentHandlerName={currentHandler}
            ownerName={item.lead.current_owner}
          />
        </div>
        <div className="min-w-[150px] rounded-lg bg-muted/40 p-2.5">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Why now</div>
          <div className="mt-1 text-xs font-medium">{item.roiReasons[0] || suggestion.suggestedMission}</div>
          <div className="mt-1 text-[10px] text-muted-foreground">ROI {Math.round(item.roiScore)} · Suggestion {Math.round(suggestion.confidence * 100)}%</div>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between border-t border-border pt-2.5 text-xs">
        <span><b>Mission:</b> {item.lead.current_mission || suggestion.suggestedMission}</span>
        <span className="inline-flex items-center gap-1 font-semibold text-primary">Open / Resume <ArrowRight className="h-3.5 w-3.5" /></span>
      </div>
    </button>
  );
}

function ScreenshotIntakePanel() {
  const [files, setFiles] = useState<File[]>([]);
  const [account, setAccount] = useState("");
  const [expected, setExpected] = useState("");
  const [paste, setPaste] = useState("");
  const [captureTo, setCaptureTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<BatchReconciliationSummary | null>(null);
  const [batches, setBatches] = useState<any[]>([]);
  const [reviewRows, setReviewRows] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  const parsed = useMemo(() => parseStructuredChatRows(paste, files[0]?.name || `batch-${Date.now()}`), [paste, files]);

  const refresh = useCallback(async () => {
    try {
      const [b, r] = await Promise.all([loadRecentBatches(), loadIdentityReviewRows()]);
      setBatches(b);
      setReviewRows(r);
    } catch { /* migrations may not be applied yet */ }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  async function submit() {
    const visible = Number.parseInt(expected, 10);
    if (!Number.isFinite(visible) || visible <= 0) {
      setError("Enter the number of visible WhatsApp rows. The system cannot guarantee zero misses without an expected row count.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await ingestScreenshotBatch({
        waAccountLabel: account || undefined,
        screenshotCount: files.length || 1,
        visibleRowsExpected: visible,
        captureTo: captureTo ? new Date(captureTo).toISOString() : undefined,
        rows: parsed,
        note: files.length ? `Selected screenshots: ${files.map((f) => f.name).join(", ")}` : "Structured row intake",
      });
      setSummary(result);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ingestion failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Card className="p-5">
          <div className="flex items-center gap-2 text-lg font-semibold"><UploadCloud className="h-5 w-5" />Screenshot / WhatsApp batch</div>
          <p className="mt-1 text-sm text-muted-foreground">Upload today's and last-three-days screenshots repeatedly. A screenshot is evidence, not a lead. Repeated customers append observations to the same canonical lead.</p>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <label className="rounded-lg border border-dashed border-border p-4 text-sm">
              <div className="mb-2 flex items-center gap-2 font-medium"><FileImage className="h-4 w-4" />Select screenshots</div>
              <input type="file" accept="image/*" multiple onChange={(e) => setFiles(Array.from(e.target.files ?? []))} className="block w-full text-xs" />
              <div className="mt-2 text-xs text-muted-foreground">{files.length ? `${files.length} selected` : "No files selected"}</div>
            </label>
            <div className="space-y-2">
              <Input value={account} onChange={(e) => setAccount(e.target.value)} placeholder="WhatsApp account / source" />
              <Input type="number" min={1} value={expected} onChange={(e) => setExpected(e.target.value)} placeholder="Visible rows expected — mandatory" />
              <Input type="datetime-local" value={captureTo} onChange={(e) => setCaptureTo(e.target.value)} aria-label="Capture time" />
            </div>
          </div>

          <div className="mt-4">
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Structured OCR rows / provider adapter input</div>
            <textarea
              value={paste}
              onChange={(e) => setPaste(e.target.value)}
              className="min-h-[220px] w-full rounded-lg border border-input bg-background p-3 font-mono text-xs outline-none focus:ring-2 focus:ring-ring"
              placeholder={"One row per visible chat:\nName | +9198... | Last message | unseen | 2 | green | blue | Tour | Aditi | 10:32 | incoming"}
            />
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>Parsed {parsed.length} rows. Every row is stored even when identity is unresolved.</span>
              <span className={Number(expected) === parsed.length && parsed.length > 0 ? "font-semibold text-emerald-700" : "font-semibold text-amber-700"}>
                Expected {expected || "?"} ↔ Parsed {parsed.length}
              </span>
            </div>
          </div>

          <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900">
            <b>OCR boundary:</b> this build includes the full provider-independent intake/reconciliation contract. It does not fake image OCR. Connect any OCR/vision provider to emit these row objects; the downstream dedupe, movement, colour, label, stage suggestion, claims and revenue controls already work.
          </div>

          {error && <div className="mt-3 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
          <Button className="mt-4" disabled={busy || parsed.length === 0} onClick={submit}>{busy ? "Reconciling…" : "Reconcile batch"}</Button>
        </Card>

        <div className="space-y-4">
          {summary ? (
            <Card className={`p-5 ${summary.status === "balanced" ? "border-emerald-300" : "border-red-300"}`}>
              <div className="flex items-center gap-2 text-lg font-semibold">
                {summary.status === "balanced" ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : <ShieldAlert className="h-5 w-5 text-red-600" />}
                Upload reconciliation
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                <MiniStat label="Screenshots" value={summary.screenshotCount} />
                <MiniStat label="Visible expected" value={summary.visibleRowsExpected} />
                <MiniStat label="Segmented" value={summary.rowsSegmented} />
                <MiniStat label="Reconciled" value={summary.rowsReconciled} />
                <MiniStat label="New leads" value={summary.newLeads} />
                <MiniStat label="Existing updated" value={summary.existingUpdated} />
                <MiniStat label="Duplicate observations" value={summary.duplicateObservations} />
                <MiniStat label="Identity review" value={summary.identityReview} />
              </div>
              <div className={`mt-3 rounded-md px-3 py-2 text-sm font-semibold ${summary.status === "balanced" ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}>
                {summary.status === "balanced" ? "BALANCED — every expected visible row is accounted for." : `${summary.status.toUpperCase()} — do not treat this batch as complete.`}
              </div>
            </Card>
          ) : (
            <Card className="p-5 text-sm text-muted-foreground">Reconciliation summary will appear here. The goal is not “OCR succeeded”; the goal is “every visible row accounted for.”</Card>
          )}

          <Card className="p-4">
            <div className="mb-2 font-semibold">Identity review ({reviewRows.length})</div>
            <div className="max-h-64 space-y-2 overflow-auto">
              {reviewRows.slice(0, 20).map((row) => (
                <div key={row.id} className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs">
                  <div className="font-semibold">{row.contact_name || "Unknown contact"} · {row.phone_raw || "phone unresolved"}</div>
                  <div className="mt-0.5 truncate">{row.last_message || row.raw_text || "No preview"}</div>
                  <div className="mt-1 text-amber-800">{row.resolution} · {row.suggestion_evidence || "Needs identity resolution"}</div>
                </div>
              ))}
              {reviewRows.length === 0 && <div className="py-4 text-center text-xs text-muted-foreground">No unresolved identities.</div>}
            </div>
          </Card>
        </div>
      </div>

      <Card className="overflow-hidden">
        <div className="border-b border-border px-4 py-3 font-semibold">Recent screenshot truth batches</div>
        <div className="overflow-auto">
          <table className="w-full min-w-[760px] text-left text-xs">
            <thead className="bg-muted/40 text-muted-foreground"><tr><th className="p-3">Time</th><th>Account</th><th>Screens</th><th>Expected</th><th>Segmented</th><th>Reconciled</th><th>Unresolved</th><th>Status</th></tr></thead>
            <tbody>{batches.map((b) => <tr key={b.id} className="border-t border-border"><td className="p-3">{new Date(b.created_at).toLocaleString()}</td><td>{b.wa_account_label || "—"}</td><td>{b.screenshot_count}</td><td>{b.visible_rows_expected}</td><td>{b.rows_segmented}</td><td>{b.rows_reconciled}</td><td>{b.unresolved_rows}</td><td><Badge variant={b.status === "balanced" ? "outline" : "destructive"}>{b.status}</Badge></td></tr>)}</tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function RevenueLeakagePanel() {
  const [buckets, setBuckets] = useState<LeakageBucket[]>([]);
  const [truth, setTruth] = useState<any>(null);
  const [selected, setSelected] = useState<LeakageBucket | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [b, t] = await Promise.all([loadLeakageBuckets(), loadThreeDayTruthSummary()]);
      setBuckets(b);
      setTruth(t);
      if (selected) setSelected(b.find((x) => x.key === selected.key) ?? null);
    } finally { setLoading(false); }
  }, [selected]);
  useEffect(() => { refresh(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const redTotal = buckets.filter((b) => b.severity === "red").reduce((sum, b) => sum + b.count, 0);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-5">
        <Metric label="3-day unique" value={String(truth?.uniqueCustomers ?? 0)} icon={<Users className="h-4 w-4" />} />
        <Metric label="Observations" value={String(truth?.observations ?? 0)} icon={<Eye className="h-4 w-4" />} />
        <Metric label="Screenshot batches" value={String(truth?.batches ?? 0)} icon={<FileImage className="h-4 w-4" />} />
        <Metric label="Unresolved" value={String(truth?.unresolved ?? 0)} danger={(truth?.unresolved ?? 0) > 0} icon={<AlertTriangle className="h-4 w-4" />} />
        <Metric label="Red leakage" value={String(redTotal)} danger={redTotal > 0} icon={<ShieldAlert className="h-4 w-4" />} />
      </div>

      <div className="flex justify-end"><Button variant="outline" size="sm" disabled={loading} onClick={refresh}><RefreshCw className="mr-1.5 h-4 w-4" />Refresh truth</Button></div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {buckets.map((bucket) => (
          <button key={bucket.key} onClick={() => setSelected(bucket)} className={`rounded-xl border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-sm ${bucket.severity === "red" ? "border-red-200 bg-red-50/70 dark:bg-red-950/20" : bucket.severity === "amber" ? "border-amber-200 bg-amber-50/70 dark:bg-amber-950/20" : "border-border bg-card"}`}>
            <div className="text-3xl font-bold tabular-nums">{bucket.count}</div>
            <div className="mt-1 text-sm font-semibold">{bucket.label}</div>
            <div className="mt-2 text-xs text-muted-foreground">Click to see exact underlying records.</div>
          </button>
        ))}
      </div>

      {selected && (
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div><div className="font-semibold">{selected.label}</div><div className="text-xs text-muted-foreground">{selected.count} exact records · no vanity KPI</div></div>
            <Button variant="ghost" size="sm" onClick={() => setSelected(null)}>Close</Button>
          </div>
          <div className="max-h-[520px] overflow-auto divide-y divide-border">
            {selected.rows.map((row: any, index) => (
              <div key={row.id ?? `${selected.key}-${index}`} className="p-4 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-semibold">{row.wa_name || row.contact_name || row.operator_name || row.wa_account_label || row.lead_id || row.id || "Record"}</div>
                  {row.pipeline_stage && <Badge variant="outline">{row.pipeline_stage}</Badge>}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">{row.phone || row.phone_e164 || row.last_message || row.release_reason || row.status || "Open the canonical record to resolve."}</div>
                {(row.wa_seen_state || row.seen_state || row.wa_label_colour || row.label_colour) && <ChatSignalStrip compact seenState={(row.wa_seen_state ?? row.seen_state) as any} unreadCount={row.wa_unread_count ?? row.unread_count} observedAt={row.last_wa_seen_at ?? row.captured_at} labelColour={row.wa_label_colour ?? row.label_colour} labelName={row.wa_label_name ?? row.label_name} currentHandlerName={row.current_handler_name ?? row.handler_name} />}
              </div>
            ))}
            {selected.rows.length === 0 && <div className="p-8 text-center text-sm text-muted-foreground">Zero. This leakage class is clean.</div>}
          </div>
        </Card>
      )}
    </div>
  );
}

function LabelMapPanel() {
  const [rows, setRows] = useState<any[]>([]);
  const [colour, setColour] = useState("");
  const [waName, setWaName] = useState("");
  const [crmLabel, setCrmLabel] = useState("");
  const [stage, setStage] = useState("");
  const [mission, setMission] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(() => loadLabelColourMappings().then(setRows).catch(() => setRows([])), []);
  useEffect(() => { refresh(); }, [refresh]);

  async function save() {
    setMessage(null);
    try {
      await saveLabelColourMapping({ colourKey: colour, waLabelName: waName || undefined, crmLabel, suggestedStage: stage || undefined, suggestedMission: mission || undefined });
      setMessage("Mapping saved. Colour is now a configured signal, not a guess.");
      setColour(""); setWaName(""); setCrmLabel(""); setStage(""); setMission("");
      await refresh();
    } catch (e) { setMessage(e instanceof Error ? e.message : "Save failed"); }
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
      <Card className="p-5">
        <div className="text-lg font-semibold">WhatsApp label colour → CRM meaning</div>
        <p className="mt-1 text-sm text-muted-foreground">Never infer a business truth only because a row looks green/blue/yellow. Configure the mapping once; unresolved colours display as Unknown label.</p>
        <div className="mt-4 space-y-3">
          <Input value={colour} onChange={(e) => setColour(e.target.value)} placeholder="Colour key — e.g. green or #22c55e" />
          <Input value={waName} onChange={(e) => setWaName(e.target.value)} placeholder="WhatsApp label name" />
          <Input value={crmLabel} onChange={(e) => setCrmLabel(e.target.value)} placeholder="CRM meaning" />
          <Input value={stage} onChange={(e) => setStage(e.target.value.toUpperCase())} placeholder="Suggested stage (optional)" />
          <Input value={mission} onChange={(e) => setMission(e.target.value)} placeholder="Suggested mission (optional)" />
          {message && <div className="rounded-md border border-border bg-muted/30 p-2 text-xs">{message}</div>}
          <Button disabled={!colour || !crmLabel} onClick={save}>Save mapping</Button>
        </div>
      </Card>
      <Card className="overflow-hidden">
        <div className="border-b border-border px-4 py-3 font-semibold">Configured mappings</div>
        <div className="divide-y divide-border">
          {rows.map((row) => (
            <div key={row.id} className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
              <div className="flex items-center gap-3"><span className="h-4 w-4 rounded-full border" style={{ background: row.colour_key }} /><div><div className="font-semibold">{row.wa_label_name || row.colour_key}</div><div className="text-xs text-muted-foreground">{row.crm_label}</div></div></div>
              <div className="text-right text-xs text-muted-foreground">{row.suggested_stage || "No stage"}<br />{row.suggested_mission || "No mission"}</div>
            </div>
          ))}
          {rows.length === 0 && <div className="p-8 text-center text-sm text-muted-foreground">No mappings yet.</div>}
        </div>
      </Card>
    </div>
  );
}

function Metric({ label, value, danger, icon }: { label: string; value: string; danger?: boolean; icon: React.ReactNode }) {
  return (
    <Card className={`p-4 ${danger ? "border-red-200 bg-red-50/50 dark:bg-red-950/20" : ""}`}>
      <div className="flex items-center justify-between text-muted-foreground"><span className="text-xs font-semibold uppercase tracking-wide">{label}</span>{icon}</div>
      <div className={`mt-2 text-3xl font-bold tabular-nums ${danger ? "text-red-700 dark:text-red-300" : ""}`}>{value}</div>
    </Card>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return <div className="rounded-lg bg-muted/40 p-2.5"><div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div><div className="text-xl font-bold tabular-nums">{value}</div></div>;
}
