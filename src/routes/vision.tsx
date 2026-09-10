import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { ScreenshotSyncPage } from "@/components/flow-os/ScreenshotSyncPage";

export const Route = createFileRoute("/vision")({
  head: () => ({
    meta: [
      { title: "WhatsApp Truth Sync — Gharpayy Flow OS" },
      { name: "description", content: "Lovable AI Vision screenshot extraction, zero-miss reconciliation, message intelligence, ownership and revenue-leak detection." },
      { property: "og:title", content: "WhatsApp Truth Sync — Gharpayy Flow OS" },
      { property: "og:description", content: "Screenshots are observations. CRM is the operating truth. No visible customer is silently dropped." },
      { property: "og:type", content: "website" },
    ],
  }),
  component: () => <AppShell><ScreenshotSyncPage /></AppShell>,
});
