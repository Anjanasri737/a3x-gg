import { createFileRoute } from "@tanstack/react-router";
import { BookingOS } from "@/bookingos/BookingOS";

const title = "Booking OS — clickable journey decision engine";
const description =
  "Click any journey step to see what is done, what is left, who owns the customer, and exactly what must happen next by when.";

export const Route = createFileRoute("/booking-os")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: BookingOS,
});
