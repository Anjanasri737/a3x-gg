// Live Lock -> Call -> CRM update -> Qualify.
// The call button only exists while the lead is locked to you; every press writes
// a real call event, moves the funnel and sets the next action.
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Phone, PhoneOff, Lock, LockOpen, CheckCircle2, ShieldAlert } from "lucide-react";
import { useMovement } from "@/movement/store";
import type { CallResult, MovementState } from "@/movement/types";
import { useOpsSettings } from "./settings";

interface Props {
  lead: MovementState;
  /** called after a connected call so the round can count it */
  onConnected?: (ulid: string) => void;
  compact?: boolean;
}

const RESULTS: { r: CallResult; label: string }[] = [
  { r: "no-answer", label: "No answer" },
  { r: "busy", label: "Busy" },
  { r: "wrong-number", label: "Wrong number" },
  { r: "rejected", label: "Rejected" },
];

export function LiveCallDock({ lead, onConnected, compact }: Props) {
  const mv = useMovement();
  const tel = useOpsSettings((s) => s.useTelLinks);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [checkIn, setCheckIn] = useState("");

  const lock = mv.lockOf(lead.ulid);
  const mine = lock?.operatorId === mv.actor.id;
  const other = lock && !mine ? lock : null;

  const claim = () => {
    const res = mv.attemptClaim(lead.ulid, "calling", "call the customer");
    if (!res.ok) {
      toast.error(`Locked by ${res.lock?.operatorName ?? "another operator"} — history is read-only for you`);
      return;
    }
    toast.success("Live lock taken — this lead is yours");
  };

  const startCall = () => {
    mv.startCall(lead.ulid);
    mv.setWork(lead.ulid, "calling");
    setStartedAt(Date.now());
    if (tel && lead.phone) window.open(`tel:${lead.phone.replace(/[^\d+]/g, "")}`, "_self");
    toast.success("Call started — log the result when you hang up");
  };

  const finish = (result: CallResult) => {
    const secs = startedAt ? Math.round((Date.now() - startedAt) / 1000) : 0;
    mv.logCall(lead.ulid, result, secs ? `${secs}s on the call` : undefined);
    mv.touchLock(lead.ulid);
    setStartedAt(null);

    if (result === "connected") {
      // connected -> the funnel moves, not just the log
      mv.qualify(lead.ulid, true, checkIn || undefined);
      mv.setStage(lead.ulid, "qualified", "Qualified on a connected call");
      mv.setWork(lead.ulid, "in-work");
      mv.setNextAction(lead.ulid, {
        kind: "send-property",
        dueAt: new Date(Date.now() + 30 * 60000).toISOString(),
        ownerId: mv.actor.id,
        ownerName: mv.actor.name,
        note: "Send verified options after the qualifying call",
      });
      onConnected?.(lead.ulid);
      toast.success("Connected · CRM updated · moved to Qualified");
      return;
    }

    mv.setWork(lead.ulid, "next-action-scheduled");
    mv.setNextAction(lead.ulid, {
      kind: "call",
      dueAt: new Date(Date.now() + (result === "no-answer" ? 3 : 24) * 3600000).toISOString(),
      ownerId: mv.actor.id,
      ownerName: mv.actor.name,
      note: `Retry after ${result}`,
    });
    toast.success(`${result} logged · retry scheduled`);
  };

  return (
    <div className={cn("space-y-2 rounded-lg border p-3", startedAt && "border-primary bg-primary/5")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs">
          {mine ? (
            <Badge className="gap-1"><Lock className="h-3 w-3" /> Live lock · you</Badge>
          ) : other ? (
            <Badge variant="destructive" className="gap-1">
              <ShieldAlert className="h-3 w-3" /> Locked by {other.operatorName}
            </Badge>
          ) : (
            <Badge variant="outline" className="gap-1"><LockOpen className="h-3 w-3" /> Not locked</Badge>
          )}
          <span className="text-muted-foreground">{lead.stage}</span>
        </div>
        {!mine && !other && (
          <Button size="sm" variant="outline" onClick={claim}>Claim lock</Button>
        )}
      </div>

      {mine && (
        <>
          {!startedAt ? (
            <Button className="w-full gap-2" onClick={startCall}>
              <Phone className="h-4 w-4" /> Call {lead.name ?? lead.phone ?? "lead"}
            </Button>
          ) : (
            <div className="space-y-2">
              <div className="text-center text-xs text-muted-foreground">
                On call — pick the outcome to update the CRM
              </div>
              {!compact && (
                <Input
                  type="date"
                  value={checkIn}
                  onChange={(e) => setCheckIn(e.target.value)}
                  className="h-8 text-xs"
                  placeholder="Shifting date"
                />
              )}
              <Button className="w-full gap-2" onClick={() => finish("connected")}>
                <CheckCircle2 className="h-4 w-4" /> Connected → Qualify
              </Button>
              <div className="flex flex-wrap gap-2">
                {RESULTS.map((x) => (
                  <Button key={x.r} size="sm" variant="outline" className="gap-1" onClick={() => finish(x.r)}>
                    <PhoneOff className="h-3 w-3" /> {x.label}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {other && (
        <p className="text-[11px] text-muted-foreground">
          You can read the full history, but calling is blocked while {other.operatorName} is working this lead.
        </p>
      )}
    </div>
  );
}
