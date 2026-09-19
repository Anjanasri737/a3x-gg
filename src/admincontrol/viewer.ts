// Who is looking at the control room.
// Founder admin sees the whole company and can override anything.
// Team admin sees only their own zones and WhatsApp accounts, and cannot use
// founder-only powers (escalation, money view, people quality, full history).
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ControlData } from "@/lib/admin-control/data.functions";

export type ViewerRole = "founder" | "admin";

export interface ViewerState {
  role: ViewerRole;
  name: string;
  /** Team admin scope — empty means "not set yet". */
  zones: string[];
  accounts: string[];
  /** Optional: only this person's work batches. */
  person: string;
  setRole: (role: ViewerRole) => void;
  setName: (name: string) => void;
  setPerson: (person: string) => void;
  toggleZone: (zone: string) => void;
  toggleAccount: (account: string) => void;
  clearScope: () => void;
}

export const useViewer = create<ViewerState>()(
  persist(
    (set, get) => ({
      role: "founder",
      name: "Founder",
      zones: [],
      accounts: [],
      person: "",
      setRole: (role) => set({ role, name: role === "founder" ? "Founder" : get().name || "Team admin" }),
      setName: (name) => set({ name }),
      setPerson: (person) => set({ person }),
      toggleZone: (zone) =>
        set({ zones: get().zones.includes(zone) ? get().zones.filter((z) => z !== zone) : [...get().zones, zone] }),
      toggleAccount: (account) =>
        set({
          accounts: get().accounts.includes(account)
            ? get().accounts.filter((a) => a !== account)
            : [...get().accounts, account],
        }),
      clearScope: () => set({ zones: [], accounts: [], person: "" }),
    }),
    { name: "gharpayy.admin.viewer.v1" },
  ),
);

export interface Powers {
  seeMoney: boolean;
  seePeopleQuality: boolean;
  seeFullHistory: boolean;
  seeWorkloadBalance: boolean;
  escalateToTower: boolean;
  assignOwner: boolean;
  setNextAction: boolean;
  resolveRows: boolean;
  uploadScreenshots: boolean;
  impersonate: boolean;
}

export function powersOf(role: ViewerRole): Powers {
  const founder = role === "founder";
  return {
    seeMoney: founder,
    seePeopleQuality: founder,
    seeFullHistory: founder,
    seeWorkloadBalance: founder,
    escalateToTower: founder,
    assignOwner: true,
    setNextAction: true,
    resolveRows: true,
    uploadScreenshots: true,
    impersonate: founder,
  };
}

/** Cuts the company record down to what this viewer is allowed to see. */
export function scopeControlData(data: ControlData, v: Pick<ViewerState, "role" | "zones" | "accounts" | "person">): ControlData {
  if (v.role === "founder") return data;

  const zones = new Set(v.zones);
  const accounts = new Set(v.accounts);
  const anyZone = zones.size === 0;
  const anyAccount = accounts.size === 0;

  const leads = data.leads.filter((l) => anyZone || zones.has(l.zone ?? ""));
  const leadIds = new Set(leads.map((l) => l.id));

  const batches = data.batches.filter((b) => anyAccount || accounts.has(b.whatsappAccount ?? ""));
  const observations = data.observations.filter(
    (o) => (anyAccount || accounts.has(o.whatsappAccount ?? "")) && (!o.leadId || leadIds.has(o.leadId)),
  );

  const workBatches = v.person ? data.workBatches.filter((b) => b.operator === v.person) : data.workBatches;
  const workBatchIds = new Set(workBatches.map((b) => b.id));
  const workItems = data.workItems.filter(
    (i) => (!i.leadId || leadIds.has(i.leadId)) && (!i.batchId || workBatchIds.has(i.batchId)),
  );
  const actions = data.actions.filter((a) => !a.leadId || leadIds.has(a.leadId));

  return { ...data, leads, batches, observations, workBatches, workItems, actions, audit: [] };
}

/** Full option lists taken from the unscoped record, for picking a scope. */
export function scopeOptions(data?: ControlData) {
  return {
    zones: [...new Set((data?.leads ?? []).map((l) => l.zone).filter(Boolean) as string[])].sort().slice(0, 40),
    accounts: [...new Set((data?.batches ?? []).map((b) => b.whatsappAccount).filter(Boolean) as string[])].sort(),
    people: [...new Set((data?.workBatches ?? []).map((b) => b.operator).filter(Boolean) as string[])].sort(),
  };
}
