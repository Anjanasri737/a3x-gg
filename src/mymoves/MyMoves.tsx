import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useMyMoves, type Role } from "./store";
import { AllMovesBoard } from "./AllMovesBoard";
import { LeadWorkspace } from "./LeadWorkspace";

export function MyMoves() {
  const { leads, me, setMe, reset } = useMyMoves();
  const [selected, setSelected] = useState<string | undefined>(leads[0]?.id);
  const lead = leads.find((l) => l.id === selected);

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">My Moves — Gharpayy Booking OS</h1>
          <p className="text-sm text-muted-foreground">
            Every lead answers five questions: where the conversation is, who owns it, what already happened, what must happen next, and by when.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {(["OPERATOR", "CLOSER", "MANAGER"] as Role[]).map((r) => (
            <Button key={r} size="sm" variant={me.role === r ? "default" : "outline"} onClick={() => setMe(me.name, r)}>{r}</Button>
          ))}
          <Button size="sm" variant="ghost" onClick={reset}>Reset demo</Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
        <div className="lg:max-h-[80vh] lg:overflow-y-auto lg:pr-1">
          <AllMovesBoard leads={leads} me={me.name} selectedId={selected} onOpen={setSelected} />
        </div>
        <div>
          {lead ? <LeadWorkspace lead={lead} /> : <Card className="p-6 text-sm text-muted-foreground">Pick a lead to open its workspace.</Card>}
        </div>
      </div>
    </div>
  );
}
