import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { WhatsAppCRM } from "@/wa/WhatsAppCRM";

export const Route = createFileRoute("/wa")({
  head: () => ({
    meta: [
      { title: "WhatsApp CRM — Gharpayy Shared Lead Inbox" },
      {
        name: "description",
        content:
          "A shared WhatsApp-style lead inbox with claim ownership, follow-up reminders, quick outcomes and a manager control tower.",
      },
      { property: "og:title", content: "WhatsApp CRM — Gharpayy Shared Lead Inbox" },
      {
        property: "og:description",
        content:
          "Chats instead of CRM tables: claim leads, log outcomes in one tap, set follow-ups and hand over cleanly.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: WaRoute,
});

function WaRoute() {
  return (
    <AppShell title="WhatsApp CRM">
      <WhatsAppCRM />
    </AppShell>
  );
}
