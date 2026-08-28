import { RoleGate } from "@/components/tower/RoleGate";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PRIORITY_COLORS, PRIORITY_LABELS, SCENARIOS, type ScenarioCode } from "@/lib/tower/scoring";
import { logFirstAction, reassign, setScenarioAndNextAction, acceptAssignment, reopenCycle, closeCycle, claimCowork } from "@/lib/tower/engine";
import { Input } from "@/components/ui/input";
import { MOVE_IN_LABELS, type MoveInBucket } from "@/lib/tower/scoring";
import { useTowerAuth } from "@/lib/tower/auth";
import { toast } from "sonner";
import { LeadQualityTimeline } from "@/components/tower/LeadQualityTimeline";
import { SellThisPG } from "@/components/supply/SellThisPG";

export const Route = createFileRoute("/tower/leads/$id")({ component: () => <RoleGate module="my-leads"><LeadDetail /></RoleGate> });

function LeadDetail() {
  const { id } = Route.useParams();
  const auth = useTowerAuth();
  const [lead, setLead] = useState<any>(null);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [scenarios, setScenarios] = useState<any[]>([]);
  const [next, setNext] = useState<any[]>([]);
  const [cycles, setCycles] = useState<any[]>([]);
  const [scen, setScen] = useState<ScenarioCode | "">("");
  const [notes, setNotes] = useState("");
  const [reason, setReason] = useState("");
  const [reopenReason, setReopenReason] = useState("");
  const [reopenBucket, setReopenBucket] = useState<MoveInBucket | "">("");
  const [reopenLocation, setReopenLocation] = useState("");
  const [closeReason, setCloseReason] = useState("");
  const [coworkReason, setCoworkReason] = useState("");

  const load = async () => {
    const [l, a, s, n, c] = await Promise.all([
      supabase.from("leads").select("*, zones(name, code)").eq("id", id).single(),
      supabase.from("assignments").select("*").eq("lead_id", id).order("assigned_at", { ascending: false }),
      supabase.from("lead_scenarios_log").select("*").eq("lead_id", id).order("created_at", { ascending: false }),
      supabase.from("next_actions").select("*").eq("lead_id", id).order("due_at", { ascending: true }),
      supabase.from("lead_cycles").select("*").eq("lead_id", id).order("cycle_no", { ascending: false }),
    ]);
    setLead(l.data); setAssignments(a.data ?? []); setScenarios(s.data ?? []); setNext(n.data ?? []); setCycles(c.data ?? []);
  };
  useEffect(() => { load(); }, [id]);

  if (!lead) return <div>Loading…</div>;
  const openAsg = assignments.find((a) => a.state === "pending_accept" || a.state === "accepted");
  const isOwner = openAsg && auth.user?.id === openAsg.owner_id;
  const isClosed = lead.status !== "open";
  const currentCycleNo = cycles[0]?.cycle_no ?? 1;
  // Group history by cycle for the "15+ enquiries" timeline.
  const historyByCycle = cycles.map((c) => ({
    cycle: c,
    assignments: assignments.filter((a) => a.cycle_id === c.id),
    scenarios: scenarios.filter((s) => {
      const cs = new Date(s.created_at).getTime();
      const o = new Date(c.opened_at).getTime();
      const cl = c.closed_at ? new Date(c.closed_at).getTime() : Infinity;
      return cs >= o && cs <= cl;
    }),
  }));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4">
      <div className="space-y-4">
        <Card className="p-4">
          <div className="flex items-center gap-3 flex-wrap">
            {lead.priority && <Badge className={PRIORITY_COLORS[lead.priority as keyof typeof PRIORITY_COLORS]}>{PRIORITY_LABELS[lead.priority as keyof typeof PRIORITY_LABELS]}</Badge>}
            <h1 className="text-xl font-bold">{lead.wa_name ?? "Unknown"} · {lead.phone}</h1>
            <span className="text-sm text-muted-foreground">{lead.zones?.name} · Score {lead.score} · {lead.movein_bucket}</span>
            <Badge variant="outline">Cycle #{currentCycleNo} of {cycles.length}</Badge>
            {isClosed && <Badge variant="destructive">Closed</Badge>}
          </div>
          {lead.current_scenario && <div className="text-sm mt-2">Current scenario: <span className="font-medium">{SCENARIOS.find((s) => s.code === lead.current_scenario)?.label}</span></div>}
        </Card>

        {isOwner && (
          <Card className="p-4 space-y-3">
            <div className="font-semibold">Progress this lead</div>
            {openAsg.state === "pending_accept" && (
              <Button onClick={async () => { await acceptAssignment(openAsg.id); toast.success("Accepted"); load(); }}>Accept & Work</Button>
            )}
            {openAsg.state === "accepted" && !openAsg.first_action_at && (
              <Button variant="secondary" onClick={async () => { await logFirstAction(openAsg.id, "First contact logged"); toast.success("First action logged"); load(); }}>Log first action</Button>
            )}
            <div>
              <div className="text-sm font-medium mb-1">Set lead scenario (mandatory)</div>
              <Select value={scen} onValueChange={(v) => setScen(v as ScenarioCode)}>
                <SelectTrigger><SelectValue placeholder="Pick scenario…" /></SelectTrigger>
                <SelectContent>{SCENARIOS.map((s) => <SelectItem key={s.code} value={s.code}>{s.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <Textarea placeholder="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
            <Button disabled={!scen} onClick={async () => {
              await setScenarioAndNextAction({ leadId: id, assignmentId: openAsg.id, scenario: scen as ScenarioCode, notes, ownerId: openAsg.owner_id });
              toast.success("Scenario set — next action created"); setScen(""); setNotes(""); load();
            }}>Set scenario & create next action</Button>
          </Card>
        )}

        {/* Reopen — for returning leads (Jan → Apr → Jun → …) */}
        {isClosed && (
          <Card className="p-4 space-y-3 border-primary/50">
            <div className="font-semibold">Returning enquiry — reopen as Cycle #{currentCycleNo + 1}</div>
            <p className="text-xs text-muted-foreground">Full history from all {cycles.length} prior cycles stays intact. This creates a fresh assignment, ownership, and SLA clock.</p>
            <Input placeholder="Why is the lead back? (e.g. 6-month stay ended, changed city, wants BHK now)" value={reopenReason} onChange={(e) => setReopenReason(e.target.value)} />
            <Input placeholder="New location (optional)" value={reopenLocation} onChange={(e) => setReopenLocation(e.target.value)} />
            <Select value={reopenBucket} onValueChange={(v) => setReopenBucket(v as MoveInBucket)}>
              <SelectTrigger><SelectValue placeholder="New move-in urgency" /></SelectTrigger>
              <SelectContent>{(Object.keys(MOVE_IN_LABELS) as MoveInBucket[]).map((b) => <SelectItem key={b} value={b}>{MOVE_IN_LABELS[b]}</SelectItem>)}</SelectContent>
            </Select>
            <Button disabled={!reopenReason} onClick={async () => {
              const r = await reopenCycle({
                leadId: id, reason: reopenReason,
                moveinBucket: reopenBucket || undefined,
                locationText: reopenLocation || undefined,
              });
              if (!r.ok) toast.error(r.error); else toast.success(`Reopened as Cycle #${currentCycleNo + 1} — routed to owner`);
              setReopenReason(""); setReopenBucket(""); setReopenLocation(""); load();
            }}>Reopen cycle & re-route</Button>
          </Card>
        )}

        {/* Close current cycle */}
        {!isClosed && isOwner && (
          <Card className="p-3 space-y-2">
            <div className="font-semibold text-sm">Close this cycle</div>
            <p className="text-xs text-muted-foreground">Preserves all history. Lead can be reopened later as Cycle #{currentCycleNo + 1}.</p>
            <Input placeholder="Close reason (booked / not interested / no-show / etc.)" value={closeReason} onChange={(e) => setCloseReason(e.target.value)} />
            <Button size="sm" variant="secondary" disabled={!closeReason} onClick={async () => {
              await closeCycle(id, closeReason); toast.success("Cycle closed"); setCloseReason(""); load();
            }}>Close cycle</Button>
          </Card>
        )}

        {/* Co-work claim on an actively owned lead */}
        {!isClosed && !isOwner && openAsg && (
          <Card className="p-3 space-y-2 border-accent/50">
            <div className="font-semibold text-sm">Claim & work in parallel</div>
            <p className="text-xs text-muted-foreground">Primary owner keeps the lead. You get a tracked shadow assignment so nothing collides.</p>
            <Input placeholder="Why claim now? (owner unavailable, live call, WA reply, etc.)" value={coworkReason} onChange={(e) => setCoworkReason(e.target.value)} />
            <Button size="sm" variant="outline" disabled={!coworkReason} onClick={async () => {
              const r = await claimCowork(id, coworkReason);
              if (!r.ok) toast.error(r.error); else toast.success("Co-work claim recorded");
              setCoworkReason(""); load();
            }}>Claim & work</Button>
          </Card>
        )}

        <Card className="p-4">
          <div className="font-semibold mb-2">Next actions</div>
          {next.length === 0 && <div className="text-sm text-muted-foreground">No next action yet — pick a scenario above.</div>}
          <div className="space-y-1">
            {next.map((n) => (
              <div key={n.id} className="flex items-center justify-between border rounded p-2 text-sm">
                <div><span className="font-medium">{n.kind}</span> · due {new Date(n.due_at).toLocaleString()}</div>
                {n.done_at ? <Badge variant="outline">done</Badge> :
                  <Button size="sm" variant="outline" onClick={async () => {
                    await supabase.from("next_actions").update({ done_at: new Date().toISOString() }).eq("id", n.id); load();
                  }}>Mark done</Button>}
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-4">
          <div className="font-semibold mb-3">Full journey — {cycles.length} enquiry cycle{cycles.length === 1 ? "" : "s"}</div>
          <div className="space-y-3">
            {historyByCycle.map(({ cycle, assignments: cAsg, scenarios: cScen }) => (
              <div key={cycle.id} className="border-l-2 border-primary/40 pl-3">
                <div className="text-sm font-semibold">
                  Cycle #{cycle.cycle_no}
                  <span className="text-xs text-muted-foreground ml-2">
                    opened {new Date(cycle.opened_at).toLocaleDateString()}
                    {cycle.closed_at && ` → closed ${new Date(cycle.closed_at).toLocaleDateString()}`}
                  </span>
                </div>
                {cycle.open_reason && <div className="text-xs text-muted-foreground">Opened: {cycle.open_reason}</div>}
                {cycle.close_reason && <div className="text-xs text-amber-600">Closed: {cycle.close_reason}</div>}
                {cAsg.length > 0 && (
                  <div className="mt-1 text-xs">{cAsg.length} assignment{cAsg.length === 1 ? "" : "s"} · {cAsg.filter((a) => a.reassign_reason).length} reassign{cAsg.filter((a) => a.reassign_reason).length === 1 ? "" : "s"}</div>
                )}
                {cScen.map((s) => (
                  <div key={s.id} className="text-xs mt-1">
                    → <span className="font-medium">{SCENARIOS.find((x) => x.code === s.scenario)?.label}</span> · {new Date(s.created_at).toLocaleString()}
                    {s.notes && <div className="text-muted-foreground pl-3">{s.notes}</div>}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="space-y-4">
        <SellThisPG
          leadId={id}
          leadName={lead?.name ?? undefined}
          phone={lead?.phone ?? undefined}
          area={lead?.location_text ?? lead?.zones?.name ?? ""}
          budgetMin={lead?.budget_min ?? undefined}
          budgetMax={lead?.budget_max ?? undefined}
          onInjectMessages={(pitch, pgName) => {
            setNotes((n) => (n ? `${n}\n\n` : "") + `[${pgName}]\n${pitch}`);
            toast.success("Pitch added to notes");
          }}
        />
        <Card className="p-3">
          <div className="font-semibold mb-2 text-sm">Enquiry cycles</div>
          {cycles.map((c) => (
            <div key={c.id} className="text-xs border-b py-1">
              Cycle #{c.cycle_no} · opened {new Date(c.opened_at).toLocaleDateString()} · {c.open_reason ?? ""}
            </div>
          ))}
        </Card>
        <Card className="p-3">
          <div className="font-semibold mb-2 text-sm">Assignment history</div>
          {assignments.map((a) => (
            <div key={a.id} className="text-xs border-b py-1">
              <div><Badge variant="outline" className="mr-1">{a.state}</Badge>Priority {a.priority}</div>
              <div className="text-muted-foreground">Assigned {new Date(a.assigned_at).toLocaleString()}</div>
              {a.reassign_reason && <div className="text-amber-600">Reassign: {a.reassign_reason}</div>}
            </div>
          ))}
        </Card>
        {(auth.isManager || auth.isOperator) && (
          <Card className="p-3 space-y-2">
            <div className="font-semibold text-sm">Manager override — Reassign</div>
            <Textarea placeholder="Reason (required)" value={reason} onChange={(e) => setReason(e.target.value)} />
            <Button size="sm" variant="secondary" disabled={!reason} onClick={async () => {
              const r = await reassign(id, reason);
              if (!r.ok) toast.error(r.error); else toast.success("Reassigned");
              setReason(""); load();
            }}>Reassign now</Button>
          </Card>
        )}
      </div>

      <LeadQualityTimeline leadId={id} />
    </div>
  );
}
