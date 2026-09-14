import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { BookOpen, Filter, Search } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  listJourneySteps,
  listLibraryBuckets,
  listLibraryRows,
  type JourneyStep,
  type LibraryBucket,
  type LibraryRow,
} from "@/lib/lead-os/library";

function ConversationLibraryPage() {
  const search = Route.useSearch();
  const [buckets, setBuckets] = useState<LibraryBucket[]>([]);
  const [steps, setSteps] = useState<JourneyStep[]>([]);
  const [rows, setRows] = useState<LibraryRow[]>([]);
  const [active, setActive] = useState<string | null>(search.bucket ?? null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [libBuckets, libSteps] = await Promise.all([listLibraryBuckets(), listJourneySteps()]);
        setBuckets(libBuckets);
        setSteps(libSteps);
      } catch (error: any) {
        toast.error(error?.message || "Could not load the conversation library");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!active) { setRows([]); return; }
    let cancelled = false;
    (async () => {
      try {
        const libRows = await listLibraryRows({ bucket: active, limit: 200 });
        if (!cancelled) setRows(libRows);
      } catch (error: any) {
        toast.error(error?.message || "Could not load chat lines");
      }
    })();
    return () => { cancelled = true; };
  }, [active]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return buckets;
    return buckets.filter((bucket) =>
      [bucket.bucket, bucket.family, bucket.stage, bucket.default_next_action, bucket.example_1]
        .some((value) => String(value || "").toLowerCase().includes(needle)),
    );
  }, [buckets, query]);

  const totalRows = useMemo(() => buckets.reduce((sum, bucket) => sum + (bucket.observed_count || 0), 0), [buckets]);
  const activeBucket = buckets.find((bucket) => bucket.bucket === active) || null;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-3xl font-bold tracking-tight">Conversation Library</h1>
            <Badge className="gap-1"><BookOpen className="h-3 w-3" /> {buckets.length} categories</Badge>
          </div>
          <p className="mt-2 max-w-4xl text-sm text-muted-foreground">
            Every captured chat line grouped by what the conversation is actually waiting for, with the journey step it belongs to and the action it demands. {totalRows} classified lines.
          </p>
        </div>
        <Button asChild variant="outline"><Link to="/flow-os">Back to Lead OS</Link></Button>
      </header>

      <Card className="p-4">
        <label className="relative block max-w-xl">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search a category, family, stage or action…" />
        </label>
        <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((bucket) => {
            const step = steps.find((s) => s.code === bucket.journey_step);
            return (
              <button
                key={bucket.bucket}
                onClick={() => setActive(active === bucket.bucket ? null : bucket.bucket)}
                className={`rounded-lg border p-3 text-left transition-colors ${active === bucket.bucket ? "border-primary bg-primary/5" : "hover:bg-muted/40"}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-sm font-semibold">{bucket.bucket.replaceAll("_", " ")}</span>
                  <Badge variant="secondary" className="tabular-nums">{bucket.observed_count}</Badge>
                </div>
                <div className="mt-1 flex flex-wrap gap-1 text-[10px]">
                  {bucket.journey_step && <Badge variant="outline">{bucket.journey_step}{step ? ` · ${step.name}` : ""}</Badge>}
                  {bucket.priority && <Badge variant="outline">{bucket.priority}</Badge>}
                  {bucket.waiting_on && <Badge variant="outline">waiting on {bucket.waiting_on}</Badge>}
                  {bucket.sla_min != null && <Badge variant="outline">{bucket.sla_min} min SLA</Badge>}
                </div>
                <div className="mt-1.5 text-xs text-muted-foreground">Next: {(bucket.default_next_action || "—").replaceAll("_", " ")}</div>
                {bucket.example_1 && <div className="mt-1 line-clamp-2 text-[11px] italic text-muted-foreground">“{bucket.example_1}”</div>}
              </button>
            );
          })}
          {!visible.length && !loading && (
            <div className="col-span-full p-8 text-center text-sm text-muted-foreground">
              <Filter className="mx-auto mb-2 h-5 w-5" />No category matches that search.
            </div>
          )}
        </div>
      </Card>

      {activeBucket && (
        <Card className="overflow-hidden">
          <div className="space-y-1 border-b p-4">
            <h2 className="font-semibold">{activeBucket.bucket.replaceAll("_", " ")} · {rows.length} chat lines</h2>
            <p className="text-xs text-muted-foreground">{activeBucket.rule_reason || "Classified from captured WhatsApp screenshots."}</p>
          </div>
          <div className="divide-y">
            {rows.map((row) => (
              <div key={row.row_id} className="grid gap-2 p-3 text-sm lg:grid-cols-[1fr_2fr_auto] lg:items-center">
                <div className="min-w-0">
                  <div className="truncate font-medium">{row.display_contact || "Unknown contact"}</div>
                  <div className="text-xs text-muted-foreground">{row.phone_e164 || "No phone read"} · {row.zone || "—"}</div>
                  <div className="text-[10px] uppercase text-muted-foreground">{row.capture_date} · {row.visible_time || "—"}</div>
                </div>
                <div className="min-w-0">
                  <div className="line-clamp-2">{row.last_message || "No readable text"}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    Next: {(row.next_action || "—").replaceAll("_", " ")}{row.waiting_on ? ` · waiting on ${row.waiting_on}` : ""}{row.confidence_band ? ` · ${row.confidence_band} confidence` : ""}
                  </div>
                </div>
                <div className="flex justify-end">
                  {row.lead_id
                    ? <Button asChild size="sm" variant="outline"><Link to="/flow-os" search={{ bucket: undefined }}>Open customer</Link></Button>
                    : <Badge variant="outline">Unlinked</Badge>}
                </div>
              </div>
            ))}
            {!rows.length && <div className="p-8 text-center text-sm text-muted-foreground">No chat lines stored for this category.</div>}
          </div>
        </Card>
      )}
    </div>
  );
}

export const Route = createFileRoute("/conversation-library")({
  validateSearch: (search: Record<string, unknown>) => ({ bucket: typeof search.bucket === "string" ? search.bucket : undefined }),
  head: () => ({
    meta: [
      { title: "Conversation Library — Chat Categories & Next Steps | Gharpayy" },
      { name: "description", content: "Every captured WhatsApp chat line grouped by conversation category, journey step S1–S9, waiting party, SLA and the exact next action it demands." },
      { property: "og:title", content: "Conversation Library — Chat Categories & Next Steps | Gharpayy" },
      { property: "og:description", content: "Browse classified chat evidence by category and jump straight to the linked customer." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => <AppShell><ConversationLibraryPage /></AppShell>,
});
