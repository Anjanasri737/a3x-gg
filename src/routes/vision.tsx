import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { VisionHub } from "@/vision2/VisionHub";

export const Route = createFileRoute("/vision")({
  head: () => ({
    meta: [
      { title: "Draft Vision — screenshots into a claimed work pool | Gharpayy" },
      {
        name: "description",
        content:
          "Upload any number of WhatsApp screenshots, get one deduplicated lead per number with full chat history, and claim the leads you will work today.",
      },
      { property: "og:title", content: "Draft Vision — screenshots into a claimed work pool" },
      {
        property: "og:description",
        content: "Screenshots are temporary, chat observations are permanent, and a claimed number is locked for everyone else.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <AppShell>
      <VisionHub scope="user" />
    </AppShell>
  ),
});
