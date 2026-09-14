import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { BookOpen, MessageSquare } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { LeadJourneyStrip, FALLBACK_STEPS } from "./LeadJourneyStrip";
import {
  listJourneyProgress,
  listJourneySteps,
  listLibraryRows,
  type JourneyProgress,
  type JourneyStep,
  type LibraryRow,
} from "@/lib/lead-os/library";

export function LeadConversationLibraryPanel({ leadId, stepIndex }: { leadId: string; stepIndex?: number | null }) {
  const [steps, setSteps] = useState<JourneyStep[]>(FALLBACK_STEPS);
  const [progress, setProgress] = useState<JourneyProgress[]>([]);
  const [rows, setRows] = useState<LibraryRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [allSteps, prog, libRows] = await Promise.all([
          listJourneySteps(),
          listJourneyProgress(leadId),
          listLibraryRows({ leadId, limit: 50 }),
        ]);
        if (cancelled) return;
        if (allSteps.length) setSteps(allSteps);
        setProgress(prog);
        setRows(libRows);
      } catch {
        /* library data is optional evidence, never blocks the workspace */
      }
    })();
    return () => { cancelled = true; };
  }, [leadId]);

  const current = progress.find((p) => p.status === "current");
  const currentIndex = current
    ? (steps.find((s) => s.code === current.step_code)?.ordinal ?? stepIndex ?? 1)
    : (stepIndex ?? 1);
  const currentStep = steps.find((s) => s.ordinal === currentIndex);

  return (
    <Card className="space-y-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 font-semibold"><BookOpen className="h-4 w-4" />Journey S1 → S9 and conversation evidence</h2>
          <p className="text-xs text-muted-foreground">
            Steps come from the workflow library; chat lines are captured screenshot evidence, not a status the customer confirmed.
          </p>
        </div>
        <Button asChild variant="outline" size="sm"><Link to="/conversation-library">Conversation library</Link></Button>
      </div>

      <LeadJourneyStrip steps={steps} currentIndex={currentIndex} />

      {currentStep && (
        <div className="rounded-lg border bg-muted/30 p-3 text-xs">
          <div className="font-medium">{currentStep.code} · {currentStep.name}</div>
          {currentStep.purpose && <div className="mt-0.5 text-muted-foreground">{currentStep.purpose}</div>}
          {currentStep.done_when && <div className="mt-0.5">Done when: {currentStep.done_when}</div>}
          {currentStep.owner_role && <div className="mt-0.5 text-muted-foreground">Owner: {currentStep.owner_role}</div>}
        </div>
      )}

      <div className="space-y-2">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <MessageSquare className="h-3.5 w-3.5" />{rows.length} captured chat line{rows.length === 1 ? "" : "s"} linked to this customer
        </div>
        {rows.map((row) => (
          <div key={row.row_id} className="rounded-lg border p-2 text-xs">
            <div className="flex flex-wrap items-center gap-1.5">
              {row.bucket && (
                <Link to="/conversation-library" search={{ bucket: row.bucket } as never}>
                  <Badge variant="secondary" className="text-[10px]">{row.bucket.replaceAll("_", " ")}</Badge>
                </Link>
              )}
              {row.direction && <Badge variant="outline" className="text-[10px]">{row.direction}</Badge>}
              {row.priority && <Badge variant="outline" className="text-[10px]">{row.priority}</Badge>}
              <span className="text-[10px] text-muted-foreground">{row.capture_date} · {row.visible_time || "—"} · {row.screenshot}</span>
            </div>
            <div className="mt-1">{row.last_message || "No readable text on this row"}</div>
            {row.next_action && <div className="mt-0.5 text-muted-foreground">Next: {row.next_action.replaceAll("_", " ")}{row.waiting_on ? ` · waiting on ${row.waiting_on}` : ""}</div>}
          </div>
        ))}
        {!rows.length && <div className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">No screenshot evidence linked to this customer yet.</div>}
      </div>
    </Card>
  );
}
