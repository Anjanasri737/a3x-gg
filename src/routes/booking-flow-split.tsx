import { createFileRoute } from "@tanstack/react-router";
import { ClientOnly } from "@/components/ClientOnly";
import { SplitFlow } from "@/bf100x/SplitFlow";

export const Route = createFileRoute("/booking-flow-split")({
  head: () => ({
    meta: [
      { title: "Booking Flow 100x — Split Screen | Gharpayy" },
      { name: "description", content: "Run the Gharpayy booking funnel in 40% of the screen while WhatsApp stays open in the other 60% — one screen, no scrolling, live call and pending counts." },
      { property: "og:title", content: "Booking Flow 100x — Split Screen" },
      { property: "og:description", content: "WhatsApp on 60%, the booking funnel on 40%: journey screens, ownership, closing promise and deadlines in one non-scrolling panel." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SplitPage,
});

function SplitPage() {
  return (
    <ClientOnly fallback={<p className="p-6 text-center text-sm text-muted-foreground">Loading the split screen…</p>}>
      <SplitFlow />
    </ClientOnly>
  );
}
