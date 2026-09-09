// Per-lead pipeline state store — layered on top of the existing lead-identity store.
// Keyed by lead id. Existing local persistence is preserved, while UUID-backed
// canonical leads are mirrored to Supabase so every surface can read one stage.
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { canAdvance, dossierCompletion, initialPipelineState, newGate } from "./stage-engine";
import type { PipelineStage } from "./stage-config";
import type { Dossier, PipelineState, StageEvidence } from "./types";
import { logAction } from "@/lib/monitoring/activity-store";
import { supabase } from "@/integrations/supabase/client";

const db = supabase as unknown as { from: (table: string) => any };
const isUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

function mirrorStage(leadId: string, stage: PipelineStage) {
  if (!isUuid(leadId)) return;
  void db.from("leads").update({ current_pipeline_stage: stage, updated_at: new Date().toISOString() }).eq("id", leadId);
}

interface PipelineStore {
  states: Record<string, PipelineState>;
  ensure: (leadId: string) => PipelineState;
  updateDossier: (
    leadId: string, patch: Partial<Dossier>,
    actor?: { userId: string; userName: string; leadName?: string },
  ) => void;
  advanceStage: (
    leadId: string, to: PipelineStage,
    actor?: { userId: string; userName: string; leadName?: string },
  ) => { ok: boolean; reason?: string };
  setTour: (leadId: string, patch: Partial<NonNullable<PipelineState["tour"]>>) => void;
  setPostVisit: (leadId: string, patch: NonNullable<PipelineState["postVisit"]>) => void;
  setQuote: (leadId: string, patch: NonNullable<PipelineState["quote"]>) => void;
  setBooking: (leadId: string, patch: NonNullable<PipelineState["booking"]>) => void;
  setCheckIn: (
    leadId: string,
    patch: Partial<NonNullable<PipelineState["checkIn"]>> & { at?: string },
    actor?: { userId: string; userName: string; leadName?: string },
  ) => { ok: boolean; reason?: string };
  overrideGate: (leadId: string, reason: string, by: string) => void;
  attachEvidence: (
    leadId: string, stage: PipelineStage,
    ev: Omit<StageEvidence, "id" | "uploadedAt">,
    actor?: { userId: string; userName: string; leadName?: string },
  ) => void;
  requestEvidence: (
    leadId: string, stage: PipelineStage, by: string, reason?: string,
    actor?: { userId: string; userName: string; leadName?: string },
  ) => void;
  verifyEvidence: (leadId: string, stage: PipelineStage, evidenceId: string, by: string) => void;
  applyDossierPreset: (
    leadId: string, patch: Partial<Dossier>,
    actor?: { userId: string; userName: string; leadName?: string },
  ) => void;
}

