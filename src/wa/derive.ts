// Derived selectors for the WhatsApp-style CRM inbox.
// Pure functions over the lead-identity store + the WA behaviour layer.
import type { UnifiedLead, ActivityEntry } from "@/lib/lead-identity/types";
import type { WaState, WaUnread, WaClaim, WaNextAction, WaOutcome, WaInboxMode } from "./store";

export type WaBucket = "pinned" | "attention" | "today" | "later" | "completed";

export const BUCKET_ORDER: WaBucket[] = ["pinned", "attention", "today", "later", "completed"];

export const BUCKET_LABEL: Record<WaBucket, string> = {
  pinned: "Pinned",
  attention: "Needs Attention",
  today: "Today",
  later: "Later",
  completed: "Completed",
};

const COMPLETED_STATES = new Set(["converted", "dropped", "dormant"]);
const COMPLETED_CHIPS = new Set<WaOutcome>(["booked", "lost"]);

const DAY = 24 * 60 * 60 * 1000;

/** True when a claim has gone past its SLA window without a fresh outcome. */
export function claimExpired(claim: WaClaim | undefined, slaMins: number, now: number): boolean {
  if (!claim) return false;
  const last = +new Date(claim.lastOutcomeAt);
  return now - last > slaMins * 60 * 1000;
}

/** Minutes remaining before a claim expires; negative when already expired. */
export function claimMinsLeft(claim: WaClaim | undefined, slaMins: number, now: number): number | null {
  if (!claim) return null;
  const last = +new Date(claim.lastOutcomeAt);
  return Math.round((slaMins * 60 * 1000 - (now - last)) / 60000);
}

export interface WaRow {
  lead: UnifiedLead;
  bucket: WaBucket;
  unread: WaUnread | undefined;
  claim: WaClaim | undefined;
  claimExpired: boolean;
  claimMinsLeft: number | null;
  nextAction: WaNextAction | undefined;
  chips: WaOutcome[];
  pinned: boolean;
  archived: boolean;
  archivedUntilIso?: string;
  /** sort weight — higher floats to the top within a bucket */
  weight: number;
}

export interface DeriveOpts {
  meId: string;
  role: string;
  mode: WaInboxMode;
  now: number;
  query?: string;
  wa: Pick<WaState,
    | "unread" | "pinned" | "archivedUntil" | "claims" | "nextActions" | "chips" | "handovers" | "claimSlaMins">;
}

function matchQuery(lead: UnifiedLead, q: string): boolean {
  if (!q) return true;
  const hay = [
    lead.name, lead.phoneRaw, lead.phoneE164, lead.email, lead.area,
    ...(lead.areas ?? []), lead.fullAddress ?? "", lead.zone ?? "", lead.zoneCategory ?? "",
    lead.notes ?? "", lead.type ?? "", lead.need ?? "", lead.room ?? "",
  ].join(" ").toLowerCase();
  return hay.includes(q.toLowerCase());
}

/** Decide which leads belong to a given inbox mode. */
export function leadsForMode(leads: UnifiedLead[], opts: DeriveOpts): UnifiedLead[] {
  const { meId, mode, wa } = opts;
  const todayStart = new Date(opts.now);
  todayStart.setHours(0, 0, 0, 0);

  const isArchived = (ulid: string) => {
    const iso = wa.archivedUntil[ulid];
    if (!iso) return false;
    return +new Date(iso) > opts.now;
  };

  switch (mode) {
    case "mine":
      return leads.filter((l) => {
        const claim = wa.claims[l.ulid];
        return claim?.ownerId === meId && !isArchived(l.ulid);
      });
    case "team":
      return leads.filter((l) => {
        const claim = wa.claims[l.ulid];
        return claim && claim.ownerId !== meId && !isArchived(l.ulid);
      });
    case "unclaimed":
      return leads.filter((l) => !wa.claims[l.ulid] && !isArchived(l.ulid));
    case "tower":
    default:
      return leads;
  }
}

function bucketFor(row: Omit<WaRow, "bucket">): WaBucket {
  if (row.pinned) return "pinned";
  if (row.archived) return "completed";
  const isCompleted =
    (row.lead.state && COMPLETED_STATES.has(row.lead.state)) ||
    row.chips.some((c) => COMPLETED_CHIPS.has(c));
  if (isCompleted) return "completed";
  if ((row.unread && row.unread.count > 0) || row.claimExpired) return "attention";
  if (row.nextAction) {
    const due = +new Date(row.nextAction.dueAt);
    if (due <= row.now && due >= row.now - DAY) return "today";
    if (due < row.now - DAY) return "attention"; // overdue
    if (due <= row.now + DAY) return "today";
  }
  const lastActivity = +new Date(row.lead.lastActivityAt);
  if (row.now - lastActivity < DAY) return "today";
  return "later";
}

