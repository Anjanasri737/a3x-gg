import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { MyMoves } from "@/mymoves/MyMoves";

export const Route = createFileRoute("/mymoves")({
  head: () => ({
    meta: [
      { title: "My Moves — Gharpayy Booking OS execution workspace" },
      {
        name: "description",
        content:
          "One workspace for every lead: stage-driven actions, mandatory next action and deadline, red signals, hard blocks, Control Tower exceptions and the full WhatsApp-to-check-in ladder.",
      },
      { property: "og:title", content: "My Moves — Gharpayy Booking OS" },
      {
        property: "og:description",
        content: "Stage-driven execution: one screen decides the question, the buttons, the timer and the next stage for every customer.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <AppShell>
      <MyMoves />
    </AppShell>
  ),
});
