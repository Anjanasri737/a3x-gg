import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { ClientOnly } from "@/components/ClientOnly";
import { MovementSplitOS } from "@/movementsplit/MovementSplitOS";

export const Route = createFileRoute("/movement-split")({
  head: () => ({
    meta: [
      { title: "Movement OS Split — Gharpayy" },
      {
        name: "description",
        content:
          "Customer Movement OS with the split-screen booking flow inside it: D1–D4 drafts of 30 customers each, drag-to-resize panel width, live work and handoffs.",
      },
      { property: "og:title", content: "Movement OS Split — Gharpayy" },
      {
        property: "og:description",
        content:
          "Work the journey and the split-screen booking funnel on one page, with four daily drafts of 30 customers and your own panel width.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MovementSplitRoute,
});

function MovementSplitRoute() {
  return (
    <AppShell>
      <ClientOnly fallback={<p className="p-6 text-center text-sm text-muted-foreground">Loading…</p>}>
        <MovementSplitOS />
      </ClientOnly>
    </AppShell>
  );
}
