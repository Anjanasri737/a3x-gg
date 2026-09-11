import { useEffect, useState } from "react";
import { Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { updateCanonicalLeadProfile } from "@/lib/lead-os/service";
import type { TruthRow } from "@/lib/flow-os/service";

export function LeadQualificationEditor({ lead, onSaved }: { lead: TruthRow; onSaved: (lead: TruthRow) => void | Promise<void> }) {
  const [name, setName] = useState(lead.wa_name || "");
  const [location, setLocation] = useState(lead.location_text || "");
  const [moveIn, setMoveIn] = useState(lead.movein_date || "");
  const [mission, setMission] = useState(lead.current_mission || "");
  const [blocker, setBlocker] = useState(lead.primary_blocker || "");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setName(lead.wa_name || "");
    setLocation(lead.location_text || "");
    setMoveIn(lead.movein_date || "");
    setMission(lead.current_mission || "");
    setBlocker(lead.primary_blocker || "");
  }, [lead.lead_id, lead.wa_name, lead.location_text, lead.movein_date, lead.current_mission, lead.primary_blocker]);

  async function save() {
    setBusy(true);
    try {
      const fresh = await updateCanonicalLeadProfile(lead.lead_id, {
        name,
        locationText: location,
        moveInDate: moveIn,
        currentMission: mission,
        primaryBlocker: blocker,
      });
      await onSaved(fresh);
      toast.success("Lead qualification saved to the canonical customer record");
    } catch (error: any) {
      toast.error(error?.message || "Could not save lead qualification");
    } finally {
      setBusy(false);
    }
  }

  return <Card className="border-primary/20 p-4">
    <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
      <div><h3 className="font-semibold">Requirement & conversion context</h3><p className="text-xs text-muted-foreground">Edit the canonical customer record here. These fields stay with the same lead throughout tour, booking and check-in.</p></div>
      <Button size="sm" disabled={busy} onClick={() => void save()}><Save className="mr-1.5 h-4 w-4" />{busy ? "Saving…" : "Save qualification"}</Button>
    </div>
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      <label className="space-y-1 text-xs"><span>Customer name</span><Input value={name} onChange={(e) => setName(e.target.value)} /></label>
      <label className="space-y-1 text-xs"><span>Location requirement</span><Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Area / office / college" /></label>
      <label className="space-y-1 text-xs"><span>Move-in date</span><Input type="date" value={moveIn} onChange={(e) => setMoveIn(e.target.value)} /></label>
      <label className="space-y-1 text-xs"><span>Primary blocker</span><Input value={blocker} onChange={(e) => setBlocker(e.target.value)} placeholder="Budget, inventory, parent approval…" /></label>
      <label className="space-y-1 text-xs md:col-span-2 xl:col-span-4"><span>Current mission / exact next conversion objective</span><Textarea className="min-h-20" value={mission} onChange={(e) => setMission(e.target.value)} placeholder="Example: Lock 2 verified properties and schedule tour today" /></label>
    </div>
  </Card>;
}
