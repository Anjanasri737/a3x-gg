import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { CompanionPanel } from "@/wa/CompanionPanel";

export const Route = createFileRoute("/companion")({
  head: () => ({
    meta: [
      { title: "WhatsApp Companion — Gharpayy CRM Side Panel" },
      {
        name: "description",
        content:
          "The CRM opens itself beside the active WhatsApp chat: claim the lead, call it, draft it and schedule the tour without leaving the conversation.",
      },
      { property: "og:title", content: "WhatsApp Companion — Gharpayy CRM Side Panel" },
      {
        property: "og:description",
        content: "Claim, call and draft any WhatsApp chat from a CRM panel that follows the conversation.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <AppShell>
      <CompanionPanel />
    </AppShell>
  ),
});
