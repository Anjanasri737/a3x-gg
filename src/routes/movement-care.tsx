import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { ClientOnly } from "@/components/ClientOnly";
import { MovementCare } from "@/movement-care/MovementCare";

export const Route = createFileRoute("/movement-care")({
  head: () => ({
    meta: [
      { title: "Movement CARE — Result-Centric Drafting | Gharpayy" },
      { name: "description", content: "Set a FIND, SCHEDULE, COMPLETE or CLOSE result before drafting, then move every customer with ownership, proof, deadlines and accepted outcomes." },
      { property: "og:title", content: "Movement CARE — Result-Centric Drafting" },
      { property: "og:description", content: "Draft Vision and Movement OS combined around daily outcomes, accountability, Flow Ops and TCM playbooks." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <AppShell>
      <ClientOnly fallback={<p className="p-6 text-center text-sm text-muted-foreground">Loading Movement CARE…</p>}>
        <MovementCare />
      </ClientOnly>
    </AppShell>
  ),
});