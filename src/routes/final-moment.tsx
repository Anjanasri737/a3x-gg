import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { FinalMoment } from "@/finalmoment/FinalMoment";

export const Route = createFileRoute("/final-moment")({
  head: () => ({
    meta: [
      { title: "Final Moment — 300-second draft rounds | Gharpayy" },
      {
        name: "description",
        content:
          "Mark 30 stuck WhatsApp chats, auto-sync them into the CRM by last 4 digits, then call, text and push each lead to tour, quote or booking.",
      },
      { property: "og:title", content: "Final Moment — 300-second draft rounds" },
      {
        property: "og:description",
        content: "Four draft rounds a day: mark 30, sync 30, work 30 — with live locks so nobody double-calls.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: FinalMomentRoute,
});

function FinalMomentRoute() {
  return (
    <AppShell>
      <FinalMoment />
    </AppShell>
  );
}
