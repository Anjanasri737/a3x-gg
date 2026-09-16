import { AlertTriangle, ListChecks, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { BATCH_SIZE, HANDLERS, ROUNDS } from "./types";
import { daysOld, useBookingFlow } from "./store";

export function BatchBoard({ onOpenLead }: { onOpenLead: (leadId: string) => void }) {
  const { me, round, mode, leads, batches, setMe, setRound, buildBatch, buildAllRounds, stuckCount, reassign } = useBookingFlow();
  const myBatch = batches.find((b) => b.handler === me && b.round === round);
  const myLeads = myBatch ? myBatch.leadIds.map((id) => leads.find((l) => l.id === id)).filter(Boolean) as typeof leads : [];
  const done = myLeads.filter((l) => l.qualifiedAt).length;
  const stuck = stuckCount();

  return (
    <div className="space-y-4">
      <header className="rounded-lg border bg-card p-4">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Step 2 of 3 · Divide the day</p>
        <h2 className="text-lg font-semibold">8 handlers · 4 rounds · 30 chats each</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Each round hands you the 30 oldest untouched chats from the last 7 days. Nothing older than 7 days may stay stuck.
        </p>
      </header>

      {stuck > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">
          <AlertTriangle className="h-4 w-4 text-destructive" />
          <span><strong>{stuck}</strong> chats are older than 7 days and still unmarked. Clear them today or they go to Control Tower.</span>
        </div>
      )}

      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">I am</span>
          {HANDLERS.map((h) => (
            <Button key={h} size="sm" variant={h === me ? "default" : "outline"} className="h-7 px-2 text-[11px]" onClick={() => setMe(h)}>{h}</Button>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Round</span>
          {ROUNDS.map((r) => (
            <Button key={r} size="sm" variant={r === round ? "default" : "outline"} className="h-7 w-9 text-[11px]" onClick={() => setRound(r)}>{r}</Button>
          ))}
          <Button
            size="sm"
            className="ml-auto"
            onClick={() => {
              const b = buildBatch(me, round);
              toast[b ? "success" : "error"](b ? `${b.leadIds.length} chats given to ${me} for round ${round}` : "No untouched chats left in the last 7 days");
            }}
          >
            <ListChecks className="mr-1.5 h-4 w-4" />Give me my {BATCH_SIZE}
          </Button>
          {mode === "EXPERT" && (
            <Button size="sm" variant="secondary" onClick={() => { const n = buildAllRounds(); toast.success(`${n} batches built for the whole team`); }}>
              <Users className="mr-1.5 h-4 w-4" />Build all 4 rounds for all 8
            </Button>
          )}
        </div>
      </Card>

      {myBatch ? (
        <Card className="p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="font-semibold">{me} · round {round}</h3>
              <p className="text-xs text-muted-foreground">{done} of {myLeads.length} marked with a next step</p>
            </div>
            <Badge variant={done === myLeads.length ? "default" : "secondary"}>
              {done === myLeads.length ? "Batch complete" : `${myLeads.length - done} left`}
            </Badge>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {myLeads.map((l) => {
              const overdue = !l.qualifiedAt && daysOld(l.lastActivityAt) >= 5;
              return (
                <button
                  key={l.id}
                  onClick={() => onOpenLead(l.id)}
                  className={`rounded-md border p-2.5 text-left transition hover:bg-accent ${l.qualifiedAt ? "border-primary/40" : overdue ? "border-destructive/50" : ""}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium">{l.name}</span>
                    <span className={`text-[10px] ${overdue ? "text-destructive" : "text-muted-foreground"}`}>{daysOld(l.lastActivityAt)}d old</span>
                  </div>
                  <p className="truncate text-xs text-muted-foreground">{l.lastMessage}</p>
                  <p className="mt-1 truncate text-[11px]">
                    {l.qualifiedAt ? <span className="text-primary">{l.nextAction}</span> : <span className="text-muted-foreground">not marked yet</span>}
                  </p>
                  {mode === "EXPERT" && (
                    <span className="mt-1 block text-[10px] text-muted-foreground">owner {l.owner ?? "—"} · {l.temp ?? "—"}</span>
                  )}
                </button>
              );
            })}
          </div>
          {mode === "EXPERT" && (
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="text-xs text-muted-foreground">Hand this batch to</span>
              {HANDLERS.filter((h) => h !== me).map((h) => (
                <Button key={h} size="sm" variant="outline" className="h-7 px-2 text-[11px]"
                  onClick={() => { myLeads.forEach((l) => reassign(l.id, h)); toast.success(`Batch handed to ${h}`); }}>
                  {h}
                </Button>
              ))}
            </div>
          )}
        </Card>
      ) : (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No batch yet for {me}, round {round}. Press “Give me my {BATCH_SIZE}”.
        </div>
      )}
    </div>
  );
}
