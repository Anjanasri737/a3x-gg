import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { FlowWorkPage } from "@/components/flow-os/FlowWorkPage";

export const Route = createFileRoute("/flow-os/work")({
  head: () => ({
    meta: [
      { title: "My Flow OS — Gharpayy" },
      { name: "description", content: "Collision-safe Draft 30, Active 13 and WhatsApp priority interrupts." },
    ],
  }),
  component: () => <AppShell><FlowWorkPage /></AppShell>,
});
