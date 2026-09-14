import { createFileRoute } from "@tanstack/react-router";
import { ConversationOpsBoard } from "@/components/lead-os/ConversationOpsBoard";

export const Route = createFileRoute("/admin/sla")({
  head: () => ({
    meta: [
      { title: "Conversation SLA Analytics — Gharpayy Admin" },
      { name: "description", content: "Company-wide view of conversation states, waiting parties and SLA breaches across every canonical customer." },
      { property: "og:title", content: "Conversation SLA Analytics — Gharpayy Admin" },
      { property: "og:description", content: "The same SLA numbers the Control Tower works from, for the whole company." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <ConversationOpsBoard
      title="Conversation SLA analytics"
      subtitle="The same live numbers the Control Tower works from: what every conversation is waiting on, which states breach most, and who is idle."
    />
  ),
});
