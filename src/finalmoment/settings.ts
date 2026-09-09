// Small persisted settings shared by the call dock, tour scheduler and companion.
import { create } from "zustand";
import { persist } from "zustand/middleware";

interface OpsSettings {
  /** Calendly scheduling link used for every tour booking */
  calendlyUrl: string;
  setCalendlyUrl: (u: string) => void;
  /** open the dialer with tel: when a call starts */
  useTelLinks: boolean;
  setUseTelLinks: (b: boolean) => void;
}

export const useOpsSettings = create<OpsSettings>()(
  persist(
    (set) => ({
      calendlyUrl: "https://calendly.com/gharpayy/property-tour",
      setCalendlyUrl: (calendlyUrl) => set({ calendlyUrl }),
      useTelLinks: true,
      setUseTelLinks: (useTelLinks) => set({ useTelLinks }),
    }),
    { name: "gharpayy-ops-settings" },
  ),
);

/** Calendly link carrying the lead's own details so the invite is pre-filled. */
export function calendlyLinkFor(
  base: string,
  lead: { name?: string | null; phone?: string | null; ulid: string },
) {
  try {
    const u = new URL(base);
    if (lead.name) u.searchParams.set("name", lead.name);
    u.searchParams.set("a1", lead.phone ?? "");
    u.searchParams.set("utm_content", lead.ulid);
    return u.toString();
  } catch {
    return base;
  }
}
