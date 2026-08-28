// WhatsApp-style CRM — two-pane inbox that makes the team feel like they're
// using WhatsApp, while ownership, follow-up and outcomes stay controlled.
import { useEffect, useMemo, useState } from "react";
import { MessageSquare } from "lucide-react";
import { useIdentityStore } from "@/lib/lead-identity/store";
import { useWa, type WaInboxMode } from "./store";
import { BUCKET_ORDER, deriveInbox, deriveCounters } from "./derive";
import { seedWaInbox } from "./seed";
import {
  InboxList, ChatPane, ActionBar, HandoverBar, ManagerTower, WaHeader, RowActions,
} from "./components";

export function WhatsAppCRM() {
  const [mode, setMode] = useState<WaInboxMode>("mine");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [tick, setTick] = useState(() => Date.now());

  const leads = useIdentityStore((s) => s.leads);
  const me = useIdentityStore((s) => s.currentUser);
  const wa = useWa();

  // Seed demo data once on mount so the inbox is never empty.
  useEffect(() => { seedWaInbox(); }, []);

  // Re-derive every 30s so claim SLAs and due follow-ups stay live.
  useEffect(() => {
    const t = setInterval(() => setTick(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const opts = useMemo(() => ({
    meId: me.id, role: me.role ?? "tcm", mode, now: tick, query,
    wa: {
      unread: wa.unread, pinned: wa.pinned, archivedUntil: wa.archivedUntil,
      claims: wa.claims, nextActions: wa.nextActions, chips: wa.chips,
      handovers: wa.handovers, claimSlaMins: wa.claimSlaMins,
    },
  }), [me.id, me.role, mode, tick, query, wa.unread, wa.pinned, wa.archivedUntil,
       wa.claims, wa.nextActions, wa.chips, wa.handovers, wa.claimSlaMins]);

  const rows = useMemo(() => deriveInbox(leads, opts), [leads, opts]);
  const counts = useMemo(
    () => deriveCounters(leads, { ...opts, mode: "tower" }),
    [leads, opts],
  );

  const activeRow = useMemo(
    () => rows.find((r) => r.lead.ulid === selected) ?? null,
    [rows, selected],
  );

  const onSelect = (ulid: string) => {
    setSelected(ulid);
    wa.clearUnread(ulid);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] gap-3">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-2 mr-1">
          <div className="h-8 w-8 rounded-lg bg-success/15 flex items-center justify-center">
            <MessageSquare className="h-4 w-4 text-success" />
          </div>
          <div>
            <h1 className="text-sm font-semibold leading-tight">WhatsApp CRM</h1>
            <p className="text-[10px] text-muted-foreground leading-tight">
              One shared inbox · claim, act, hand over
            </p>
          </div>
        </div>
        <WaHeader mode={mode} setMode={setMode} query={query} setQuery={setQuery} counts={counts} />
      </div>

      {mode === "tower" ? (
        <div className="flex-1 min-h-0 overflow-auto space-y-3">
          <ManagerTower counts={counts} onMode={setMode} />
          <div className="rounded-lg border border-border bg-card">
            <div className="px-3 py-2 border-b border-border text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
              All conversations
            </div>
            <div className="flex flex-col max-h-[50vh]">
              <InboxList rows={rows} selectedId={selected} onSelect={onSelect} buckets={BUCKET_ORDER} />
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-3">
          <div className="flex flex-col min-h-0 rounded-lg border border-border bg-card overflow-hidden">
            <InboxList rows={rows} selectedId={selected} onSelect={onSelect} buckets={BUCKET_ORDER} />
          </div>

          <div className="flex flex-col min-h-0 rounded-lg border border-border bg-card overflow-hidden">
            {activeRow ? (
              <>
                <div className="px-3 py-1.5 border-b border-border flex items-center justify-end">
                  <RowActions row={activeRow} meId={me.id} meName={me.name} />
                </div>
                <ChatPane row={activeRow} />
                <ActionBar row={activeRow} onPing={(ulid, reason) => wa.ping(ulid, reason, 0)} />
                <HandoverBar row={activeRow} meId={me.id} meName={me.name} />
              </>
            ) : (
              <ChatPane row={null} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default WhatsAppCRM;
