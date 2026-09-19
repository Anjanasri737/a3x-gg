import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { CarryForward, CheckpointSnapshot, ReasonOverride } from "./checkpoints";

interface CheckpointStore {
  snapshots: CheckpointSnapshot[];
  overrides: ReasonOverride[];
  carryForwards: CarryForward[];
  saveSnapshot: (snapshot: CheckpointSnapshot) => void;
  addOverride: (input: Omit<ReasonOverride, "id" | "createdAt" | "acknowledgedBy" | "acknowledgedAt">) => void;
  acknowledgeOverride: (id: string, manager: string) => void;
  resolveRecovery: (snapshotId: string) => void;
}

export const useCheckpointStore = create<CheckpointStore>()(
  persist(
    (set) => ({
      snapshots: [], overrides: [], carryForwards: [],
      saveSnapshot: (snapshot) => set((state) => {
        const snapshots = [snapshot, ...state.snapshots.filter((item) => !(item.date === snapshot.date && item.operatorId === snapshot.operatorId && item.code === snapshot.code))].slice(0, 500);
        const carryForwards = snapshot.code === "C4" && snapshot.reason
          ? [...snapshot.reason.affectedCustomerIds.map((customerId) => ({
              id: `carry-${snapshot.id}-${customerId}`, sourceSnapshotId: snapshot.id,
              date: new Date(Date.now() + 86_400_000).toISOString().slice(0, 10), customerId,
              reason: snapshot.reason?.label ?? "Unresolved checkpoint gap", action: snapshot.reason?.action ?? "Recover this customer",
              owner: snapshot.recoveryOwner, dueAt: snapshot.recoveryDueAt ?? new Date(Date.now() + 86_400_000).toISOString(), state: "OPEN" as const,
            })), ...state.carryForwards.filter((item) => item.sourceSnapshotId !== snapshot.id)]
          : state.carryForwards;
        return { snapshots, carryForwards };
      }),
      addOverride: (input) => set((state) => ({ overrides: [{ ...input, id: `override-${Date.now()}`, createdAt: new Date().toISOString(), acknowledgedBy: null, acknowledgedAt: null }, ...state.overrides].slice(0, 300) })),
      acknowledgeOverride: (id, manager) => set((state) => ({ overrides: state.overrides.map((item) => item.id === id ? { ...item, acknowledgedBy: manager, acknowledgedAt: new Date().toISOString() } : item) })),
      resolveRecovery: (snapshotId) => set((state) => ({ snapshots: state.snapshots.map((item) => item.id === snapshotId ? { ...item, recoveryState: "DONE" } : item) })),
    }),
    { name: "gharpayy.movement-checkpoints.v1" },
  ),
);
