import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowUpRight, ClipboardList, Loader2, NotebookPen, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { logLeadActivity } from "@/lib/vision/lead-activity.functions";
import type { TruthRow } from "@/lib/flow-os/service";

const SYNC_TONE: Record<string, string> = {
  RED: "border-red-500/50 bg-red-500/10 text-red-500",
  AMBER: "border-amber-500/50 bg-amber-500/10 text-amber-500",
  GREEN: "border-emerald-500/50 bg-emerald-500/10 text-emerald-500",
  GREY: "border-muted bg-muted/40 text-muted-foreground",
};

const QUICK_ACTIVITIES = [
  "Called — connected",
  "Called — no answer",
  "WhatsApp replied",
  "Options shared",
  "Tour proposed",
  "Payment followed up",
];

const NEXT_ACTIONS = ["call_customer", "share_options", "schedule_tour", "confirm_tour", "collect_payment", "follow_up"];

function when(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString([], { day: "2-digit", month: "short", hour: "numeric", minute: "2-digit" });
}

/** Working CRM table beside the WhatsApp mirror: every row can be logged, drafted and opened. */
export function CrmPreviewTable({
  rows,
  onOpen,
  onDraft,
  onChanged,
}: {
  rows: TruthRow[];
  onOpen: (row: TruthRow) => void;
  onDraft?: (row: TruthRow) => void;
  onChanged?: () => void | Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [logFor, setLogFor] = useState<TruthRow | null>(null);
  const [activity, setActivity] = useState("");
  const [detail, setDetail] = useState("");
  const [nextKind, setNextKind] = useState("call_customer");
  const [nextAt, setNextAt] = useState("");
  const [saving, setSaving] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      (r.wa_name ?? "").toLowerCase().includes(q) ||
      (r.phone ?? "").includes(q) ||
      (r.detected_label ?? "").toLowerCase().includes(q) ||
      (r.last_message_preview ?? "").toLowerCase().includes(q));
  }, [rows, query]);

  function openLog(row: TruthRow) {
    setLogFor(row);
    setActivity("");
    setDetail("");
    setNextKind(row.next_action_kind || "call_customer");
    setNextAt("");
  }

  async function save() {
    if (!logFor) return;
    if (activity.trim().length < 2) { toast.error("Write what happened on this lead"); return; }
    setSaving(true);
    try {
      await logLeadActivity({ data: {
        leadId: logFor.lead_id,
        activity,
        detail: detail || null,
        actor: logFor.current_owner_name || logFor.handler_hint || "CRM preview",
        nextActionKind: nextKind || null,
        nextActionAt: nextAt ? new Date(nextAt).toISOString() : null,
      } });
      toast.success("Activity logged and next step set");
      setLogFor(null);
      await onChanged?.();
    } catch (error: any) {
      toast.error(error?.message || "Could not log this activity");
    } finally { setSaving(false); }
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b p-3">
        <div className="flex items-center gap-2 text-sm font-semibold"><ClipboardList className="h-4 w-4" />CRM preview · {filtered.length} leads</div>
        <div className="flex items-center gap-2 rounded-md border px-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, number, label" className="h-8 w-56 border-0 px-0 focus-visible:ring-0" />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[1050px] text-xs">
          <thead className="bg-muted/40 text-[10px] uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="p-2 text-left">Customer</th>
              <th className="p-2 text-left">Number</th>
              <th className="p-2 text-left">Last message</th>
              <th className="p-2 text-left">Label</th>
              <th className="p-2 text-left">Stage</th>
              <th className="p-2 text-left">Owner</th>
              <th className="p-2 text-left">Last activity</th>
              <th className="p-2 text-left">Next step</th>
              <th className="p-2 text-left">Due</th>
              <th className="p-2 text-left">Status</th>
              <th className="p-2 text-right">Work on it</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => (
              <tr key={row.lead_id} className="border-t align-top hover:bg-muted/25">
                <td className="p-2 font-medium">{row.wa_name || "Unknown"}{row.unread_visible && <Badge className="ml-2 h-4 px-1 text-[9px]">{row.unread_count || 1} unread</Badge>}</td>
                <td className="p-2 tabular-nums text-muted-foreground">{row.phone}</td>
                <td className="p-2 max-w-[240px] truncate">{row.last_message_preview || "—"}</td>
                <td className="p-2">{row.detected_label ? <Badge variant="secondary" className="text-[9px]">{row.detected_label}</Badge> : "—"}</td>
                <td className="p-2">{(row.current_pipeline_stage || row.stage_inference || "—").toString().replaceAll("_", " ")}</td>
                <td className="p-2">{row.current_owner_name || row.handler_hint || <span className="text-red-500">Unowned</span>}</td>
                <td className="p-2 whitespace-nowrap text-muted-foreground">{when(row.last_operator_action_at || row.latest_observation_at)}</td>
                <td className="p-2">{row.next_action_kind ? row.next_action_kind.replaceAll("_", " ") : <span className="text-amber-500">Not set</span>}</td>
                <td className="p-2 whitespace-nowrap text-muted-foreground">{when(row.next_action_at)}</td>
                <td className="p-2"><Badge variant="outline" className={`text-[9px] ${SYNC_TONE[row.sync_state] ?? ""}`}>{row.sync_state}</Badge></td>
                <td className="p-2">
                  <div className="flex flex-wrap justify-end gap-1">
                    <Button size="sm" variant="outline" className="h-7 gap-1 text-[11px]" onClick={() => openLog(row)}><NotebookPen className="h-3 w-3" />Log activity</Button>
                    {onDraft && <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => onDraft(row)}>Use as draft</Button>}
                    <Button size="sm" className="h-7 gap-1 text-[11px]" onClick={() => onOpen(row)}><ArrowUpRight className="h-3 w-3" />Open</Button>
                  </div>
                </td>
              </tr>
            ))}
            {!filtered.length && <tr><td colSpan={11} className="p-8 text-center text-muted-foreground">No leads match this search.</td></tr>}
          </tbody>
        </table>
      </div>

      <Dialog open={!!logFor} onOpenChange={(open) => !open && setLogFor(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Log activity · {logFor?.wa_name || logFor?.phone}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="flex flex-wrap gap-1">
              {QUICK_ACTIVITIES.map((a) => <Button key={a} type="button" size="sm" variant={activity === a ? "default" : "outline"} className="h-7 text-[11px]" onClick={() => setActivity(a)}>{a}</Button>)}
            </div>
            <label className="block space-y-1 text-xs"><span>What happened *</span><Input value={activity} onChange={(e) => setActivity(e.target.value)} placeholder="Called — customer wants a 6 PM visit" /></label>
            <label className="block space-y-1 text-xs"><span>Details for the next person</span><Textarea value={detail} onChange={(e) => setDetail(e.target.value)} placeholder="Budget 12k, wants single room in HSR, parents joining the tour" /></label>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="space-y-1 text-xs"><span>Next step</span>
                <select className="h-9 w-full rounded-md border bg-background px-2" value={nextKind} onChange={(e) => setNextKind(e.target.value)}>
                  {NEXT_ACTIONS.map((k) => <option key={k} value={k}>{k.replaceAll("_", " ")}</option>)}
                </select>
              </label>
              <label className="space-y-1 text-xs"><span>By when</span><Input type="datetime-local" value={nextAt} onChange={(e) => setNextAt(e.target.value)} /></label>
            </div>
            <p className="text-[11px] text-muted-foreground">Left empty, the deadline defaults to two hours from now so the lead never sits without a next step.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLogFor(null)}>Cancel</Button>
            <Button disabled={saving} onClick={() => void save()}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save activity"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
