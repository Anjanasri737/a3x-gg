import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Clock3, Eye, EyeOff, MessageCircle, UserRoundCheck, AlertTriangle } from "lucide-react";
import type { TruthRow } from "@/lib/flow-os/service";
import { inferMessageIntelligence } from "@/lib/flow-os/message-intelligence";

function syncClass(state: TruthRow["sync_state"]) {
  if (state === "GREEN") return "border-emerald-500/40 bg-emerald-500/5";
  if (state === "AMBER") return "border-amber-500/50 bg-amber-500/5";
  if (state === "RED") return "border-red-500/50 bg-red-500/5";
  return "border-slate-400/40 bg-muted/20";
}

function SeenIcon({ state }: { state?: string | null }) {
  if (state === "unseen") return <EyeOff className="h-3.5 w-3.5" />;
  return <Eye className="h-3.5 w-3.5" />;
}

type NamedTruth = TruthRow & {
  current_pipeline_stage?: string | null;
  current_owner_name?: string | null;
  current_handler_name?: string | null;
  current_batch_id?: string | null;
};

export function LeadSignalCard({ lead, onPrimary, primaryLabel, compact = false }: {
  lead: TruthRow; onPrimary?: () => void; primaryLabel?: string; compact?: boolean;
}) {
  const named = lead as NamedTruth;
  const savedStage = named.current_pipeline_stage || lead.lead_status || null;
  const intelligence = inferMessageIntelligence({
    lastMessage: lead.last_message_preview,
    direction: lead.preview_direction as any,
    unreadVisible: lead.unread_visible,
    seenState: lead.seen_state as any,
    colorHint: lead.color_hint,
    detectedLabel: lead.detected_label,
    savedStage,
  });
  const hintStage = lead.stage_inference || intelligence.inferredPipelineHint;
  const mismatch = Boolean(savedStage && hintStage && savedStage !== hintStage);
  const handlerName = named.current_handler_name || lead.handler_hint;
  const ownerName = named.current_owner_name;

  return (
    <div className={`rounded-xl border p-3 space-y-2 ${syncClass(lead.sync_state)}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="font-semibold text-sm truncate">{lead.wa_name || "Unknown customer"}</div>
            <Badge variant="outline" className="text-[10px]">{lead.sync_state}</Badge>
            <Badge variant="secondary" className="text-[10px] flex gap-1 items-center"><SeenIcon state={lead.seen_state} /> {lead.seen_state || "unknown"}</Badge>
            {lead.color_hint && <Badge variant="outline" className="text-[10px]">Colour: {lead.color_hint}</Badge>}
            {lead.detected_label && <Badge className="text-[10px]">{lead.detected_label}</Badge>}
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5">{lead.phone}</div>
        </div>
        <div className="text-right text-[10px] text-muted-foreground shrink-0">{lead.latest_observation_at ? new Date(lead.latest_observation_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}</div>
      </div>

      <div className="rounded-lg border bg-background/70 p-2">
        <div className="flex items-start gap-2">
          <MessageCircle className="h-3.5 w-3.5 mt-0.5 text-muted-foreground shrink-0" />
          <div className="min-w-0">
            <div className="text-xs line-clamp-2">{lead.last_message_preview || "No WhatsApp preview captured yet"}</div>
            <div className="flex gap-1.5 flex-wrap mt-1.5">
              <Badge variant="outline" className="text-[9px]">Saved: {savedStage || "unknown"}</Badge>
              <Badge variant={mismatch ? "destructive" : "secondary"} className="text-[9px]">Hint: {hintStage || intelligence.inferredIntent}</Badge>
              <Badge variant="secondary" className="text-[9px]">{lead.stage_confidence ?? intelligence.confidence}%</Badge>
            </div>
          </div>
        </div>
      </div>

      {!compact && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
          <div className="rounded-md border bg-background/70 p-2">
            <div className="text-muted-foreground uppercase tracking-wide text-[9px]">Who is handling this?</div>
            <div className="font-medium mt-0.5 flex items-center gap-1.5"><UserRoundCheck className="h-3.5 w-3.5" />{handlerName ? `Working now: ${handlerName}` : ownerName ? `Owner: ${ownerName}` : lead.current_owner ? "Owned · handler name unavailable" : "AVAILABLE / UNOWNED"}</div>
            {named.current_batch_id && <div className="text-muted-foreground mt-0.5">Reserved in Draft batch</div>}
            {lead.claim_expires_at && <div className="text-muted-foreground mt-0.5 flex gap-1 items-center"><Clock3 className="h-3 w-3" /> claim until {new Date(lead.claim_expires_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>}
          </div>
          <div className="rounded-md border bg-background/70 p-2">
            <div className="text-muted-foreground uppercase tracking-wide text-[9px]">Why now / mission</div>
            <div className="font-medium mt-0.5">{intelligence.primaryMission}</div>
            {mismatch && <div className="text-amber-600 flex gap-1 items-center mt-0.5"><AlertTriangle className="h-3 w-3" /> CRM saved stage and message hint differ</div>}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <div className="text-[10px] text-muted-foreground truncate">{intelligence.reasons.slice(0, 2).join(" · ")}</div>
        {onPrimary && <Button size="sm" className="h-8 shrink-0" onClick={onPrimary}>{primaryLabel || intelligence.primaryAction}</Button>}
      </div>
    </div>
  );
}
