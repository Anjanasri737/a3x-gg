// WhatsApp Web companion — the chat list on the left, the CRM opening itself on the right.
// Whichever chat is active, its CRM record is already loaded: CLAIM · CALL · DRAFT.
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { MessageSquare, Search, Send } from "lucide-react";
import { useMovement } from "@/movement/store";
import { seedMovement } from "@/movement/seed";
import { DRAFT_META, type DraftCode, type MovementState } from "@/movement/types";
import { LiveCallDock } from "@/finalmoment/LiveCallDock";
import { TourCalendly } from "@/finalmoment/TourCalendly";
import { useFinalMoment } from "@/finalmoment/store";
import { ensureStuckChats } from "@/finalmoment/bridge";

const ago = (iso?: string | null) => {
  if (!iso) return "—";
  const m = Math.round((Date.now() - +new Date(iso)) / 60000);
  if (m < 60) return `${m}m`;
  if (m < 1440) return `${Math.round(m / 60)}h`;
  return `${Math.round(m / 1440)}d`;
};

export function CompanionPanel() {
  const mv = useMovement();
  const fm = useFinalMoment();
  const [q, setQ] = useState("");
  const [activeUlid, setActive] = useState<string | null>(null);
  const [reply, setReply] = useState("");

  useEffect(() => {
    seedMovement();
    ensureStuckChats(40);
  }, []);

  const chats = useMemo(() => {
    const all = Object.values(mv.states).sort(
      (a, b) =>
        +new Date(b.lastCustomerMsgAt ?? b.updatedAt) - +new Date(a.lastCustomerMsgAt ?? a.updatedAt),
    );
    const term = q.trim().toLowerCase();
    if (!term) return all.slice(0, 60);
    const digits = term.replace(/\D/g, "");
    return all
      .filter((s) =>
        digits ? (s.phone ?? "").replace(/\D/g, "").includes(digits) : (s.name ?? "").toLowerCase().includes(term),
      )
      .slice(0, 60);
  }, [mv.states, q]);

  // the CRM opens itself: the first chat is active as soon as the panel loads
  useEffect(() => {
    if (!activeUlid && chats.length) setActive(chats[0].ulid);
  }, [chats, activeUlid]);

  const lead: MovementState | null = activeUlid ? (mv.states[activeUlid] ?? null) : null;
  const timeline = lead ? mv.events.filter((e) => e.ulid === lead.ulid).slice(0, 12) : [];

  const draftIt = (code: DraftCode) => {
    if (!lead) return;
    mv.markWaDraft(lead.ulid, code);
    mv.draft(lead.ulid, code);
    fm.pick(lead.ulid);
    fm.markWa(lead.ulid);
    toast.success(`${lead.name ?? "Chat"} drafted ${code} · added to the draft pool`);
  };

  const send = () => {
    if (!lead || !reply.trim()) return;
    mv.sendMessage(lead.ulid, reply.trim());
    setReply("");
    toast.success("Reply logged in the CRM");
  };

  return (
    <div className="grid h-[calc(100vh-6rem)] gap-3 p-3 lg:grid-cols-[320px_1fr_380px]">
      {/* ---------------------------- chat list ---------------------------- */}
      <aside className="flex min-h-0 flex-col rounded-xl border bg-card">
        <div className="flex items-center gap-2 border-b p-3">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search chats or number"
            className="h-8 border-0 px-0 text-xs focus-visible:ring-0"
          />
        </div>
        <ul className="min-h-0 flex-1 divide-y overflow-y-auto">
          {chats.map((c) => {
            const lock = mv.lockOf(c.ulid);
            return (
              <li key={c.ulid}>
                <button
                  onClick={() => setActive(c.ulid)}
                  className={cn(
                    "w-full px-3 py-2 text-left hover:bg-muted/50",
                    c.ulid === activeUlid && "bg-muted",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium">{c.name ?? c.phone ?? "Unknown"}</span>
                    <span className="text-[10px] text-muted-foreground">{ago(c.lastCustomerMsgAt)}</span>
                  </div>
                  <div className="flex items-center gap-1 truncate text-[11px] text-muted-foreground">
                    <span className="truncate">{c.lastCustomerMsg ?? "No messages yet"}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1 pt-1">
                    {c.unread > 0 && <Badge className="h-4 px-1 text-[9px]">{c.unread}</Badge>}
                    {c.crmDraft && <Badge variant="secondary" className="h-4 px-1 text-[9px]">{c.crmDraft}</Badge>}
                    {lock && (
                      <Badge variant="outline" className="h-4 px-1 text-[9px]">
                        {lock.operatorId === mv.actor.id ? "yours" : lock.operatorName}
                      </Badge>
                    )}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </aside>

      {/* --------------------------- conversation --------------------------- */}
      <section className="flex min-h-0 flex-col rounded-xl border bg-card">
        {lead ? (
          <>
            <header className="flex flex-wrap items-center justify-between gap-2 border-b p-3">
              <div>
                <div className="text-sm font-semibold">{lead.name ?? "Unknown"}</div>
                <div className="font-mono text-[11px] text-muted-foreground">
                  {lead.phone ?? "—"} · {lead.waAccount}
                </div>
              </div>
              <div className="flex flex-wrap gap-1">
                {(Object.keys(DRAFT_META) as DraftCode[]).map((d) => (
                  <Button
                    key={d}
                    size="sm"
                    variant={lead.crmDraft === d ? "default" : "outline"}
                    className="h-7 px-2 text-[11px]"
                    onClick={() => draftIt(d)}
                  >
                    {d}
                  </Button>
                ))}
              </div>
            </header>

            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
              {timeline.length ? (
                [...timeline].reverse().map((e) => (
                  <div
                    key={e.id}
                    className={cn(
                      "max-w-[80%] rounded-lg border p-2 text-xs",
                      e.kind === "customer-replied" ? "bg-muted" : "ml-auto bg-primary/5",
                    )}
                  >
                    <div>{e.text}</div>
                    <div className="pt-1 text-[10px] text-muted-foreground">
                      {new Date(e.ts).toLocaleString()} · {e.actorName}
                    </div>
                  </div>
                ))
              ) : (
                <p className="p-6 text-center text-xs text-muted-foreground">No history yet.</p>
              )}
            </div>

            <div className="flex items-center gap-2 border-t p-2">
              <Input
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && send()}
                placeholder="Type a reply — it is logged against the CRM record"
                className="h-9 text-xs"
              />
              <Button size="sm" className="h-9 gap-1" onClick={send}>
                <Send className="h-3.5 w-3.5" /> Send
              </Button>
            </div>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
            <MessageSquare className="mr-2 h-4 w-4" /> Pick a chat
          </div>
        )}
      </section>

      {/* ------------------------------ CRM side ------------------------------ */}
      <aside className="min-h-0 space-y-3 overflow-y-auto rounded-xl border bg-card p-3">
        {lead ? (
          <>
            <div>
              <h2 className="text-sm font-semibold">CRM · opened automatically</h2>
              <p className="text-[11px] text-muted-foreground">
                Stage {lead.stage} · owner {lead.primaryOwnerName} · {lead.zone || lead.waAccount}
              </p>
            </div>

            <LiveCallDock lead={lead} />

            <div className="flex flex-wrap gap-2">
              {(Object.keys(DRAFT_META) as DraftCode[]).map((d) => (
                <Button key={d} size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => draftIt(d)}>
                  Draft {d}
                </Button>
              ))}
            </div>

            <Separator />
            <TourCalendly lead={lead} />

            {lead.nextAction && (
              <div className="rounded-lg border p-2 text-[11px]">
                <span className="font-semibold">Next: </span>
                {lead.nextAction.kind} · due {new Date(lead.nextAction.dueAt).toLocaleString()}
                {lead.nextAction.note ? ` · ${lead.nextAction.note}` : ""}
              </div>
            )}
          </>
        ) : (
          <p className="text-xs text-muted-foreground">Open a chat to load its CRM record.</p>
        )}
      </aside>
    </div>
  );
}
