// Execution state the operator adds on top of the evidence: admission answers,
// ownership claim, verified reconstruction, labels, next action and timeline.
// Append-only timeline — entries are never edited or removed.
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { CloseProbability, Situation, Urgency } from "./journey";

export const WHERE_OPTIONS = [
  "Active WhatsApp Chat",
  "Old WhatsApp Chat Found",
  "WhatsApp Chat Missing",
  "Number Not Found on WhatsApp",
  "CRM Lead Exists",
  "Waiting for First Reply",
  "Duplicate / Someone Else Handling",
] as const;

export const CHANNEL_OPTIONS = ["WhatsApp", "Call", "WhatsApp + Call", "Other"] as const;
export const WHEN_OPTIONS = ["NOW", "TODAY", "FOLLOW-UP", "FUTURE", "NOT ACTIONABLE"] as const;

export type WhereOption = (typeof WHERE_OPTIONS)[number];
export type ChannelOption = (typeof CHANNEL_OPTIONS)[number];
export type WhenOption = (typeof WHEN_OPTIONS)[number];

export interface TimelineEntry {
  ts: string;
  actor: string;
  text: string;
}

export interface LeadExec {
  leadId: string;
  where?: WhereOption;
  channel?: ChannelOption;
  when?: WhenOption;
  followUpAt?: string;
  ownerId?: string;
  ownerName?: string;
  claimedAt?: string;
  ownershipMode?: "OWNED" | "NEED_HELP" | "REASSIGN";
  verified?: Record<string, boolean>;
  urgency?: Urgency;
  probability?: CloseProbability;
  situation?: Situation;
  nextAction?: string;
  nextActionAt?: string;
  lastOutcome?: string;
  tourGate?: Record<string, boolean>;
  visitStatus?: string;
  bookingStatus?: string;
  timeline: TimelineEntry[];
}

interface State {
  me: { id: string; name: string };
  adoptOperator: (me: { id: string; name: string }) => void;
  leads: Record<string, LeadExec>;
  get: (leadId: string) => LeadExec;
  patch: (leadId: string, patch: Partial<LeadExec>, note?: string) => void;
  log: (leadId: string, text: string) => void;
  claim: (leadId: string, mode: LeadExec["ownershipMode"]) => void;
  release: (leadId: string) => void;
}

const blank = (leadId: string): LeadExec => ({ leadId, timeline: [] });

export const useE2EPlus = create<State>()(
  persist(
    (set, get) => ({
      me: { id: "me", name: "Me" },
      // Identity comes from the signed-in Flow OS operator, not a local guess.
      adoptOperator: (me) => set({ me }),
      leads: {},
      get: (leadId) => get().leads[leadId] ?? blank(leadId),
      log: (leadId, text) =>
        set((s) => {
          const cur = s.leads[leadId] ?? blank(leadId);
          return {
            leads: {
              ...s.leads,
              [leadId]: { ...cur, timeline: [...cur.timeline, { ts: new Date().toISOString(), actor: s.me.name, text }] },
            },
          };
        }),
      patch: (leadId, patch, note) =>
        set((s) => {
          const cur = s.leads[leadId] ?? blank(leadId);
          const timeline = note
            ? [...cur.timeline, { ts: new Date().toISOString(), actor: s.me.name, text: note }]
            : cur.timeline;
          return { leads: { ...s.leads, [leadId]: { ...cur, ...patch, timeline } } };
        }),
      claim: (leadId, mode) =>
        set((s) => {
          const cur = s.leads[leadId] ?? blank(leadId);
          if (cur.ownerId && cur.ownerId !== s.me.id && mode === "OWNED") return s;
          const now = new Date().toISOString();
          const text =
            mode === "OWNED"
              ? `${s.me.name} took ownership — SLA started`
              : mode === "NEED_HELP"
                ? `${s.me.name} asked for help — visible to Control Tower`
                : `${s.me.name} requested reassignment`;
          return {
            leads: {
              ...s.leads,
              [leadId]: {
                ...cur,
                ownershipMode: mode,
                ownerId: mode === "OWNED" ? s.me.id : cur.ownerId,
                ownerName: mode === "OWNED" ? s.me.name : cur.ownerName,
                claimedAt: mode === "OWNED" ? now : cur.claimedAt,
                timeline: [...cur.timeline, { ts: now, actor: s.me.name, text }],
              },
            },
          };
        }),
      release: (leadId) =>
        set((s) => {
          const cur = s.leads[leadId] ?? blank(leadId);
          return {
            leads: {
              ...s.leads,
              [leadId]: {
                ...cur,
                ownerId: undefined,
                ownerName: undefined,
                ownershipMode: undefined,
                timeline: [...cur.timeline, { ts: new Date().toISOString(), actor: s.me.name, text: "Released the claim — history preserved" }],
              },
            },
          };
        }),
    }),
    { name: "gharpayy-e2e-plus-v1", partialize: (s) => ({ leads: s.leads }) as unknown as State },
  ),
);
