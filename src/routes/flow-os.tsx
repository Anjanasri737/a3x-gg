import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { FlowOSHome } from "@/components/flow-os/FlowOSHome";
import { LegacyOverlayGuard } from "@/components/flow-os/LegacyOverlayGuard";

export const Route = createFileRoute("/flow-os")({
  head: () => ({
    meta: [
      { title: "Flow OS 100x — OCR to Check-in | Gharpayy" },
      { name: "description", content: "One canonical screenshot-to-check-in operating system: zero-miss WhatsApp truth, Draft 30, Active 13, collision-safe work, revenue leakage and verified physical check-in." },
    ],
  }),
  component: () => <AppShell><LegacyOverlayGuard /><FlowOSHome /></AppShell>,
});
