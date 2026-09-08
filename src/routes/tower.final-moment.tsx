import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { TowerBoard } from "@/finalmoment/TowerBoard";
import { seedMovement } from "@/movement/seed";

export const Route = createFileRoute("/tower/final-moment")({
  head: () => ({
    meta: [
      { title: "Final Moment Control Tower — rounds, pace, tours | Gharpayy" },
      {
        name: "description",
        content:
          "Live control tower fed by Final Moment rounds: rounds today, leads per minute, tours to confirm, payments to collect and operators behind pace.",
      },
      { property: "og:title", content: "Final Moment Control Tower" },
      {
        property: "og:description",
        content: "Rounds today, leads per minute, tours to confirm, payments to collect, operators behind pace.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TowerFinalMoment,
});

function TowerFinalMoment() {
  useEffect(() => {
    seedMovement();
  }, []);
  return (
    <AppShell>
      <div className="mx-auto w-full max-w-6xl space-y-4 p-3 sm:p-5">
        <header className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight">Final Moment Control Tower</h1>
            <p className="text-xs text-muted-foreground">
              One action → one event → one customer state → one dashboard update.
            </p>
          </div>
          <Button asChild size="sm">
            <Link to="/final-moment">Open Final Moment</Link>
          </Button>
        </header>
        <TowerBoard />
      </div>
    </AppShell>
  );
}
