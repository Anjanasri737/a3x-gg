// Movement OS store — append-only events + six-dimension customer state.
// Every action writes exactly one event; every dashboard reads those events.
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  Blocker, CallResult, Checkpoint, DraftBatch, DraftCode, FunnelStage,
  LiveLock, LossReason, MovementEvent, MovementEventKind, MovementState,
  NextAction, UnmatchedChat, WorkState,
} from "./types";

const now = () => new Date().toISOString();
const uid = (p: string) => `${p}-${Math.random().toString(36).slice(2, 9)}`;

export interface ShadowSeed {
  ulid: string;
  ownerId?: string;
  ownerName?: string;
  lastCustomerMsgAt?: string | null;
  unread?: number;
  checkInDate?: string | null;
}

interface MovementStore {
  states: Record<string, MovementState>;
  events: MovementEvent[];
  batches: DraftBatch[];
  locks: Record<string, LiveLock>;
  unmatched: UnmatchedChat[];
  checkpoints: Checkpoint[];
  actor: { id: string; name: string };

  setActor: (a: { id: string; name: string }) => void;

  /** Guarantee a CRM shadow record exists for a WhatsApp conversation. */
  ensureShadow: (seed: ShadowSeed) => MovementState;
  ensureMany: (seeds: ShadowSeed[]) => void;

  log: (
    ulid: string,
    kind: MovementEventKind,
    text: string,
    extra?: Partial<MovementEvent>,
  ) => MovementEvent;

  patch: (ulid: string, p: Partial<MovementState>) => void;

  // drafting
  startBatch: (label: DraftBatch["label"], ulids: string[]) => DraftBatch;
  draft: (ulid: string, code: DraftCode, batchId?: string, position?: string) => void;
  markWaDraft: (ulid: string, code: DraftCode) => void;
  syncDraft: (ulid: string) => void;
  advanceBatch: (batchId: string) => void;
  endBatch: (batchId: string) => void;

  // live lock
  claim: (ulid: string, objective: string, ttlMins?: number) => void;
  touchLock: (ulid: string) => void;
  release: (ulid: string) => void;
  lockOf: (ulid: string) => LiveLock | null;

  // execution
  logCall: (ulid: string, result: CallResult, note?: string) => void;
  sendMessage: (ulid: string, text: string) => void;
  customerReplied: (ulid: string, text?: string) => void;
  qualify: (ulid: string, good: boolean, checkInDate?: string | null) => void;
  setStage: (ulid: string, stage: FunnelStage, text?: string) => void;
  setWork: (ulid: string, work: WorkState) => void;
  setNextAction: (ulid: string, a: NextAction) => void;
  completeNextAction: (ulid: string) => void;
  scheduleTour: (ulid: string, at: string, property?: string) => void;
  confirmTour: (ulid: string) => void;
  tourDone: (ulid: string) => void;
  tourOutcome: (ulid: string, outcome: NonNullable<MovementState["tourOutcome"]>) => void;
  prebook: (ulid: string, step: "pitched" | "interested" | "payment-intent") => void;
  sendQuote: (ulid: string) => void;
  setBlocker: (ulid: string, b: Blocker) => void;
  collectPayment: (ulid: string, amount?: number) => void;
  book: (ulid: string) => void;
  exit: (ulid: string, reason: LossReason, note?: string) => void;

  // handoffs
  handoff: (ulid: string, to: "tcm" | "closing" | "ops") => void;
  ackHandoff: (ulid: string) => void;

  // unmatched
  addUnmatched: (u: Omit<UnmatchedChat, "id" | "ts" | "retries">) => void;
  retryUnmatched: (id: string) => void;

  snapshot: (label: Checkpoint["label"], totals: Record<string, number>) => void;
}

