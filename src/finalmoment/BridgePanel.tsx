// Live WhatsApp bridge: every inbound message becomes a lead you can draft.
import { useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { useMovement } from "@/movement/store";
import type { MovementState } from "@/movement/types";
import { claimUnmatched, seedStuckChats, simulateInbound, useBridge } from "./bridge";

interface Props {
  /** add a bridged chat straight into the draft being marked */
  onAdd: (s: MovementState) => void;
  inDraft: (ulid: string) => boolean;
}

const ago = (iso: string) => {
  const m = Math.round((Date.now() - +new Date(iso)) / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  return `${Math.round(m / 60)}h`;
};

export function BridgePanel({ onAdd, inDraft }: Props) {
  const mv = useMovement();
  const bridge = useBridge();

  useEffect(() => {
    if (!bridge.live) return;
    const id = setInterval(() => simulateInbound(), 4000);
    return () => clearInterval(id);
  }, [bridge.live]);

  return (
    <section className="space-y-3 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">WhatsApp bridge — live ingestion</h2>
          <p className="text-xs text-muted-foreground">
            Every incoming message is matched by number + account, or opens a new shadow lead. Unmatched target is zero.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{bridge.matched} matched</Badge>
          <Badge variant="secondary">{bridge.shadows} shadow leads</Badge>
          <Badge variant={mv.unmatched.length ? "destructive" : "secondary"}>
            {mv.unmatched.length} unmatched
          </Badge>
          <Button
            size="sm"
            variant={bridge.live ? "destructive" : "default"}
            onClick={() => {
              bridge.setLive(!bridge.live);
              toast.success(bridge.live ? "Bridge paused" : "Bridge live — messages arriving");
            }}
          >
            {bridge.live ? "Pause bridge" : "Go live"}
          </Button>
          <Button size="sm" variant="outline" onClick={() => { simulateInbound(); toast.success("1 message ingested"); }}>
            Ingest 1
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              const n = seedStuckChats(30);
              toast.success(`${n} stuck chats pulled in from WhatsApp`);
            }}
          >
            Pull 30 stuck chats
          </Button>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div>
          <div className="pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Incoming feed
          </div>
          <ul className="max-h-64 space-y-1 overflow-auto">
            {bridge.feed.slice(0, 40).map((r) => {
              const s = r.ulid ? mv.states[r.ulid] : null;
              const added = r.ulid ? inDraft(r.ulid) : false;
              return (
                <li key={r.id} className="flex items-center justify-between gap-2 rounded-md border p-2 text-xs">
                  <div className="min-w-0">
                    <div className="truncate font-medium">
                      {r.name ?? "Unknown"}{" "}
                      <span className="font-mono text-muted-foreground">···{r.digits.slice(-4)}</span>{" "}
                      <Badge
                        variant={r.status === "unmatched" ? "destructive" : r.status === "shadow" ? "default" : "secondary"}
                        className="ml-1 text-[9px]"
                      >
                        {r.status}
                      </Badge>
                    </div>
                    <div className="truncate text-muted-foreground">
                      {r.waAccount} · {ago(r.ts)} · “{r.text}”
                    </div>
                  </div>
                  {s && (
                    <Button size="sm" variant={added ? "ghost" : "outline"} disabled={added} onClick={() => onAdd(s)}>
                      {added ? "in draft" : "Add this lead"}
                    </Button>
                  )}
                </li>
              );
            })}
            {!bridge.feed.length && (
              <li className="py-6 text-center text-xs text-muted-foreground">
                Nothing yet — go live or pull the stuck chats.
              </li>
            )}
          </ul>
        </div>

        <div>
          <div className="pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Unmatched queue — drive to zero
          </div>
          <ul className="max-h-64 space-y-1 overflow-auto">
            {mv.unmatched.map((u) => (
              <li key={u.id} className="flex items-center justify-between gap-2 rounded-md border p-2 text-xs">
                <div className="min-w-0">
                  <div className="truncate font-mono">{u.phoneRaw}</div>
                  <div className="truncate text-muted-foreground">
                    {u.waAccount} · {u.reason}
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    onClick={() => {
                      const row = claimUnmatched(u.id);
                      if (row?.ulid) {
                        const st = useMovement.getState().states[row.ulid];
                        if (st) onAdd(st);
                        toast.success("Lead created and added to the draft");
                      }
                    }}
                  >
                    Add this lead
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => mv.retryUnmatched(u.id)}>
                    Retry
                  </Button>
                </div>
              </li>
            ))}
            {!mv.unmatched.length && (
              <li className={cn("rounded-md border p-3 text-center text-xs text-muted-foreground")}>
                Zero unmatched conversations. 🎯
              </li>
            )}
          </ul>
        </div>
      </div>
      <Separator />
      <p className="text-[11px] text-muted-foreground">
        Bridge feeds the drafts: shadow leads land in the stuck-chat pool, so every 30-chat draft comes from live WhatsApp.
      </p>
    </section>
  );
}
