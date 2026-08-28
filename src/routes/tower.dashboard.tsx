import { RoleGate } from "@/components/tower/RoleGate";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { SupplyAvailabilityAlerts } from "@/components/tower/SupplyAvailabilityAlerts";

export const Route = createFileRoute("/tower/dashboard")({ component: () => <RoleGate module="dashboard"><Dash /></RoleGate> });

function Dash() {
  const [k, setK] = useState<Record<string, number>>({});

  useEffect(() => {
    (async () => {
      const t = new Date(); t.setHours(0,0,0,0);
      const iso = t.toISOString();
      const [rec, cap, asg, pending_accept, first_ok, dup, unassigned, sh_pending, sla] = await Promise.all([
        supabase.from("inbound_conversations").select("id",{count:"exact",head:true}).gte("received_at", iso),
        supabase.from("inbound_conversations").select("id",{count:"exact",head:true}).gte("received_at", iso).not("captured_at","is",null),
        supabase.from("assignments").select("id",{count:"exact",head:true}).gte("assigned_at", iso),
        supabase.from("assignments").select("id",{count:"exact",head:true}).eq("state","pending_accept"),
        supabase.from("assignments").select("id",{count:"exact",head:true}).not("first_action_at","is",null).gte("assigned_at", iso),
        supabase.from("duplicate_matches").select("id",{count:"exact",head:true}).gte("created_at", iso),
        supabase.from("leads").select("id",{count:"exact",head:true}).is("current_owner", null).eq("status","open"),
        supabase.from("assignments").select("id",{count:"exact",head:true}).eq("state","pending_accept").eq("priority","super_hot"),
        supabase.from("sla_breaches").select("id",{count:"exact",head:true}).gte("breached_at", iso),
      ]);
      const receivedN = rec.count ?? 0; const capturedN = cap.count ?? 0;
      setK({
        "Received today": receivedN, "Captured": capturedN, "Capture %": receivedN ? Math.round(capturedN / receivedN * 100) : 100,
        "Pending capture": receivedN - capturedN, "Assigned today": asg.count ?? 0,
        "Pending accept": pending_accept.count ?? 0, "First action done": first_ok.count ?? 0,
        "Duplicates prevented": dup.count ?? 0, "Unassigned leads": unassigned.count ?? 0,
        "Super Hot pending": sh_pending.count ?? 0, "SLA breaches today": sla.count ?? 0,
      });
    })();
  }, []);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {Object.entries(k).map(([label, v]) => (
          <Card key={label} className="p-3">
            <div className="text-3xl font-bold tabular-nums">{v}</div>
            <div className="text-xs text-muted-foreground uppercase tracking-wide">{label}</div>
          </Card>
        ))}
      </div>
      <SupplyAvailabilityAlerts />
    </div>
  );
}