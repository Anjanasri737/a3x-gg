import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { FinalE2EPlus } from "@/e2eplus/FinalE2EPlus";

export const Route = createFileRoute("/final-e2e-plus")({
  head: () => ({
    meta: [
      { title: "Final E2E Plus — execution OS for every lead | Gharpayy" },
      {
        name: "description",
        content:
          "Every lead answers five questions: where the conversation is, who owns it, what already happened, what must happen next and by when — with admission gate, red signals, SLA clocks and the full booking ladder.",
      },
      { property: "og:title", content: "Final E2E Plus — execution OS for every lead" },
      {
        property: "og:description",
        content: "Draft rounds plus every lead in one list, with the execution drawer: admission, reconstruction, red signals, tour gate and booking ladder.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <AppShell>
      <FinalE2EPlus />
    </AppShell>
  ),
});
