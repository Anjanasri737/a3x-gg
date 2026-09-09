import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { RevenueGuaranteeOS } from "@/components/flow-os/RevenueGuaranteeOS";

export const Route = createFileRoute("/flow-os")({
  head: () => ({
    meta: [
      { title: "Flow OS — WhatsApp Revenue Guarantee | Gharpayy" },
      { name: "description", content: "Screenshot-to-check-in reconciliation, Draft 30, collision-proof work claims and revenue leakage control." },
    ],
  }),
  component: () => (
    <AppShell>
      <RevenueGuaranteeOS />
    </AppShell>
  ),
});
