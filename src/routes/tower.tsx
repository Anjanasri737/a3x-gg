import { createFileRoute, Outlet, Link, useRouterState } from "@tanstack/react-router";
import { TowerAuthProvider, useTowerAuth } from "@/lib/tower/auth";
import { MemberSwitcher } from "@/components/tower/MemberSwitcher";

export const Route = createFileRoute("/tower")({
  component: () => (
    <TowerAuthProvider>
      <TowerShell />
    </TowerAuthProvider>
  ),
  head: () => ({
    meta: [
      { title: "Control Tower — Gharpayy Chat & Call Review OS" },
      { name: "description", content: "Lead flow, daily chat and call reviews, feedback loops and quality pulse for the Gharpayy floor." },
      { property: "og:title", content: "Gharpayy Control Tower" },
      { property: "og:description", content: "Zero lead left behind — lead flow plus the daily Chat & Call Review OS." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function TowerShell() {
  const auth = useTowerAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const tabs = auth.modules;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b bg-card sticky top-0 z-40">
        <div className="max-w-[1600px] mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-6 min-w-0">
            <Link to="/tower" className="shrink-0">
              <div className="text-lg font-bold">Gharpayy Control Tower</div>
              <div className="text-xs text-muted-foreground">Zero Lead Left Behind</div>
            </Link>
            <nav className="flex gap-1 flex-wrap">
              <Link
                to="/flow-os"
                className={`px-3 py-1.5 rounded text-sm font-semibold ${pathname.startsWith("/flow-os") ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary hover:bg-primary/15"}`}
                title="Screenshot reconciliation, Draft 30, WhatsApp truth and revenue leakage"
              >
                Flow OS · Revenue Guarantee
              </Link>
              <Link
                to="/tower/sla"
                className={`px-3 py-1.5 rounded text-sm font-semibold ${pathname.startsWith("/tower/sla") ? "bg-red-600 text-white" : "bg-red-500/10 text-red-600 hover:bg-red-500/15"}`}
                title="Leads nobody picked up and conversations past their SLA"
              >
                SLA Escalations
              </Link>
              {tabs.map((t) => {
                const active = t.exact ? pathname === t.to : pathname.startsWith(t.to);
                return (
                  <Link
                    key={t.to}
                    to={t.to}
                    title={t.purpose}
                    className={`px-3 py-1.5 rounded text-sm ${active ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
                  >
                    {t.label}
                  </Link>
                );
              })}
            </nav>
          </div>
          <MemberSwitcher />
        </div>
      </header>
      <main className="max-w-[1600px] mx-auto p-4">
        <Outlet />
      </main>
    </div>
  );
}
