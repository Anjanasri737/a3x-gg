// Bridge — every WhatsApp conversation is guaranteed a CRM record.
import { useEffect, useMemo } from "react";
import { useIdentityStore } from "@/lib/lead-identity/store";
import { useWa } from "@/wa/store";
import { useMovement } from "./store";
import type { MovementState } from "./types";
import { normalizePhoneIN } from "@/lib/lead-identity/normalize";

/**
 * Auto-ingestion: keeps a Movement state for every known lead, matching on the
 * normalised phone number. Conversations whose phone cannot be matched land in
 * the Unmatched queue instead of silently disappearing.
 */
export function useMovementSync() {
  const leads = useIdentityStore((s) => s.leads);
  const me = useIdentityStore((s) => s.currentUser);
  const unread = useWa((s) => s.unread);
  const claims = useWa((s) => s.claims);
  const ensureMany = useMovement((s) => s.ensureMany);
  const setActor = useMovement((s) => s.setActor);
  const states = useMovement((s) => s.states);

  useEffect(() => {
    setActor({ id: me.id, name: me.name, role: "flow-ops", zone: "KORA CORE" });
  }, [me.id, me.name, setActor]);

  useEffect(() => {
    ensureMany(
      leads.map((l) => ({
        ulid: l.ulid,
        ownerId: claims[l.ulid]?.ownerId ?? l.assigneeId ?? l.primaryOwnerId ?? "",
        ownerName: claims[l.ulid]?.ownerName ?? l.assigneeName ?? "Unassigned",
        unread: unread[l.ulid]?.count ?? 0,
        lastCustomerMsgAt: l.lastActivityAt ?? l.updatedAt,
        checkInDate: l.earliestCheckIn ?? l.moveInDate ?? null,
      })),
    );
  }, [leads, unread, claims, ensureMany]);

  const list = useMemo(
    () => leads.map((l) => states[l.ulid]).filter(Boolean) as MovementState[],
    [leads, states],
  );

  const nameOf = useMemo(() => {
    const m = new Map<string, { name: string; phone: string; area: string }>();
    leads.forEach((l) =>
      m.set(l.ulid, {
        name: l.name || l.phoneE164 || "Unknown",
        phone: l.phoneE164 || normalizePhoneIN(l.phoneRaw || ""),
        area: l.area || l.zone || "—",
      }),
    );
    return m;
  }, [leads]);

  return { list, nameOf, me };
}
