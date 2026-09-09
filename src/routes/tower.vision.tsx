import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { VisionHub } from "@/vision2/VisionHub";

export const Route = createFileRoute("/tower/vision")({
  head: () => ({
    meta: [
      { title: "Control Tower Draft Vision — multi-day screenshot intake | Gharpayy" },
      {
        name: "description",
        content:
          "Load several days of WhatsApp screenshots in one go, see chat rows, unique customers, first-seen numbers, stuck reasons and who owns what.",
      },
      { property: "og:title", content: "Control Tower Draft Vision" },
      {
        property: "og:description",
        content: "Multi-day screenshot intake with deduplicated customers, movement tracking and collision-free claiming.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <AppShell>
      <VisionHub scope="tower" />
    </AppShell>
  ),
});
