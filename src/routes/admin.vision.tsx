import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { VisionHub } from "@/vision2/VisionHub";

export const Route = createFileRoute("/admin/vision")({
  head: () => ({
    meta: [
      { title: "Admin Draft Vision — screenshot to booking funnel | Gharpayy" },
      {
        name: "description",
        content:
          "Trace every customer from the first screenshot to the booking: chat rows detected, unique leads, claims, accuracy and daily lead inflow.",
      },
      { property: "og:title", content: "Admin Draft Vision" },
      {
        property: "og:description",
        content: "Screenshot to lead to claim to outcome, with accuracy and inflow reporting.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <AppShell>
      <VisionHub scope="admin" />
    </AppShell>
  ),
});
