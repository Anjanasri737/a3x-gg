// Schedule-to-property matching: live inventory scored against this customer,
// with one click to share it and one click to put the tour slot in.
import { useMemo, useState } from "react";
import { Building2, CalendarClock } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { FlowLead } from "@/bookingflow/types";
import { useBookingFlow } from "@/bookingflow/store";
import { matchesFor } from "./match";

const soon = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString().slice(0, 16);

export function PropertyMatch({ lead }: { lead: FlowLead }) {
  const { answerStep, editFields, setNext, me } = useBookingFlow();
  const rows = useMemo(() => matchesFor(lead), [lead]);
  const [slot, setSlot] = useState(soon(24));
  const f = lead.f ?? {};

  function share(name: string, room: string) {
    const payload = { property: name, propertyRoom: room };
    if (f["property"]) editFields(lead.id, payload, "property changed from matching");
    else answerStep(lead.id, "MATCH", payload);
    setNext(lead.id, "Share property options", new Date(Date.now() + 2 * 3_600_000).toISOString());
    toast.success(`${name} shared with ${lead.name}`);
  }

  function schedule(name: string) {
    const payload = { tourAt: new Date(slot).toISOString(), tourHost: me };
    if (f["tourAt"]) editFields(lead.id, payload, "tour slot changed from matching");
    else answerStep(lead.id, "TOUR_SLOT", payload);
    setNext(lead.id, "Confirm the tour", new Date(slot).toISOString());
    toast.success(`Tour at ${name} put in for ${new Date(slot).toLocaleString()}`);
  }

  return (
    <div className="space-y-3">
      <Card className="p-3 text-xs">
        <p className="font-medium">What we are matching against</p>
        <p className="mt-1 text-muted-foreground">
          Area: {f["area"] || "not captured"} · Budget: {f["budget"] ? `₹${Number(f["budget"]).toLocaleString("en-IN")}` : "not captured"} ·
          Room: {f["roomType"] || "not captured"} · Move-in: {f["moveIn"] || "not captured"}
        </p>
        {f["property"] && <p className="mt-1">Already shared: <span className="font-medium">{f["property"]}</span> {f["propertyRoom"] ? `· ${f["propertyRoom"]}` : ""}</p>}
        <label className="mt-2 block w-fit">
          <span className="text-muted-foreground">Tour slot to use</span>
          <Input type="datetime-local" className="mt-1 h-8 w-[13rem] text-xs" value={slot} onChange={(e) => setSlot(e.target.value)} />
        </label>
      </Card>

      {rows.map((r) => (
        <Card key={r.roomId} className="p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">{r.name}</span>
            <Badge variant="outline" className="text-[10px]">{r.area}</Badge>
            <Badge variant="secondary" className="text-[10px]">{r.roomType} · ₹{r.price.toLocaleString("en-IN")}</Badge>
            <Badge variant="outline" className="text-[10px]">{r.bedsFree} beds free</Badge>
            <Badge className="ml-auto text-[10px]">{r.score}% fit</Badge>
          </div>
          <div className="mt-1.5 space-y-0.5 text-[11px]">
            {r.reasons.map((x) => <p key={x} className="text-muted-foreground">✓ {x}</p>)}
            {r.gaps.map((x) => <p key={x} className="text-destructive">! {x}</p>)}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Button size="sm" className="h-7 px-2 text-[11px]" onClick={() => share(r.name, `${r.roomType} · ${r.roomId}`)}>Share this property</Button>
            <Button size="sm" variant="outline" className="h-7 px-2 text-[11px]" onClick={() => schedule(r.name)}>
              <CalendarClock className="mr-1 h-3 w-3" />Put the tour in
            </Button>
          </div>
        </Card>
      ))}
    </div>
  );
}