function blank(seed: ShadowSeed): MovementState {
  return {
    ulid: seed.ulid,
    identity: "shadow",
    waDraft: null,
    crmDraft: null,
    stage: "new",
    work: "available",
    primaryOwnerId: seed.ownerId ?? "",
    primaryOwnerName: seed.ownerName ?? "Unassigned",
    currentOperatorId: null,
    currentOperatorName: null,
    nextAction: null,
    customerWaitingSince: (seed.unread ?? 0) > 0 ? (seed.lastCustomerMsgAt ?? now()) : null,
    unread: seed.unread ?? 0,
    lastCustomerMsgAt: seed.lastCustomerMsgAt ?? null,
    lastOutboundAt: null,
    goodLead: false,
    checkInDate: seed.checkInDate ?? null,
    tourAt: null,
    tourConfirmed: false,
    tourOutcome: null,
    blocker: "none",
    lossReason: null,
    paymentExpected: false,
    handoffTo: null,
    updatedAt: now(),
  };
}

export const useMovement = create<MovementStore>()(
  persist(
    (set, get) => ({
      states: {},
      events: [],
      batches: [],
      locks: {},
      unmatched: [],
      checkpoints: [],
      actor: { id: "u-self", name: "You" },

      setActor: (a) => set({ actor: a }),

      ensureShadow: (seed) => {
        const existing = get().states[seed.ulid];
        if (existing) return existing;
        const st = blank(seed);
        set((s) => ({ states: { ...s.states, [seed.ulid]: st } }));
        get().log(seed.ulid, "ingested", "Shadow lead created from WhatsApp conversation");
        return st;
      },

      ensureMany: (seeds) => {
        const cur = get().states;
        const add: Record<string, MovementState> = {};
        const evs: MovementEvent[] = [];
        for (const seed of seeds) {
          if (cur[seed.ulid] || add[seed.ulid]) continue;
          add[seed.ulid] = blank(seed);
          evs.push({
            id: uid("ev"), ts: now(), ulid: seed.ulid, kind: "ingested",
            actorId: "system", actorName: "System",
            text: "Shadow lead created from WhatsApp conversation",
          });
        }
        if (!Object.keys(add).length) return;
        set((s) => ({ states: { ...s.states, ...add }, events: [...evs, ...s.events] }));
      },

      log: (ulid, kind, text, extra) => {
        const a = get().actor;
        const ev: MovementEvent = {
          id: uid("ev"), ts: now(), ulid, kind,
          actorId: a.id, actorName: a.name, text, ...extra,
        };
        set((s) => ({ events: [ev, ...s.events].slice(0, 4000) }));
        return ev;
      },

      patch: (ulid, p) =>
        set((s) => {
          const cur = s.states[ulid] ?? blank({ ulid });
          return { states: { ...s.states, [ulid]: { ...cur, ...p, updatedAt: now() } } };
        }),

      startBatch: (label, ulids) => {
        const a = get().actor;
        const b: DraftBatch = {
          id: `${label}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
          label, size: ulids.length, ulids, startedAt: now(),
          operatorId: a.id, operatorName: a.name, cursor: 0,
        };
        set((s) => ({ batches: [b, ...s.batches].slice(0, 60) }));
        return b;
      },

      draft: (ulid, code, batchId, position) => {
        const prev = get().states[ulid]?.crmDraft ?? null;
        const a = get().actor;
        get().patch(ulid, {
          crmDraft: code, waDraft: code, draftedAt: now(),
          draftedById: a.id, draftedByName: a.name, batchId,
          work: "available",
        });
        get().log(ulid, "drafted", `Drafted ${prev ?? "—"} → ${code}`, {
          from: prev ?? undefined, to: code, batchId, position,
        });
      },

      markWaDraft: (ulid, code) => get().patch(ulid, { waDraft: code }),

      syncDraft: (ulid) => {
        const st = get().states[ulid];
        if (!st?.waDraft) return;
        get().patch(ulid, { crmDraft: st.waDraft });
        get().log(ulid, "draft-synced", `CRM draft synced to WhatsApp (${st.waDraft})`);
      },

      advanceBatch: (batchId) =>
        set((s) => ({
          batches: s.batches.map((b) =>
            b.id === batchId ? { ...b, cursor: Math.min(b.cursor + 1, b.ulids.length) } : b,
          ),
        })),

      endBatch: (batchId) =>
        set((s) => ({
          batches: s.batches.map((b) => (b.id === batchId ? { ...b, endedAt: now() } : b)),
        })),

      claim: (ulid, objective, ttlMins = 10) => {
        const a = get().actor;
        set((s) => ({
          locks: {
            ...s.locks,
            [ulid]: {
              ulid, operatorId: a.id, operatorName: a.name,
              startedAt: now(), objective, ttlMins, lastTouchAt: now(),
            },
          },
        }));
        get().patch(ulid, { work: "in-work", currentOperatorId: a.id, currentOperatorName: a.name });
        get().log(ulid, "claimed", `Live lock by ${a.name} · ${objective}`);
      },

      touchLock: (ulid) =>
        set((s) =>
          s.locks[ulid]
            ? { locks: { ...s.locks, [ulid]: { ...s.locks[ulid], lastTouchAt: now() } } }
            : {},
        ),

      release: (ulid) => {
        set((s) => {
          const l = { ...s.locks };
          delete l[ulid];
          return { locks: l };
        });
        const st = get().states[ulid];
        get().patch(ulid, {
          currentOperatorId: null, currentOperatorName: null,
          work: st?.nextAction ? "next-action-scheduled" : "completed-for-now",
        });
        get().log(ulid, "released", "Live lock released");
      },

      lockOf: (ulid) => {
        const l = get().locks[ulid];
        if (!l) return null;
        const idleMins = (Date.now() - +new Date(l.lastTouchAt)) / 60000;
        if (idleMins > l.ttlMins) return null;
        return l;
      },

      logCall: (ulid, result, note) => {
        get().log(ulid, "call-started", "Call started");
        get().log(ulid, "call-result", `Call ${result}${note ? ` · ${note}` : ""}`, { to: result });
        const patch: Partial<MovementState> = { lastOutboundAt: now(), work: "calling" };
        if (result === "connected") {
          patch.customerWaitingSince = null;
          patch.unread = 0;
          patch.identity = "qualified";
        }
        if (result === "wrong-number") patch.stage = "lost";
        get().patch(ulid, patch);
        get().touchLock(ulid);
      },

      sendMessage: (ulid, text) => {
        get().patch(ulid, { lastOutboundAt: now(), customerWaitingSince: null, unread: 0, work: "waiting-customer" });
        get().log(ulid, "message-sent", `WhatsApp sent: ${text.slice(0, 80)}`);
      },

      customerReplied: (ulid, text) => {
        const st = get().states[ulid];
        get().patch(ulid, {
          lastCustomerMsgAt: now(),
          customerWaitingSince: st?.customerWaitingSince ?? now(),
          unread: (st?.unread ?? 0) + 1,
        });
        get().log(ulid, "customer-replied", text ? `Customer: ${text.slice(0, 80)}` : "Customer replied");
      },

      qualify: (ulid, good, checkInDate) => {
        get().patch(ulid, {
          identity: "full", goodLead: good, stage: good ? "qualified" : "new",
          checkInDate: checkInDate ?? get().states[ulid]?.checkInDate ?? null,
        });
        get().log(ulid, "qualified", good ? "Qualified — GOOD LEAD" : "Qualified — not a good lead");
        if (good) get().log(ulid, "good-lead", "Good Lead flag set by system criteria");
      },

      setStage: (ulid, stage, text) => {
        const prev = get().states[ulid]?.stage;
        get().patch(ulid, { stage });
        get().log(ulid, "note", text ?? `Stage ${prev ?? "—"} → ${stage}`, { from: prev, to: stage });
      },

      setWork: (ulid, work) => get().patch(ulid, { work }),

      setNextAction: (ulid, a) => {
        get().patch(ulid, { nextAction: a, work: "next-action-scheduled" });
        get().log(ulid, "next-action-set",
          `Next action: ${a.kind} @ ${new Date(a.dueAt).toLocaleString()} → ${a.ownerName}`);
      },

      completeNextAction: (ulid) => {
        get().patch(ulid, { nextAction: null, work: "completed-for-now" });
        get().log(ulid, "next-action-done", "Next action completed");
      },

      scheduleTour: (ulid, at, property) => {
        get().patch(ulid, { tourAt: at, tourConfirmed: false, stage: "tour-scheduled" });
        get().log(ulid, "tour-scheduled",
          `Tour scheduled ${new Date(at).toLocaleString()}${property ? ` · ${property}` : ""}`);
        get().handoff(ulid, "tcm");
      },

      confirmTour: (ulid) => {
        get().patch(ulid, { tourConfirmed: true });
        get().log(ulid, "tour-confirmed", "Tour confirmed — date, time and property locked");
      },

      tourDone: (ulid) => {
        get().patch(ulid, { stage: "tour-done", tourOutcome: null, work: "handoff-pending" });
        get().log(ulid, "tour-done", "Tour done — outcome required");
      },

      tourOutcome: (ulid, outcome) => {
        get().patch(ulid, { tourOutcome: outcome });
        get().log(ulid, "tour-outcome", `Post-tour outcome: ${outcome}`);
        if (outcome === "positive") { get().setStage(ulid, "quotation", "Closing draft created"); get().handoff(ulid, "closing"); }
        if (outcome === "not-looking") get().exit(ulid, "didnt-like-options", "Not looking after tour");
        if (outcome === "property-issue") get().setStage(ulid, "matched", "Back to matching queue");
      },

      prebook: (ulid, step) => {
        const map = {
          pitched: "prebook-pitched", interested: "prebook-interested", "payment-intent": "payment-intent",
        } as const;
        if (step === "payment-intent") get().patch(ulid, { paymentExpected: true, stage: "payment" });
        get().log(ulid, map[step], `Pre-book ${step}`);
      },

      sendQuote: (ulid) => {
        get().patch(ulid, { stage: "quotation" });
        get().log(ulid, "quote-sent", "Quotation sent");
      },

      setBlocker: (ulid, b) => {
        get().patch(ulid, { blocker: b, stage: b === "none" ? "negotiation" : "negotiation" });
        get().log(ulid, "negotiation", `Blocker: ${b}`);
      },

      collectPayment: (ulid, amount) => {
        get().patch(ulid, { stage: "payment", paymentExpected: true });
        get().log(ulid, "payment-received", `Payment received${amount ? ` ₹${amount}` : ""}`);
      },

      book: (ulid) => {
        get().patch(ulid, {
          stage: "booked", work: "completed-for-now", nextAction: null,
          customerWaitingSince: null, unread: 0,
        });
        get().log(ulid, "booked", "BOOKED");
        get().handoff(ulid, "ops");
      },

      exit: (ulid, reason, note) => {
        get().patch(ulid, { stage: "lost", lossReason: reason, work: "completed-for-now" });
        get().log(ulid, "exit", `Exit — ${reason}${note ? ` · ${note}` : ""}`);
      },

      handoff: (ulid, to) => {
        get().patch(ulid, { handoffTo: to, handoffAt: now(), handoffAckAt: null, work: "handoff-pending" });
        get().log(ulid, "handoff", `Handed off to ${to.toUpperCase()}`);
      },

      ackHandoff: (ulid) => {
        get().patch(ulid, { handoffAckAt: now(), work: "in-work" });
        get().log(ulid, "handoff-ack", "Handoff acknowledged");
      },

      addUnmatched: (u) =>
        set((s) => ({ unmatched: [{ ...u, id: uid("um"), ts: now(), retries: 0 }, ...s.unmatched] })),

      retryUnmatched: (id) =>
        set((s) => ({
          unmatched: s.unmatched
            .map((u) => (u.id === id ? { ...u, retries: u.retries + 1 } : u))
            .filter((u) => u.retries < 2),
        })),

      snapshot: (label, totals) =>
        set((s) => ({
          checkpoints: [{ id: uid("cp"), at: now(), label, totals }, ...s.checkpoints].slice(0, 40),
        })),
    }),
    { name: "gharpayy.movement.v1", version: 1 },
  ),
);