export const usePipeline = create<PipelineStore>()(
  persist(
    (set, get) => ({
      states: {},

      ensure: (leadId) => {
        const existing = get().states[leadId];
        if (existing) return existing;
        const fresh = initialPipelineState();
        set((s) => ({ states: { ...s.states, [leadId]: fresh } }));
        mirrorStage(leadId, fresh.currentStage);
        return fresh;
      },

      updateDossier: (leadId, patch, actor) => {
        set((s) => {
          const cur = s.states[leadId] ?? initialPipelineState();
          const nextDossier = { ...cur.dossier, ...patch };
          nextDossier.completionPct = dossierCompletion(nextDossier);
          if (nextDossier.completionPct === 100 && !nextDossier.completedAt) nextDossier.completedAt = new Date().toISOString();
          return { states: { ...s.states, [leadId]: { ...cur, dossier: nextDossier } } };
        });
        if (actor) logAction({ userId: actor.userId, userName: actor.userName, leadId, leadName: actor.leadName, action: "dossier-updated", feature: "dossier-form" });
      },

      advanceStage: (leadId, to, actor) => {
        const cur = get().states[leadId] ?? initialPipelineState();
        const check = canAdvance(cur, to);
        if (!check.ok) return check;
        set((s) => {
          const c = s.states[leadId] ?? initialPipelineState();
          return { states: { ...s.states, [leadId]: { ...c, currentStage: to, history: [...c.history, newGate(to)] } } };
        });
        mirrorStage(leadId, to);
        if (actor) logAction({ userId: actor.userId, userName: actor.userName, leadId, leadName: actor.leadName, action: "stage-changed", feature: `advance-to-${to}`, stageFrom: cur.currentStage, stageTo: to });
        return { ok: true };
      },

      setTour: (leadId, patch) => {
        set((s) => {
          const cur = s.states[leadId] ?? initialPipelineState();
          const tour = { date: cur.tour?.date ?? "", remindersSent: cur.tour?.remindersSent ?? [], ...cur.tour, ...patch };
          return { states: { ...s.states, [leadId]: { ...cur, tour } } };
        });
      },

      setPostVisit: (leadId, patch) => set((s) => {
        const cur = s.states[leadId] ?? initialPipelineState();
        return { states: { ...s.states, [leadId]: { ...cur, postVisit: patch } } };
      }),

      setQuote: (leadId, patch) => set((s) => {
        const cur = s.states[leadId] ?? initialPipelineState();
        return { states: { ...s.states, [leadId]: { ...cur, quote: patch } } };
      }),

      setBooking: (leadId, patch) => set((s) => {
        const cur = s.states[leadId] ?? initialPipelineState();
        return { states: { ...s.states, [leadId]: { ...cur, booking: patch } } };
      }),

      setCheckIn: (leadId, patch, actor) => {
        const cur = get().states[leadId] ?? initialPipelineState();
        if (!cur.booking?.paymentRef) return { ok: false, reason: "Verified booking/payment reference is required before check-in." };
        const next = {
          at: patch.at ?? cur.checkIn?.at ?? new Date().toISOString(),
          kycDone: patch.kycDone ?? cur.checkIn?.kycDone ?? false,
          agreementDone: patch.agreementDone ?? cur.checkIn?.agreementDone ?? false,
          npsScore: patch.npsScore ?? cur.checkIn?.npsScore,
        };
        if (!next.kycDone) return { ok: false, reason: "KYC must be complete before confirming check-in." };
        if (!next.agreementDone) return { ok: false, reason: "Agreement must be complete before confirming check-in." };
        set((s) => {
          const c = s.states[leadId] ?? initialPipelineState();
          return { states: { ...s.states, [leadId]: { ...c, checkIn: next, currentStage: "CHECKED_IN", history: [...c.history, newGate("CHECKED_IN")] } } };
        });
        mirrorStage(leadId, "CHECKED_IN");
        if (actor) logAction({ userId: actor.userId, userName: actor.userName, leadId, leadName: actor.leadName, action: "stage-changed", feature: "confirm-check-in", stageFrom: cur.currentStage, stageTo: "CHECKED_IN" });
        return { ok: true };
      },

      overrideGate: (leadId, reason, by) => set((s) => {
        const cur = s.states[leadId];
        if (!cur) return s;
        const history = [...cur.history];
        const last = history[history.length - 1];
        history[history.length - 1] = { ...last, managerOverride: { by, reason, at: new Date().toISOString() } };
        return { states: { ...s.states, [leadId]: { ...cur, history } } };
      }),

      attachEvidence: (leadId, stage, ev, actor) => {
        set((s) => {
          const cur = s.states[leadId];
          if (!cur) return s;
          const history = cur.history.map((g) => {
            if (g.stage !== stage) return g;
            const newEv: StageEvidence = { ...ev, id: `ev_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, uploadedAt: new Date().toISOString() };
            return { ...g, evidence: [...(g.evidence ?? []), newEv], evidenceRequested: undefined };
          });
          return { states: { ...s.states, [leadId]: { ...cur, history } } };
        });
        if (actor) logAction({ userId: actor.userId, userName: actor.userName, leadId, leadName: actor.leadName, action: "evidence-attached", feature: `evidence-${stage}` });
      },

      requestEvidence: (leadId, stage, by, reason, actor) => {
        set((s) => {
          const cur = s.states[leadId];
          if (!cur) return s;
          const history = cur.history.map((g) => g.stage === stage ? { ...g, evidenceRequested: { by, reason, at: new Date().toISOString() } } : g);
          return { states: { ...s.states, [leadId]: { ...cur, history } } };
        });
        if (actor) logAction({ userId: actor.userId, userName: actor.userName, leadId, leadName: actor.leadName, action: "evidence-requested", feature: `request-evidence-${stage}`, remarks: reason });
      },

      verifyEvidence: (leadId, stage, evidenceId, by) => set((s) => {
        const cur = s.states[leadId];
        if (!cur) return s;
        const history = cur.history.map((g) => {
          if (g.stage !== stage) return g;
          const evidence = (g.evidence ?? []).map((e) => e.id === evidenceId ? { ...e, verifiedBy: by, verifiedAt: new Date().toISOString() } : e);
          return { ...g, evidence };
        });
        return { states: { ...s.states, [leadId]: { ...cur, history } } };
      }),

      applyDossierPreset: (leadId, patch, actor) => {
        set((s) => {
          const cur = s.states[leadId] ?? initialPipelineState();
          const mergedSignals = Array.from(new Set([...(cur.dossier.signals ?? []), ...(patch.signals ?? [])]));
          const nextDossier: Dossier = { ...cur.dossier, ...patch, ...(patch.signals ? { signals: mergedSignals } : {}) };
          nextDossier.completionPct = dossierCompletion(nextDossier);
          return { states: { ...s.states, [leadId]: { ...cur, dossier: nextDossier } } };
        });
        if (actor) logAction({ userId: actor.userId, userName: actor.userName, leadId, leadName: actor.leadName, action: "preset-applied", feature: "dossier-quick-preset" });
      },
    }),
    { name: "gharpayy-pipeline-v1" },
  ),
);
