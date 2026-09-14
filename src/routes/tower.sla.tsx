import { createFileRoute } from "@tanstack/react-router";
import { ConversationOpsBoard } from "@/components/lead-os/ConversationOpsBoard";

export const Route = createFileRoute("/tower/sla")({
  head: () => ({
    meta: [
      { title: "SLA Escalations — Gharpayy Control Tower" },
      { name: "description", content: "Every customer whose conversation has gone past its SLA, who it is waiting on, and who must act next." },
      { property: "og:title", content: "SLA Escalations — Gharpayy Control Tower" },
      { property: "og:description", content: "Breached conversations, unowned leads and the exact next action for each." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <ConversationOpsBoard
      title="SLA escalations"
      subtitle="Leads nobody picked up, or where the conversation has gone quiet past its SLA, land here. Red means act now."
    />
  ),
});
