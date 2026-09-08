import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { MovementOS } from "@/movement/MovementOS";

export const Route = createFileRoute("/movement")({
  head: () => ({
    meta: [
      { title: "Customer Movement OS — Gharpayy" },
      {
        name: "description",
        content:
          "One customer journey with drafts, a priority engine, live work locks, mandatory next actions and event-driven dashboards.",
      },
      { property: "og:title", content: "Customer Movement OS — Gharpayy" },
      {
        property: "og:description",
        content:
          "Draft every conversation, work the Active 13, never lose a customer between teams.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: MovementRoute,
});

function MovementRoute() {
  return (
    <AppShell>
      <MovementOS />
    </AppShell>
  );
}
