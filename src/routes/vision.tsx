import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { ScreenshotSyncPage } from "@/components/flow-os/ScreenshotSyncPage";

export const Route = createFileRoute("/vision")({
  head: () => ({
    meta: [
      { title: "Draft Vision — WhatsApp Truth Sync | Gharpayy" },
      { name: "description", content: "Repeated screenshot reconciliation: every visible chat accounted, one customer identity, WhatsApp movement, labels, handler and revenue-leak detection." },
      { property: "og:title", content: "Draft Vision — WhatsApp Truth Sync" },
      { property: "og:description", content: "Screenshots are observations. CRM is the operating truth. No visible customer is silently dropped." },
      { property: "og:type", content: "website" },
    ],
  }),
  component: () => <AppShell><ScreenshotSyncPage /></AppShell>,
});
