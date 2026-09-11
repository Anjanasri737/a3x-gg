import { useEffect } from "react";
import { useApp } from "@/lib/store";

/**
 * The historic AppShell still mounts LeadControlPanel for legacy routes.
 * Final Flow OS routes are DB-backed and must never surface that second CRM
 * drawer from a persisted local selection.
 */
export function LegacyOverlayGuard() {
  const selectedLeadId = useApp((s: any) => s.selectedLeadId);
  const selectLead = useApp((s: any) => s.selectLead);

  useEffect(() => {
    if (selectedLeadId) selectLead(null);
  }, [selectedLeadId, selectLead]);

  return null;
}
