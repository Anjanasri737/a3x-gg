import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { LegacyOverlayGuard } from "@/components/flow-os/LegacyOverlayGuard";
import { EndToEndLeadManagementPage } from "@/components/lead-os/EndToEndLeadManagementPage";

export const Route = createFileRoute("/flow-os")({
  head: () => ({
    meta: [
      { title: "Lead OS — End-to-End Lead Management | Gharpayy" },
      { name: "description", content: "One canonical lead-management surface from intake and WhatsApp truth through qualification, property match, tour, booking and verified physical check-in." },
    ],
  }),
  component: () => <AppShell><LegacyOverlayGuard /><EndToEndLeadManagementPage /></AppShell>,
});
