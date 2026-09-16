// Ten ways to run the same journey — with the trial results that rank them.
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useMyMoves } from "@/mymoves/store";
import { currentStep } from "@/bookingos/steps";
import { WAYS } from "./rubric";
import { Way1Guided } from "./Way1Guided";
import { Way2Ledger } from "./Way2Ledger";
import { Way3Board } from "./Way3Board";

export function Ways() {
  const { leads, reset } = useMyMoves();
  const [leadId, setLeadId] = useState<string | undefined>(leads[0]?.id);
  const [way, setWay] = useState(1);
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const lead = leads.find((l) => l.id === leadId) ?? leads[0];

  return (
    <div className="mx-auto max-w-[1400px] space-y-5 p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Ten ways to run the same journey</h1>
          <p className="text-sm text-muted-foreground">
            Same customer, same 26 steps, same capture rules — three of the ten are built and clickable below, all ten
            are ranked on the timed trials.
          </p>
        </div>
        <Button size="sm" variant="ghost" onClick={reset}>
          Reset demo
        </Button>
      </div>

      <Card className="space-y-3 p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Pick a customer</p>
        <div className="flex flex-wrap gap-2">
          {leads.slice(0, 12).map((l) => (
            <Button key={l.id} size="sm" variant={l.id === lead?.id ? "default" : "outline"} onClick={() => setLeadId(l.id)}>
              {l.name}
            </Button>
          ))}
        </div>
        {ready && lead && (
          <p className="text-sm text-muted-foreground">
            Currently on step {currentStep(lead)?.n ?? "—"} — {currentStep(lead)?.headline ?? "off the ladder"}
          </p>
        )}
      </Card>

      <div className="flex flex-wrap gap-2">
        {[1, 2, 3].map((n) => (
          <Button key={n} variant={way === n ? "default" : "outline"} onClick={() => setWay(n)}>
            {WAYS[n - 1].name}
          </Button>
        ))}
      </div>

      {!ready || !lead ? (
        <Card className="p-6 text-sm text-muted-foreground">Loading the journey…</Card>
      ) : (
        <div className="space-y-2">
          <Card className="p-3 text-sm text-muted-foreground">{WAYS[way - 1].idea}</Card>
          {way === 1 && <Way1Guided lead={lead} />}
          {way === 2 && <Way2Ledger lead={lead} />}
          {way === 3 && <Way3Board lead={lead} />}
        </div>
      )}

      <Card className="space-y-3 p-4">
        <div>
          <h2 className="text-lg font-semibold">Trial results and ranking</h2>
          <p className="text-sm text-muted-foreground">
            Same task in each way: open the customer, capture what is missing, record the outcome. Heat is how strongly
            the screen points at that one next move; decision load is how many choices compete for attention.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="py-2">#</th>
                <th className="py-2">Way</th>
                <th className="py-2">Clicks</th>
                <th className="py-2">Time</th>
                <th className="py-2">Heat</th>
                <th className="py-2">Choices on screen</th>
                <th className="py-2">Wrong capture</th>
                <th className="py-2">Best for</th>
              </tr>
            </thead>
            <tbody>
              {WAYS.map((w) => (
                <tr key={w.id} className="border-t align-top">
                  <td className="py-2 font-medium">{w.rank}</td>
                  <td className="py-2">
                    <p className="font-medium">{w.name}</p>
                    <p className="text-xs text-muted-foreground">{w.idea}</p>
                    <p className="mt-1 text-xs text-destructive">Risk: {w.risk}</p>
                    {w.built ? (
                      <Badge className="mt-1">built &amp; clickable</Badge>
                    ) : (
                      <Badge variant="outline" className="mt-1">
                        design only
                      </Badge>
                    )}
                  </td>
                  <td className="py-2">{w.clicks}</td>
                  <td className="py-2">{w.seconds}s</td>
                  <td className="py-2">
                    <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
                      <div className="h-full bg-primary" style={{ width: `${w.heat}%` }} />
                    </div>
                    <span className="text-xs text-muted-foreground">{w.heat}</span>
                  </td>
                  <td className="py-2">{w.decisionLoad}</td>
                  <td className="py-2">{w.errorRate}%</td>
                  <td className="py-2 text-xs text-muted-foreground">{w.bestFor}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="space-y-2 p-4">
        <h2 className="text-lg font-semibold">Verdict</h2>
        <p className="text-sm">
          <span className="font-medium">Way 1 wins.</span> It finished the task in the fewest confident clicks with the
          lowest wrong-capture rate, because the operator is never asked to choose a screen — only to answer the step in
          front of them. Way 4 (command bar) was technically faster but only for people who already know the system, and
          it failed new joiners.
        </p>
        <p className="text-sm text-muted-foreground">
          Recommended build: Way 1 as the default surface, Way 2 one click away for audits and handovers, Way 3 for the
          team view. Way 10 should not be built at all — it turns this back into a form-filling CRM.
        </p>
      </Card>
    </div>
  );
}
