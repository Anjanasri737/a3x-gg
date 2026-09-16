import { useState } from "react";
import { ArrowLeft, Flame, Link2, Snowflake, TowerControl } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { HANDLERS, NEXT_ACTIONS, STEPS } from "./types";
import type { FlowLead } from "./types";
import { autoTemp, daysOld, useBookingFlow } from "./store";

const STAGES = ["CAPTURED", "QUALIFIED", "TOUR", "BOOKING", "CHECKED_IN", "CLOSED"];

export function Expert({ lead, onBack }: { lead: FlowLead; onBack: () => void }) {
  const { leads, answer, finishQualification, setTemp, reassign, moveStage, escalate, bulk } = useBookingFlow();
  const [reason, setReason] = useState("");
  const [nextAction, setNextAction] = useState(lead.nextAction ?? NEXT_ACTIONS[0]);
  const [due, setDue] = useState((lead.nextActionAt ?? new Date(Date.now() + 7_200_000).toISOString()).slice(0, 16));
  const connected = (lead.connectedTo ?? []).map((id) => leads.find((l) => l.id === id)).filter(Boolean) as FlowLead[];
  const signal = autoTemp(lead);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="ghost" onClick={onBack}><ArrowLeft className="mr-1 h-4 w-4" />Back to batch</Button>
        <Badge variant="secondary">Expert sheet</Badge>
        <Badge variant={signal === "HOT" ? "default" : "outline"}>{signal === "HOT" ? "hot signal" : "cold signal"}</Badge>
        <span className="text-xs text-muted-foreground">{daysOld(lead.lastActivityAt)}d since last activity</span>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold">{lead.name}</h2>
          <span className="text-xs text-muted-foreground">{lead.phone} · {lead.waAccount} · stage {lead.stage}</span>
        </div>
        <p className="text-xs text-muted-foreground">Last message: “{lead.lastMessage}”</p>
      </Card>

      <Card className="p-4">
        <h3 className="text-sm font-semibold">All qualification fields at once</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {STEPS.map((s) => (
            <label key={s.key} className="space-y-1 text-xs">
              <span className="text-muted-foreground">{s.goal}</span>
              {s.kind === "CHOICE" ? (
                <div className="flex flex-wrap gap-1">
                  {s.options?.map((o) => (
                    <Button key={o.value} size="sm" variant={lead.q[s.key] === o.value ? "default" : "outline"} className="h-6 px-1.5 text-[10px]"
                      onClick={() => answer(lead.id, s.key, o.value)}>{o.label}</Button>
                  ))}
                </div>
              ) : (
                <Input
                  type={s.kind === "DATE" ? "date" : "text"}
                  defaultValue={String(lead.q[s.key] ?? "")}
                  placeholder={s.placeholder}
                  onBlur={(e) => e.target.value && answer(lead.id, s.key, e.target.value)}
                />
              )}
            </label>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap items-end gap-2">
          <label className="text-xs">
            <span className="text-muted-foreground">Next step</span>
            <Input className="mt-1 w-52" value={nextAction} onChange={(e) => setNextAction(e.target.value)} />
          </label>
          <label className="text-xs">
            <span className="text-muted-foreground">By</span>
            <Input className="mt-1" type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} />
          </label>
          <Button size="sm" onClick={() => { finishQualification(lead.id, nextAction, new Date(due).toISOString()); toast.success("Saved"); }}>Save lead</Button>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <h3 className="text-sm font-semibold">Hot / cold override</h3>
          <p className="text-xs text-muted-foreground">
            Signal from last reply age, timing answer and move-in date says <strong>{signal.toLowerCase()}</strong>. Override with a reason.
          </p>
          <Input className="mt-2" placeholder="Why are you overriding?" value={reason} onChange={(e) => setReason(e.target.value)} />
          <div className="mt-2 flex gap-2">
            <Button size="sm" onClick={() => { if (!reason.trim()) return toast.error("Reason required"); setTemp(lead.id, "HOT", reason); toast.success("Marked hot"); }}>
              <Flame className="mr-1 h-4 w-4" />Force hot
            </Button>
            <Button size="sm" variant="secondary" onClick={() => { if (!reason.trim()) return toast.error("Reason required"); setTemp(lead.id, "COLD", reason); toast.success("Marked cold"); }}>
              <Snowflake className="mr-1 h-4 w-4" />Force cold
            </Button>
            <Button size="sm" variant="outline" onClick={() => { if (!reason.trim()) return toast.error("Reason required"); escalate(lead.id, reason); toast.success("Sent to Control Tower"); }}>
              <TowerControl className="mr-1 h-4 w-4" />Control Tower
            </Button>
          </div>
          {lead.tempReason && <p className="mt-2 text-[11px] text-muted-foreground">Currently forced {lead.temp?.toLowerCase()} — {lead.tempReason}</p>}
        </Card>

        <Card className="p-4">
          <h3 className="text-sm font-semibold">Owner and out-of-order move</h3>
          <div className="mt-2 flex flex-wrap gap-1">
            {HANDLERS.map((h) => (
              <Button key={h} size="sm" variant={lead.owner === h ? "default" : "outline"} className="h-7 px-2 text-[11px]" onClick={() => { reassign(lead.id, h); toast.success(`Owner is ${h}`); }}>{h}</Button>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-1">
            {STAGES.map((st) => (
              <Button key={st} size="sm" variant={lead.stage === st ? "default" : "outline"} className="h-7 px-2 text-[11px]"
                onClick={() => { if (!reason.trim()) return toast.error("Reason required for an out-of-order move"); moveStage(lead.id, st, reason); toast.success(`Moved to ${st}`); }}>
                {st.toLowerCase().replace("_", " ")}
              </Button>
            ))}
          </div>
        </Card>
      </div>

      {connected.length > 0 && (
        <Card className="p-4">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold"><Link2 className="h-4 w-4" />Connected customers</h3>
          <p className="text-xs text-muted-foreground">Same person on another chat, or one group looking together. One decision can cover all of them.</p>
          <ul className="mt-2 space-y-1 text-xs">
            {connected.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-2 rounded border p-2">
                <span>{c.name} · {c.phone}</span>
                <span className="text-muted-foreground">{c.stage}</span>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex gap-2">
            <Button size="sm" variant="secondary"
              onClick={() => { bulk([lead.id, ...connected.map((c) => c.id)], { nextAction, nextActionAt: new Date(due).toISOString() }, "connected group handled together"); toast.success("Applied to the whole group"); }}>
              Apply this next step to the group
            </Button>
          </div>
        </Card>
      )}

      <Card className="p-4">
        <h3 className="text-sm font-semibold">Timeline</h3>
        <ul className="mt-2 space-y-1 text-xs">
          {[...lead.events].reverse().map((e, i) => (
            <li key={i} className="flex gap-2">
              <span className="shrink-0 text-muted-foreground">{new Date(e.at).toLocaleString()}</span>
              <span>{e.label}{e.detail ? ` — ${e.detail}` : ""}</span>
              <span className="ml-auto shrink-0 text-muted-foreground">{e.actor}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
