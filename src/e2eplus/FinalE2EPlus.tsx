// Final E2E Plus — the execution operating system. Same 300-second draft rounds
// as Final Moment, plus every lead in one list with the execution drawer.
import { Compass } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { FinalMoment } from "@/finalmoment/FinalMoment";
import { AllLeadsBoard } from "./AllLeadsBoard";
import { MASTER_JOURNEY } from "./journey";

export function FinalE2EPlus() {
  return (
    <div className="mx-auto w-full max-w-7xl space-y-3 p-3 sm:p-5">
      <header className="flex flex-wrap items-start justify-between gap-3 rounded-xl border bg-card p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15">
            <Compass className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight">Final E2E Plus</h1>
            <p className="text-xs text-muted-foreground">
              Every lead answers five questions: where is the conversation, who owns it, what already happened,
              what must happen next, by when.
            </p>
          </div>
        </div>
      </header>

      <Tabs defaultValue="leads">
        <TabsList>
          <TabsTrigger value="leads">All leads</TabsTrigger>
          <TabsTrigger value="rounds">Draft rounds</TabsTrigger>
          <TabsTrigger value="journey">Master journey</TabsTrigger>
        </TabsList>

        <TabsContent value="leads" className="mt-3">
          <AllLeadsBoard />
        </TabsContent>

        <TabsContent value="rounds" className="mt-3">
          <FinalMoment />
        </TabsContent>

        <TabsContent value="journey" className="mt-3">
          <Card className="space-y-2 p-4">
            <h2 className="text-sm font-semibold">WhatsApp → Confirmed Booking</h2>
            <ol className="space-y-1.5">
              {MASTER_JOURNEY.map((s, i) => (
                <li key={s.code} className="flex gap-3 rounded-lg border p-2 text-xs">
                  <span className="font-mono text-muted-foreground">{String(i + 1).padStart(2, "0")}</span>
                  <span className="w-44 shrink-0 font-medium">{s.label}</span>
                  <span className="text-muted-foreground">Done when: {s.doneWhen}</span>
                </li>
              ))}
            </ol>
            <p className="text-[11px] text-muted-foreground">
              At any moment a lead has exactly one owner, one stage, one next action, one deadline and one active
              customer point of contact.
            </p>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default FinalE2EPlus;
