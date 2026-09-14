// Bridge from Draft Vision (a number read off a screenshot) to the full
// canonical customer story: steps, every captured chat row, labels, next step
// and how to approach next.
import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { LeadStoryPanel } from "./LeadStoryPanel";
import { findLeadOpsRowByPhone, type LeadOpsRow } from "@/lib/lead-os/library";

const CLOSED = new Set(["closed", "lost", "expired", "booked"]);

export function LeadStoryByPhone({ phone, fallbackName }: { phone?: string | null; fallbackName?: string | null }) {
  const [lead, setLead] = useState<LeadOpsRow | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");

  useEffect(() => {
    let cancelled = false;
    if (!phone) {
      setLead(null);
      setState("done");
      return;
    }
    setState("loading");
    findLeadOpsRowByPhone(phone)
      .then((row) => {
        if (cancelled) return;
        setLead(row);
        setState("done");
      })
      .catch(() => !cancelled && setState("error"));
    return () => {
      cancelled = true;
    };
  }, [phone]);

  if (state === "loading") {
    return <Card className="p-4 text-xs text-muted-foreground">Loading the full customer story…</Card>;
  }

  if (!lead) {
    return (
      <Card className="p-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-2 font-medium text-foreground">
          <Sparkles className="h-4 w-4 text-primary" /> No canonical customer for this number yet
        </span>
        <p className="pt-1">
          Once this number is resolved into the CRM, the whole journey — every captured chat row, the labels seen, the
          next step and how to approach it — appears right here.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs text-muted-foreground">
          Canonical customer · <span className="font-mono">{lead.phone}</span>
        </div>
        <Button asChild size="sm" variant="outline">
          <Link to="/flow-os">
            Open in Lead OS <ArrowUpRight className="ml-1 h-3.5 w-3.5" />
          </Link>
        </Button>
      </div>
      <LeadStoryPanel
        leadId={lead.id}
        name={lead.wa_name || fallbackName}
        stepIndex={lead.journey_step_index}
        bucketCode={lead.conversation_bucket}
        owned={Boolean(lead.current_owner)}
        closed={CLOSED.has(String(lead.status ?? "").toLowerCase())}
        lastActivityAt={lead.last_operator_action_at || lead.latest_whatsapp_observation_at || lead.updated_at}
      />
    </div>
  );
}
