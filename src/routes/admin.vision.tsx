import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { AdminControl } from "@/admincontrol/AdminControl";

export const Route = createFileRoute("/admin/vision")({
  head: () => ({
    meta: [
      { title: "Admin Draft Control — screenshot to booking | Gharpayy" },
      {
        name: "description",
        content:
          "Govern the whole chain: screenshot checkpoints, chat rows read, customers matched, who owns each one, work batches of 30, overdue actions and revenue leakage.",
      },
      { property: "og:title", content: "Admin Draft Control" },
      {
        property: "og:description",
        content: "One admin room over Draft Vision, Movement OS and the Booking Flow.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <AppShell>
      <AdminControl />
    </AppShell>
  ),
});
