import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export interface ChatSignalStripProps {
  seenState?: "seen" | "unseen" | "unknown" | null;
  unreadCount?: number | null;
  observedAt?: string | null;
  labelColour?: string | null;
  labelName?: string | null;
  currentHandlerName?: string | null;
  ownerName?: string | null;
  claimAgeLabel?: string | null;
  compact?: boolean;
}

function colourStyle(colour?: string | null) {
  if (!colour) return undefined;
  const safe = colour.trim();
  if (/^#[0-9a-f]{3,8}$/i.test(safe)) return { backgroundColor: safe };
  const named: Record<string, string> = {
    green: "#22c55e",
    blue: "#3b82f6",
    yellow: "#eab308",
    purple: "#a855f7",
    grey: "#94a3b8",
    gray: "#94a3b8",
    red: "#ef4444",
    orange: "#f97316",
  };
  return named[safe.toLowerCase()] ? { backgroundColor: named[safe.toLowerCase()] } : undefined;
}

function ageLabel(iso?: string | null) {
  if (!iso) return "Not observed";
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 0) return "Observed now";
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "Observed now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

export function ChatSignalStrip({
  seenState = "unknown",
  unreadCount = 0,
  observedAt,
  labelColour,
  labelName,
  currentHandlerName,
  ownerName,
  claimAgeLabel,
  compact,
}: ChatSignalStripProps) {
  const unseen = seenState === "unseen" || (unreadCount ?? 0) > 0;
  return (
    <div className={cn("flex flex-wrap items-center gap-1.5 text-[11px]", compact ? "py-1" : "py-1.5")}>
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-semibold",
          unseen
            ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"
            : seenState === "seen"
              ? "border-slate-200 bg-slate-50 text-slate-600 dark:bg-slate-900 dark:text-slate-300"
              : "border-border bg-muted/40 text-muted-foreground",
        )}
      >
        <span className={cn("h-2 w-2 rounded-full", unseen ? "bg-emerald-500" : "bg-slate-400")} />
        {unseen ? `Unseen${unreadCount ? ` · ${unreadCount}` : ""}` : seenState === "seen" ? "Seen" : "Seen state unknown"}
      </span>

      <span className="rounded-full border border-border bg-background px-2 py-0.5 text-muted-foreground">
        {ageLabel(observedAt)}
      </span>

      <span className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5">
        <span className="h-2 w-2 rounded-full border border-black/10" style={colourStyle(labelColour)} />
        {labelName?.trim() || (labelColour ? `Unknown label · ${labelColour}` : "No label")}
      </span>

      {(currentHandlerName || ownerName) && (
        <Badge variant="outline" className="h-5 rounded-full px-2 text-[10px] font-medium">
          {currentHandlerName ? `Working: ${currentHandlerName}` : `Owner: ${ownerName}`}
          {claimAgeLabel ? ` · ${claimAgeLabel}` : ""}
        </Badge>
      )}
    </div>
  );
}
