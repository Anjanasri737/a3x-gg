import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { BookingFlow100x } from "@/bf100x/BookingFlow100x";

export const Route = createFileRoute("/booking-flow-100x")({
  head: () => ({
    meta: [
      { title: "Booking Flow 100x — four questions a screen, one Gharpayy journey" },
      {
        name: "description",
        content:
          "The Gharpayy booking journey in a handful of screens: four or five questions at a time, with the label console, closing desk and property matching on the same customer.",
      },
      { property: "og:title", content: "Gharpayy Booking Flow 100x" },
      {
        property: "og:description",
        content: "Fewer clicks, same rules: grouped questions, labels, closing desk and schedule-to-property matching in one flow.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <AppShell>
      <BookingFlow100x />
    </AppShell>
  ),
});
