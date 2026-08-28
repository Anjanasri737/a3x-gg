// WhatsApp-style CRM UI components: InboxList, ChatPane, ActionBar, HandoverBar, ManagerTower.
import { useMemo, useState } from "react";
import {
  Phone, StickyNote, BellRing, CalendarCheck, FileText, XCircle, CheckCircle2,
  Pin, PinOff, Archive, ArchiveRestore, Search, Clock, AlertTriangle, Flame,
  MessageSquare, Users, Inbox as InboxIcon, Timer, ChevronRight, CornerUpRight,
  Check, X, UserPlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { formatDistanceToNow, format } from "date-fns";
import { useIdentityStore } from "@/lib/lead-identity/store";
import { useApp } from "@/lib/store";
import { PERSONAS } from "@/lib/personas";
import { useWa, type WaOutcome, type WaInboxMode } from "./store";
import {
  BUCKET_LABEL, deriveInbox, deriveCounters, handoversForMe,
  activitiesToMessages, type WaRow, type WaBucket, type ChatMessage,
} from "./derive";

const now = () => Date.now();

const CHIP_META: Record<WaOutcome, { label: string; cls: string }> = {
  interested: { label: "Interested", cls: "bg-info/15 text-info border-info/30" },
  tour: { label: "Tour", cls: "bg-accent/15 text-accent border-accent/30" },
  hot: { label: "Hot", cls: "bg-destructive/15 text-destructive border-destructive/30" },
  future: { label: "Future", cls: "bg-warning/15 text-warning border-warning/30" },
  "no-answer": { label: "No answer", cls: "bg-muted text-muted-foreground border-border" },
  lost: { label: "Lost", cls: "bg-destructive/10 text-destructive/70 border-destructive/20" },
  booked: { label: "Booked", cls: "bg-success/15 text-success border-success/30" },
  quote: { label: "Quote", cls: "bg-purple-500/15 text-purple-500 border-purple-500/30" },
};

// ── InboxList ──────────────────────────────────────────────────────────────

export function InboxList({
  rows, selectedId, onSelect, buckets,
}: {
  rows: WaRow[];
  selectedId: string | null;
  onSelect: (ulid: string) => void;
  buckets: WaBucket[];
}) {
  const grouped = useMemo(() => {
    const map = new Map<WaBucket, WaRow[]>();
    for (const b of buckets) map.set(b, []);
    for (const r of rows) {
      const arr = map.get(r.bucket);
      if (arr) arr.push(r);
    }
    return map;
  }, [rows, buckets]);

  if (rows.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground p-8 text-center">
        No conversations in this view.
      </div>
    );
  }

  return (
    <ScrollArea className="flex-1 min-h-0">
      <div className="p-2 space-y-3">
        {buckets.map((b) => {
          const list = grouped.get(b) ?? [];
          if (list.length === 0) return null;
          return (
            <div key={b}>
              <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1.5">
                {BUCKET_LABEL[b]}
                <span className="font-mono opacity-60">{list.length}</span>
              </div>
              <div className="space-y-1">
                {list.map((r) => (
                  <InboxRow key={r.lead.ulid} row={r} active={r.lead.ulid === selectedId} onSelect={onSelect} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
}

function InboxRow({ row, active, onSelect }: { row: WaRow; active: boolean; onSelect: (id: string) => void }) {
  const wa = useWa();
  const lead = row.lead;
  const initials = lead.name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  return (
    <button
      onClick={() => onSelect(lead.ulid)}
      className={cn(
        "w-full text-left rounded-lg px-2.5 py-2 flex gap-2.5 items-start transition-colors border",
        active ? "bg-accent/10 border-accent/30" : "border-transparent hover:bg-muted/50",
      )}
    >
      <div className="relative shrink-0">
        <div className="h-9 w-9 rounded-full bg-gradient-to-br from-accent/30 to-info/20 flex items-center justify-center text-[11px] font-semibold">
          {initials}
        </div>
        {row.unread && row.unread.count > 0 && (
          <span className="absolute -top-1 -right-1 h-4 min-w-4 px-1 rounded-full bg-success text-success-foreground text-[9px] font-mono flex items-center justify-center font-bold">
            {row.unread.count}
          </span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="font-semibold text-[13px] truncate flex-1">{lead.name}</span>
          {row.pinned && <Pin className="h-3 w-3 text-accent shrink-0" />}
          <span className="text-[10px] text-muted-foreground shrink-0">
            {formatDistanceToNow(+new Date(lead.lastActivityAt), { addSuffix: true })}
          </span>
        </div>
        <div className="text-[11px] text-muted-foreground truncate">
          {row.unread?.reason ?? lead.area ?? "—"}
        </div>
        <div className="flex items-center gap-1 mt-0.5 flex-wrap">
          {lead.priority === "super-hot" && (
            <Badge variant="outline" className="text-[9px] px-1 py-0 border-destructive/40 text-destructive">
              <Flame className="h-2.5 w-2.5 mr-0.5" />Super
            </Badge>
          )}
          {row.claim && (
            <span className={cn(
              "text-[9px] px-1 py-0.5 rounded border",
              row.claimExpired
                ? "bg-destructive/10 text-destructive border-destructive/30"
                : "bg-muted text-muted-foreground border-border",
            )}>
              {row.claim.ownerName.split(" ")[0]}
              {row.claimExpired ? " · stale" : ` · ${row.claimMinsLeft}m`}
            </span>
          )}
          {row.chips.map((c) => (
            <span key={c} className={cn("text-[9px] px-1 py-0 rounded border", CHIP_META[c].cls)}>
              {CHIP_META[c].label}
            </span>
          ))}
        </div>
      </div>
    </button>
  );
}

// ── ChatPane ───────────────────────────────────────────────────────────────

export function ChatPane({ row }: { row: WaRow | null }) {
  const activities = useIdentityStore((s) => s.activities);
  const msgs = useMemo(() => {
    if (!row) return [];
    const acts = activities.filter((a) => a.ulid === row.lead.ulid);
    return activitiesToMessages(acts);
  }, [activities, row]);

  if (!row) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
        Select a conversation to view the chat timeline.
      </div>
    );
  }

  const lead = row.lead;
  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="px-4 py-3 border-b border-border bg-card/50">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-full bg-gradient-to-br from-accent/30 to-info/20 flex items-center justify-center text-[11px] font-semibold">
            {lead.name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-sm truncate">{lead.name}</div>
            <div className="text-[11px] text-muted-foreground truncate">
              {lead.phoneRaw} · {lead.area} · ₹{lead.budget.toLocaleString("en-IN")} · {lead.room}/{lead.need}
            </div>
          </div>
          {lead.priority === "super-hot" && (
            <Badge variant="outline" className="text-[10px] border-destructive/40 text-destructive">
              <Flame className="h-3 w-3 mr-1" />Super hot
            </Badge>
          )}
        </div>
      </div>
      <ScrollArea className="flex-1 min-h-0 bg-muted/20">
        <div className="p-4 space-y-2">
          {msgs.length === 0 ? (
            <div className="text-center text-xs text-muted-foreground py-8">No activity yet.</div>
          ) : (
            msgs.map((m) => <ChatBubble key={m.id} m={m} />)
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function ChatBubble({ m }: { m: ChatMessage }) {
  if (m.dir === "sys") {
    return (
      <div className="text-center my-1">
        <span className="text-[10px] text-muted-foreground bg-muted/60 rounded-full px-2.5 py-0.5">
          {m.text}
        </span>
      </div>
    );
  }
  const mine = m.dir === "out";
  return (
    <div className={cn("flex", mine ? "justify-end" : "justify-start")}>
      <div className={cn(
        "max-w-[78%] rounded-2xl px-3 py-1.5 text-[12.5px] leading-snug",
        mine ? "bg-success/15 text-foreground rounded-br-sm" : "bg-card border border-border rounded-bl-sm",
      )}>
        <div>{m.text}</div>
        <div className="text-[9px] text-muted-foreground mt-0.5 text-right">
          {format(new Date(m.ts), "MMM d, h:mm a")}
        </div>
      </div>
    </div>
  );
}

// ── ActionBar ──────────────────────────────────────────────────────────────

const FOLLOW_PRESETS: { label: string; mins: number | null }[] = [
  { label: "30 min", mins: 30 },
  { label: "1 hour", mins: 60 },
  { label: "2 hours", mins: 120 },
  { label: "Today EOD", mins: null },
  { label: "Tomorrow", mins: 60 * 24 },
];

export function ActionBar({ row, onPing }: { row: WaRow; onPing: (ulid: string, reason: string) => void }) {
  const ulid = row.lead.ulid;
  const id = useIdentityStore();
  const wa = useWa();
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState("");
  const [fuOpen, setFuOpen] = useState(false);
  const [fuPreset, setFuPreset] = useState(0);
  const [fuCustom, setFuCustom] = useState("");
  const [lostOpen, setLostOpen] = useState(false);
  const [lostReason, setLostReason] = useState("");
  const [tourOpen, setTourOpen] = useState(false);
  const [tourDate, setTourDate] = useState("");

  const act = (label: string) => {
    wa.touchOutcome(ulid);
    onPing(ulid, label);
  };

  const logCall = () => {
    id.logActivity(ulid, "call-logged", "Outbound call logged");
    wa.addChip(ulid, "interested");
    act("Call logged");
  };
  const saveNote = () => {
    if (!note.trim()) return;
    id.logActivity(ulid, "note-added", note.trim());
    act("Note added");
    setNote(""); setNoteOpen(false);
  };
  const saveFollowUp = () => {
    const p = FOLLOW_PRESETS[fuPreset];
    let due: string;
    if (p.mins === null) {
      const d = new Date(); d.setHours(18, 0, 0, 0); due = d.toISOString();
    } else if (fuCustom) {
      due = new Date(fuCustom).toISOString();
    } else {
      due = new Date(Date.now() + p.mins * 60_000).toISOString();
    }
    wa.setNextAction(ulid, { dueAt: due, kind: "follow-up", note: p.label });
    id.logActivity(ulid, "note-added", `Follow-up set: ${p.label}${fuCustom ? " (custom)" : ""}`);
    act(`Follow-up · ${p.label}`);
    setFuOpen(false);
  };
  const saveTour = () => {
    if (!tourDate) return;
    id.bookTour(ulid, new Date(tourDate).toISOString(), row.lead.propertyName);
    wa.addChip(ulid, "tour");
    act("Tour scheduled");
    setTourOpen(false); setTourDate("");
  };
  const sendQuote = () => {
    wa.addChip(ulid, "quote");
    id.logActivity(ulid, "note-added", "Quotation sent");
    act("Quote sent");
  };
  const saveLost = () => {
    const reason = lostReason.trim() || "Lost";
    try { id.markLost(ulid, reason); } catch { /* may require objection */ id.setLifecycleState(ulid, "dropped"); }
    wa.addChip(ulid, "lost");
    id.logActivity(ulid, "note-added", `Marked lost: ${reason}`);
    act("Lost");
    setLostOpen(false); setLostReason("");
  };
  const saveBook = () => {
    id.setLifecycleState(ulid, "converted");
    wa.addChip(ulid, "booked");
    id.logActivity(ulid, "note-added", "Booking confirmed 🎉");
    act("Booked");
  };

  return (
    <div className="border-t border-border bg-card">
      <div className="p-2 flex items-center gap-1 flex-wrap">
        <ActBtn icon={Phone} label="Call" onClick={logCall} tone="info" />
        <ActBtn icon={StickyNote} label="Note" onClick={() => setNoteOpen((v) => !v)} />
        <ActBtn icon={BellRing} label="Follow-up" onClick={() => setFuOpen((v) => !v)} tone="warning" />
        <ActBtn icon={CalendarCheck} label="Tour" onClick={() => setTourOpen((v) => !v)} tone="accent" />
        <ActBtn icon={FileText} label="Quote" onClick={sendQuote} />
        <ActBtn icon={XCircle} label="Lost" onClick={() => setLostOpen((v) => !v)} tone="destructive" />
        <ActBtn icon={CheckCircle2} label="Book" onClick={saveBook} tone="success" />
      </div>

      {noteOpen && (
        <div className="px-2 pb-2 space-y-1.5">
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note…" rows={2} className="text-xs" />
          <Button size="sm" onClick={saveNote}>Save note</Button>
        </div>
      )}

      {fuOpen && (
        <div className="px-2 pb-2 space-y-1.5">
          <div className="flex flex-wrap gap-1">
            {FOLLOW_PRESETS.map((p, i) => (
              <button key={p.label} onClick={() => setFuPreset(i)}
                className={cn("text-[11px] px-2 py-1 rounded-md border",
                  fuPreset === i ? "border-accent bg-accent/10 text-accent" : "border-border text-muted-foreground")}>
                {p.label}
              </button>
            ))}
          </div>
          <Input type="datetime-local" value={fuCustom} onChange={(e) => setFuCustom(e.target.value)} className="text-xs h-8" />
          <Button size="sm" onClick={saveFollowUp}>Set follow-up</Button>
        </div>
      )}

      {tourOpen && (
        <div className="px-2 pb-2 space-y-1.5">
          <Input type="datetime-local" value={tourDate} onChange={(e) => setTourDate(e.target.value)} className="text-xs h-8" />
          <Button size="sm" onClick={saveTour}>Schedule tour</Button>
        </div>
      )}

      {lostOpen && (
        <div className="px-2 pb-2 space-y-1.5">
          <Input value={lostReason} onChange={(e) => setLostReason(e.target.value)} placeholder="Loss reason" className="text-xs h-8" />
          <Button size="sm" variant="destructive" onClick={saveLost}>Mark lost</Button>
        </div>
      )}
    </div>
  );
}

function ActBtn({ icon: Icon, label, onClick, tone }: {
  icon: typeof Phone; label: string; onClick: () => void; tone?: "info" | "warning" | "accent" | "destructive" | "success";
}) {
  const toneCls = tone === "info" ? "text-info" : tone === "warning" ? "text-warning" : tone === "accent" ? "text-accent"
    : tone === "destructive" ? "text-destructive" : tone === "success" ? "text-success" : "text-muted-foreground";
  return (
    <button onClick={onClick}
      className={cn("inline-flex items-center gap-1 text-[11px] px-2 py-1.5 rounded-md hover:bg-muted border border-transparent hover:border-border", toneCls)}>
      <Icon className="h-3.5 w-3.5" />{label}
    </button>
  );
}

// ── HandoverBar ────────────────────────────────────────────────────────────

export function HandoverBar({ row, meId, meName }: { row: WaRow; meId: string; meName: string }) {
  const wa = useWa();
  const id = useIdentityStore();
  const [toId, setToId] = useState("");
  const [msg, setMsg] = useState("");
  const pending = handoversForMe(wa.handovers, meId);

  const teammates = useMemo(
    () => PERSONAS.filter((p) => p.role === "tcm" || p.role === "flow-ops"),
    [],
  );

  const doTransfer = () => {
    const m = teammates.find((t) => t.id === toId);
    if (!m) return;
    wa.transfer({
      ulid: row.lead.ulid, fromId: meId, fromName: meName,
      toId: m.id, toName: m.name, message: msg || `Handing over ${row.lead.name}`,
    });
    id.logActivity(row.lead.ulid, "assignee-changed", `Handover requested → ${m.name}`);
    setToId(""); setMsg("");
  };

  return (
    <div className="border-t border-border bg-sidebar/30 p-2 space-y-2">
      {pending.length > 0 && (
        <div className="space-y-1">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Handovers to you</div>
          {pending.map((h) => (
            <div key={h.id} className="flex items-center gap-2 text-[11px] rounded-md border border-border px-2 py-1.5">
              <UserPlus className="h-3.5 w-3.5 text-accent" />
              <div className="flex-1 min-w-0">
                <span className="font-medium">{h.fromName}</span>
                <span className="text-muted-foreground"> → you · {h.message}</span>
              </div>
              <Button size="sm" variant="outline" className="h-6 text-[10px] px-1.5"
                onClick={() => wa.decideHandover(h.id, "accepted")}>
                <Check className="h-3 w-3" />Accept
              </Button>
              <Button size="sm" variant="ghost" className="h-6 text-[10px] px-1.5"
                onClick={() => wa.decideHandover(h.id, "declined")}>
                <X className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center gap-1.5">
        <CornerUpRight className="h-3.5 w-3.5 text-muted-foreground" />
        <Select value={toId} onValueChange={setToId}>
          <SelectTrigger className="h-7 text-[11px] flex-1"><SelectValue placeholder="Transfer to…" /></SelectTrigger>
          <SelectContent>
            {teammates.map((t) => (
              <SelectItem key={t.id} value={t.id}>{t.name} · {t.focus}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="message"
          className="h-7 text-[11px] flex-1" />
        <Button size="sm" variant="outline" className="h-7 text-[11px]" disabled={!toId} onClick={doTransfer}>
          Transfer
        </Button>
      </div>
    </div>
  );
}

// ── ManagerTower ────────────────────────────────────────────────────────────

export function ManagerTower({ counts, onMode }: {
  counts: ReturnType<typeof deriveCounters>;
  onMode: (m: WaInboxMode) => void;
}) {
  const cards: { label: string; value: number; mode: WaInboxMode; icon: typeof Users; tone: string; hint: string }[] = [
    { label: "Unclaimed", value: counts.unclaimed, mode: "unclaimed", icon: InboxIcon, tone: "text-warning", hint: "Open leads nobody owns" },
    { label: "Claim expired", value: counts.claimExpired, mode: "mine", icon: Timer, tone: "text-destructive", hint: "SLA breached — needs outcome" },
    { label: "Overdue follow-ups", value: counts.overdueNextActions, mode: "mine", icon: AlertTriangle, tone: "text-destructive", hint: "Past due date" },
    { label: "Pending handovers", value: counts.pendingHandovers, mode: "mine", icon: CornerUpRight, tone: "text-accent", hint: "Awaiting accept" },
    { label: "Hot today", value: counts.hotToday, mode: "team", icon: Flame, tone: "text-destructive", hint: "Super-hot / hot activity" },
    { label: "Unread total", value: counts.unreadTotal, mode: "team", icon: MessageSquare, tone: "text-success", hint: "Across all leads" },
    { label: "Pinned", value: counts.pinned, mode: "mine", icon: Pin, tone: "text-accent", hint: "Starred by team" },
    { label: "Archived", value: counts.archived, mode: "tower", icon: Archive, tone: "text-muted-foreground", hint: "Snoozed" },
  ];
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
      {cards.map((c) => (
        <button key={c.label} onClick={() => onMode(c.mode)}
          className="text-left rounded-lg border border-border bg-card p-3 hover:border-accent/40 transition-colors">
          <div className="flex items-center justify-between">
            <c.icon className={cn("h-4 w-4", c.tone)} />
            <span className={cn("text-2xl font-mono font-semibold", c.tone)}>{c.value}</span>
          </div>
          <div className="text-[12px] font-semibold mt-1">{c.label}</div>
          <div className="text-[10px] text-muted-foreground">{c.hint}</div>
        </button>
      ))}
    </div>
  );
}

// ── Header strip ───────────────────────────────────────────────────────────

export function WaHeader({ mode, setMode, query, setQuery, counts }: {
  mode: WaInboxMode; setMode: (m: WaInboxMode) => void;
  query: string; setQuery: (q: string) => void;
  counts: ReturnType<typeof deriveCounters>;
}) {
  const tabs: { k: WaInboxMode; label: string; n: number }[] = [
    { k: "mine", label: "My Inbox", n: counts.claimedByMe },
    { k: "team", label: "Team", n: counts.claimedByTeam },
    { k: "unclaimed", label: "Unclaimed", n: counts.unclaimed },
    { k: "tower", label: "Control Tower", n: counts.claimExpired + counts.pendingHandovers },
  ];
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="flex items-center gap-1 rounded-lg border border-border p-0.5 bg-card">
        {tabs.map((t) => (
          <button key={t.k} onClick={() => setMode(t.k)}
            className={cn("inline-flex items-center gap-1.5 text-[12px] px-2.5 py-1.5 rounded-md",
              mode === t.k ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-muted")}>
            {t.label}
            <span className="font-mono text-[10px] opacity-70">{t.n}</span>
          </button>
        ))}
      </div>
      <div className="relative flex-1 min-w-[180px] max-w-[300px]">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, phone, area…"
          className="h-8 text-xs pl-7" />
      </div>
    </div>
  );
}

// ── Row actions (pin/archive/claim) ─────────────────────────────────────────

export function RowActions({ row, meId, meName }: { row: WaRow; meId: string; meName: string }) {
  const wa = useWa();
  return (
    <div className="flex items-center gap-1">
      {!row.claim && (
        <Button size="sm" variant="outline" className="h-7 text-[10px]"
          onClick={() => wa.claim(row.lead.ulid, meId, meName)}>
          Claim
        </Button>
      )}
      {row.claim?.ownerId === meId && (
        <Button size="sm" variant="ghost" className="h-7 text-[10px]"
          onClick={() => wa.release(row.lead.ulid))}>
          Release
        </Button>
      )}
      <button title="Pin" onClick={() => wa.togglePin(row.lead.ulid)}
        className={cn("p-1 rounded hover:bg-muted", row.pinned ? "text-accent" : "text-muted-foreground")}>
        {row.pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
      </button>
      <button title="Snooze 24h" onClick={() => wa.archiveUntil(row.lead.ulid, new Date(Date.now() + 86400_000).toISOString())}
        className="p-1 rounded hover:bg-muted text-muted-foreground">
        <Archive className="h-3.5 w-3.5" />
      </button>
      {row.archived && (
        <button title="Unarchive" onClick={() => wa.unarchive(row.lead.ulid)}
          className="p-1 rounded hover:bg-muted text-muted-foreground">
          <ArchiveRestore className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
