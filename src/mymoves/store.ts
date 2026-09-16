// Every button emits an event. The engine applies it, recalculates the state and
// keeps an append-only history — buttons never write random fields directly.
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Lead, LeadEvent } from "./types";
import { ACTIONS } from "./workflow";
import { timingFromMoveIn } from "./engine";
import { seedLeads } from "./seed";

export type Role = "OPERATOR" | "CLOSER" | "MANAGER";

interface State {
  me: { name: string; role: Role };
  leads: Lead[];
  setMe: (name: string, role: Role) => void;
  emit: (leadId: string, actionId: string, answers: Record<string, string>, override?: string) => void;
  captureRequirement: (leadId: string, field: string, value: string) => void;
  updateLeadDetails: (leadId: string, values: {
    owner?: string;
    nextAction?: string;
    nextActionAt?: string;
    blocker?: string;
    area?: string;
    moveIn?: string;
    roomType?: string;
    budget?: string;
    intent?: string;
  }) => void;
  reset: () => void;
}

const stamp = (actor: string, kind: string, label: string, detail?: string): LeadEvent => ({
  id: `e-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  at: new Date().toISOString(), actor, kind, label, detail,
});

export const useMyMoves = create<State>()(
  persist(
    (set, get) => ({
      me: { name: "Riya", role: "OPERATOR" },
      leads: seedLeads(),
      setMe: (name, role) => set({ me: { name, role } }),

      emit: (leadId, actionId, answers, override) =>
        set((s) => {
          const action = ACTIONS[actionId];
          if (!action) return s;
          const actor = s.me.name;
          return {
            leads: s.leads.map((l) => {
              if (l.id !== leadId) return l;
              const { patch, note } = action.apply(l, answers, actor);
              const next: Lead = { ...l, ...patch };
              next.labels = { ...next.labels, timing: next.labels.timing ?? timingFromMoveIn(next.requirement.moveIn) };
              next.events = [...l.events, stamp(actor, actionId, note, override)];
              return next;
            }),
          };
        }),

      captureRequirement: (leadId, field, value) =>
        set((s) => ({
          leads: s.leads.map((l) => {
            if (l.id !== leadId) return l;
            const numeric = field === "budget" || field === "maxBudget";
            const v = numeric ? Number(value.replace(/[^\d]/g, "")) : field === "nonNegotiables" ? [value] : value;
            const requirement = { ...l.requirement, [field]: v };
            return {
              ...l, requirement,
              labels: { ...l.labels, timing: field === "moveIn" ? timingFromMoveIn(value) : l.labels.timing },
              events: [...l.events, stamp(s.me.name, "QUALIFICATION", `${field} captured — ${value}`)],
            };
          }),
        })),

      updateLeadDetails: (leadId, values) =>
        set((s) => ({
          leads: s.leads.map((l) => {
            if (l.id !== leadId) return l;
            const requirement = {
              ...l.requirement,
              ...(values.area !== undefined ? { area: values.area } : {}),
              ...(values.moveIn !== undefined ? { moveIn: values.moveIn } : {}),
              ...(values.roomType !== undefined ? { roomType: values.roomType } : {}),
              ...(values.budget !== undefined ? { budget: Number(values.budget.replace(/[^\d]/g, "")) || undefined } : {}),
              ...(values.intent !== undefined ? { intent: values.intent as Lead["requirement"]["intent"] } : {}),
            };
            return {
              ...l,
              owner: values.owner?.trim() || undefined,
              nextAction: values.nextAction?.trim() || undefined,
              nextActionAt: values.nextActionAt || undefined,
              blocker: values.blocker?.trim() || undefined,
              requirement,
              labels: { ...l.labels, timing: timingFromMoveIn(requirement.moveIn) },
              events: [...l.events, stamp(s.me.name, "EDIT_DETAILS", "Lead details edited", `Owner, next action, deadline, blocker or requirement updated`) ],
            };
          }),
        })),

      reset: () => set({ leads: seedLeads() }),
    }),
    { name: "gharpayy-my-moves-v1", version: 1 },
  ),
);

export const selectLead = (id?: string) => (s: State) => s.leads.find((l) => l.id === id);