/** Build the full ordered inbox for the active mode + query. */
export function deriveInbox(allLeads: UnifiedLead[], opts: DeriveOpts): WaRow[] {
  const leads = leadsForMode(allLeads, opts).filter((l) => matchQuery(l, opts.query ?? ""));
  const { wa, now } = opts;

  const rows: WaRow[] = leads.map((lead) => {
    const ulid = lead.ulid;
    const claim = wa.claims[ulid];
    const unread = wa.unread[ulid];
    const nextAction = wa.nextActions[ulid];
    const chips = wa.chips[ulid] ?? [];
    const pinned = wa.pinned.includes(ulid);
    const archivedUntilIso = wa.archivedUntil[ulid];
    const archived = archivedUntilIso ? +new Date(archivedUntilIso) > now : false;
    const expired = claimExpired(claim, wa.claimSlaMins, now);

    const partial: Omit<WaRow, "bucket"> = {
      lead,
      unread,
      claim,
      claimExpired: expired,
      claimMinsLeft: claimMinsLeft(claim, wa.claimSlaMins, now),
      nextAction,
      chips,
      pinned,
      archived,
      archivedUntilIso,
      now,
      weight: +new Date(lead.lastActivityAt),
    };
    return { ...partial, bucket: bucketFor(partial) };
  });

  rows.sort((a, b) => {
    if (a.bucket !== b.bucket) return BUCKET_ORDER.indexOf(a.bucket) - BUCKET_ORDER.indexOf(b.bucket);
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return b.weight - a.weight;
  });
  return rows;
}

export interface ManagerCounters {
  unclaimed: number;
  claimedByMe: number;
  claimedByTeam: number;
  claimExpired: number;
  overdueNextActions: number;
  pendingHandovers: number;
  hotToday: number;
  unreadTotal: number;
  pinned: number;
  archived: number;
}

export function deriveCounters(allLeads: UnifiedLead[], opts: DeriveOpts): ManagerCounters {
  const { wa, now, meId } = opts;
  let unclaimed = 0, claimedByMe = 0, claimedByTeam = 0, claimExpired = 0;
  let overdueNextActions = 0, hotToday = 0, unreadTotal = 0, archived = 0;
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = todayStart.getTime() + DAY;

  for (const lead of allLeads) {
    const claim = wa.claims[lead.ulid];
    if (!claim) unclaimed++;
    else if (claim.ownerId === meId) claimedByMe++;
    else claimedByTeam++;
    if (claim && claimExpired(claim, wa.claimSlaMins, now)) claimExpired++;
    const na = wa.nextActions[lead.ulid];
    if (na && +new Date(na.dueAt) <= now) overdueNextActions++;
    if (lead.priority === "super-hot" || lead.priority === "hot") {
      const la = +new Date(lead.lastActivityAt);
      if (la >= todayStart.getTime() && la < todayEnd) hotToday++;
    }
    const u = wa.unread[lead.ulid];
    if (u) unreadTotal += u.count;
    if (wa.archivedUntil[lead.ulid] && +new Date(wa.archivedUntil[lead.ulid]) > now) archived++;
  }

  return {
    unclaimed, claimedByMe, claimedByTeam, claimExpired,
    overdueNextActions,
    pendingHandovers: wa.handovers.filter((h) => h.state === "pending").length,
    hotToday, unreadTotal,
    pinned: wa.pinned.length, archived,
  };
}

/** Pending handovers addressed to the current user. */
export function handoversForMe(handovers: WaState["handovers"], meId: string) {
  return handovers.filter((h) => h.toId === meId && h.state === "pending");
}

// ── Activity → chat-message rendering ────────────────────────────────────

export interface ChatMessage {
  id: string;
  ts: string;
  /** "in" = lead side (incoming), "out" = team side (outgoing), "sys" = system */
  dir: "in" | "out" | "sys";
  text: string;
  kind: string;
  actorName?: string;
}

const OUT_KINDS = new Set<ActivityEntry["kind"]>([
  "call-logged", "whatsapp-sent", "visit-scheduled", "visit-done",
  "note-added", "state-changed", "tag-added", "tag-removed",
  "priority-changed", "assignee-changed", "earliest-checkin-set",
  "owner-changed", "secondary-added", "access-requested", "access-granted",
  "access-rejected", "reactivated", "revived",
]);

/** Map an identity-store activity timeline into WhatsApp-style chat messages. */
export function activitiesToMessages(acts: ActivityEntry[]): ChatMessage[] {
  return [...acts].reverse().map((a) => {
    let dir: ChatMessage["dir"] = "sys";
    if (a.kind === "lead-created" || a.kind === "lead-merged") dir = "sys";
    else if (OUT_KINDS.has(a.kind)) dir = "out";
    // replies from the lead arrive as recordReply → note-added with meta; treat
    // note-added whose meta.kind === "reply" as incoming.
    if (a.kind === "note-added" && a.meta && a.meta["reply"]) dir = "in";
    return {
      id: a.id, ts: a.ts, dir, text: a.text, kind: a.kind, actorName: a.actorName,
    };
  });
}
