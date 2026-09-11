import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { FlowWorkPage } from "@/components/flow-os/FlowWorkPage";
import { LegacyOverlayGuard } from "@/components/flow-os/LegacyOverlayGuard";

export const Route = createFileRoute("/my-work")({
  head: () => ({
    meta: [
      { title: "My Work — Draft 30 / Active 13 | Gharpayy Flow OS" },
      { name: "description", content: "Collision-safe customer work: Draft 30, Active 13, WhatsApp priority interrupts and mandatory Complete & Next." },
      { property: "og:title", content: "My Work — Gharpayy Flow OS" },
      { property: "og:description", content: "One customer, one handler, one mission and one dated next action." },
      { property: "og:type", content: "website" },
    ],
  }),
  component: () => <AppShell><LegacyOverlayGuard /><FlowWorkPage /></AppShell>,
});
