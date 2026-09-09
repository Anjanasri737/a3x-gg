import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { RoleGate } from "@/components/tower/RoleGate";
import { ScreenshotSyncPage } from "@/components/flow-os/ScreenshotSyncPage";

export const Route = createFileRoute("/tower/screenshot-sync")({
  head: () => ({
    meta: [
      { title: "WhatsApp Truth Sync — Gharpayy Flow OS" },
      { name: "description", content: "Reconcile repeated WhatsApp screenshots into CRM truth, work claims and zero-leakage execution." },
    ],
  }),
  component: () => (
    <AppShell>
      <RoleGate module="overview">
        <ScreenshotSyncPage />
      </RoleGate>
    </AppShell>
  ),
});
