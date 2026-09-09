// Tour Scheduled -> Calendly -> Confirm -> Done. Each step writes CRM state,
// sets the next action and pulls the lead out of the stuck queue.
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { CalendarClock, ExternalLink, CheckCircle2, Flag } from "lucide-react";
import { useMovement } from "@/movement/store";
import type { MovementState, TourOutcome } from "@/movement/types";
import { calendlyLinkFor, useOpsSettings } from "./settings";

interface Props {
  lead: MovementState;
  onScheduled?: () => void;
}

const OUTCOMES: { o: TourOutcome; label: string }[] = [
  { o: "interested", label: "Interested" },
  { o: "wants-alternatives", label: "Wants alternatives" },
  { o: "not-interested", label: "Not interested" },
];

const localNow = (offsetMins = 120) =>
  new Date(Date.now() + offsetMins * 60000 - new Date().getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);

export function TourCalendly({ lead, onScheduled }: Props) {
  const mv = useMovement();
  const { calendlyUrl, setCalendlyUrl } = useOpsSettings();
  const [at, setAt] = useState(localNow());
  const [property, setProperty] = useState(lead.tourProperty ?? "");
  const [editLink, setEditLink] = useState(false);

  const link = calendlyLinkFor(calendlyUrl, lead);

  const schedule = () => {
    if (!at) { toast.error("Pick a date and time"); return; }
    mv.scheduleTour(lead.ulid, new Date(at).toISOString(), property || undefined);
    mv.setWork(lead.ulid, "next-action-scheduled");
    mv.setNextAction(lead.ulid, {
      kind: "confirm-tour",
      dueAt: new Date(+new Date(at) - 3 * 3600000).toISOString(),
      ownerId: mv.actor.id,
      ownerName: mv.actor.name,
      note: "Confirm the tour 3 hours before",
    });
    toast.success("Tour scheduled · confirmation due 3h before · out of the stuck queue");
    onScheduled?.();
  };

  const confirm = () => {
    mv.confirmTour(lead.ulid);
    mv.setNextAction(lead.ulid, {
      kind: "post-tour-call",
      dueAt: lead.tourAt ?? new Date(Date.now() + 3600000).toISOString(),
      ownerId: mv.actor.id,
      ownerName: mv.actor.name,
      note: "Call right after the tour",
    });
    toast.success("Tour confirmed — date, time and property locked");
  };

  const done = (o: TourOutcome) => {
    mv.tourDone(lead.ulid);
    mv.tourOutcome(lead.ulid, o);
    mv.setWork(lead.ulid, "in-work");
    mv.setNextAction(lead.ulid, {
      kind: o === "interested" ? "send-quote" : o === "wants-alternatives" ? "send-property" : "recheck-later",
      dueAt: new Date(Date.now() + 60 * 60000).toISOString(),
      ownerId: mv.actor.id,
      ownerName: mv.actor.name,
      note: `Post-tour: ${o}`,
    });
    toast.success(`Tour done · ${o} · next action set`);
  };

  return (
    <div className="space-y-3 rounded-lg border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <CalendarClock className="h-4 w-4 text-primary" /> Tour
        </h3>
        <div className="flex items-center gap-2">
          {lead.tourAt && (
            <Badge variant={lead.tourConfirmed ? "default" : "secondary"}>
              {new Date(lead.tourAt).toLocaleString()} {lead.tourConfirmed ? "· confirmed" : "· unconfirmed"}
            </Badge>
          )}
          <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={() => setEditLink((v) => !v)}>
            Calendly link
          </Button>
        </div>
      </div>

      {editLink && (
        <Input
          value={calendlyUrl}
          onChange={(e) => setCalendlyUrl(e.target.value)}
          placeholder="https://calendly.com/your-team/property-tour"
          className="h-8 text-xs"
        />
      )}

      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <Input type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} className="h-9 text-xs" />
        <Input
          value={property}
          onChange={(e) => setProperty(e.target.value)}
          placeholder="Property to show"
          className="h-9 text-xs"
        />
        <Button size="sm" className="h-9" onClick={schedule}>Schedule tour</Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" className="gap-1" asChild>
          <a href={link} target="_blank" rel="noreferrer">
            <ExternalLink className="h-3.5 w-3.5" /> Open Calendly
          </a>
        </Button>
        <Button size="sm" variant="outline" className="gap-1" disabled={!lead.tourAt || lead.tourConfirmed} onClick={confirm}>
          <CheckCircle2 className="h-3.5 w-3.5" /> Confirm tour
        </Button>
        {OUTCOMES.map((x) => (
          <Button
            key={x.o}
            size="sm"
            variant="outline"
            className="gap-1"
            disabled={!lead.tourAt}
            onClick={() => done(x.o)}
          >
            <Flag className="h-3.5 w-3.5" /> Done · {x.label}
          </Button>
        ))}
      </div>
      <p className="text-[11px] text-muted-foreground">
        Scheduling hands the lead to TCM and clears it from the stuck queue; confirm and done keep the next action alive.
      </p>
    </div>
  );
}
