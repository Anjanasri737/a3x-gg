import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { BookingFlow } from "@/bookingflow/BookingFlow";

export const Route = createFileRoute("/booking-flow")({
  head: () => ({
    meta: [
      { title: "Booking Flow — WhatsApp screenshots to qualified Gharpayy leads" },
      {
        name: "description",
        content:
          "Read WhatsApp chat screenshots into the CRM, split them into 30-lead rounds for 8 handlers, and qualify each customer step by step in guided or expert mode.",
      },
      { property: "og:title", content: "Gharpayy Booking Flow" },
      { property: "og:description", content: "Screenshot to CRM, daily 30-lead rounds, and a step-by-step qualification that always ends with a next step and a deadline." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <AppShell>
      <BookingFlow />
    </AppShell>
  ),
});
