import { useCallback } from "react";
import { toast } from "sonner";
import { useIdentityStore } from "@/lib/lead-identity/store";
import { useWorkflow, type WorkRole } from "@/lib/workflow/store";
import type { ViolationCode } from "@/lib/workflow/engine";
import { useSellableSupply } from "@/supply-hub/lib/sellable";

/**
 * Direct actions available from Control Tower and role mission queues.
 * Every mutation must either create the next movement or deliberately expose a
 * downstream handoff/dependency that still needs acceptance.
 */
export function useWorkflowActions() {
  const store = useIdentityStore();
  const wf = useWorkflow();
  const { guard } = useSellableSupply();

  const me = store.currentUser;

  const call = useCallback((ulid: string, connected: boolean) => {
    wf.logAttempt(ulid, me.id, connected);
    store.recordContact(ulid, "call");
    if (connected) store.recordReply(ulid);
    toast.success(connected ? "Connected call logged" : "Attempt logged");
  }, [wf, store, me.id]);

  const assignToMe = useCallback((ulid: string) => {
    store.assignLead(ulid, me.id, me.name, "Control Tower intervention");
    toast.success(`Assigned to ${me.name}`);
  }, [store, me]);

  const reassign = useCallback((ulid: string, toId: string, toName: string, reason: string) => {
    store.assignLead(ulid, toId, toName, reason);
    wf.handoff({ ulid, fromRole: "system", fromUser: me.id, toRole: "flow-ops", toUser: toId, trigger: `Reassigned: ${reason}` });
    toast.success(`Reassigned to ${toName}`);
  }, [store, wf, me.id]);

  const scheduleFollowUp = useCallback((ulid: string, hours: number) => {
    const until = new Date(Date.now() + hours * 3_600_000).toISOString();
    wf.setWaiting(ulid, until);
    store.logActivity(ulid, "note-added", `Next action scheduled in ${hours}h`);
    toast.success(`Follow-up due in ${hours}h`);
  }, [wf, store]);

  const scheduleTour = useCallback((ulid: string, whenIso: string, property?: string) => {
    const g = guard(property);
    if (!g.ok) { toast.error(g.reason); return false; }
    store.bookTour(ulid, whenIso, property);
    wf.setWaiting(ulid, null);
    wf.handoff({ ulid, fromRole: "flow-ops", fromUser: me.id, toRole: "tour", toUser: null, trigger: "Tour scheduled" });
    toast.success("Tour scheduled — TCM handoff created");
    return true;
  }, [store, wf, me.id, guard]);

  const confirmTour = useCallback((ulid: string) => {
    wf.logAttempt(ulid, me.id, true);
    store.recordContact(ulid, "call");
    store.logActivity(ulid, "note-added", "Tour confirmation completed by TCM");
    toast.success("Tour confirmation recorded");
  }, [wf, store, me.id]);

  const completeTour = useCallback((ulid: string, interest: "HOT" | "WARM" | "COLD") => {
    store.markToured(ulid, interest);
    wf.setWaiting(ulid, null);
    wf.handoff({ ulid, fromRole: "tour", fromUser: me.id, toRole: "closing", toUser: null, trigger: `Tour completed · interest ${interest}` });
    toast.success("Tour completed — Closing handoff created");
  }, [store, wf, me.id]);

  const createQuote = useCallback((ulid: string, amount: number, property?: string) => {
    const g = guard(property);
    if (!g.ok) { toast.error(g.reason); return false; }
    wf.createQuote(ulid, amount);
    wf.setWaiting(ulid, new Date(Date.now() + 4 * 3_600_000).toISOString());
    store.logActivity(ulid, "note-added", `Quotation created ₹${amount.toLocaleString("en-IN")}`);
    toast.success("Quotation created — closing follow-up due in 4h");
    return true;
  }, [wf, store, guard]);

  const markBooked = useCallback((ulid: string, checkInIso?: string) => {
    store.markClosed(ulid, "Workflow Guarantee · paid booking");
    if (checkInIso) store.setCheckInDate(ulid, checkInIso);
    wf.setWaiting(ulid, null);
    wf.handoff({ ulid, fromRole: "closing", fromUser: me.id, toRole: "check-in", toUser: null, trigger: "Paid booking confirmed" });
    toast.success("Booking confirmed — check-in handoff created");
  }, [store, wf, me.id]);

  const setCheckIn = useCallback((ulid: string, checkInIso: string) => {
    store.setCheckInDate(ulid, checkInIso);
    wf.setWaiting(ulid, null);
    store.logActivity(ulid, "note-added", "Check-in preparation dated through Workflow Guarantee");
    toast.success("Check-in date recorded");
  }, [store, wf]);

  const markBlocked = useCallback((ulid: string, reason: string | null) => {
    wf.setBlocked(ulid, reason);
    if (reason) {
      wf.handoff({ ulid, fromRole: "system", fromUser: me.id, toRole: "supply", toUser: null, trigger: `Supply dependency · ${reason}` });
      store.logActivity(ulid, "note-added", `Supply dependency created: ${reason}`);
      toast.success("Supply dependency created — customer owner retained");
    } else {
      store.logActivity(ulid, "note-added", "Supply dependency resolved — returned to original workflow");
      toast.success("Supply block cleared — customer returned to source workflow");
    }
  }, [wf, store, me.id]);

  const escalate = useCallback((ulid: string, code: ViolationCode) => {
    wf.resolveViolation(ulid, code, me.id, "Escalated to manager");
    store.logActivity(ulid, "note-added", `Escalated: ${code}`);
    toast.success("Escalated");
  }, [wf, store, me.id]);

  const resolve = useCallback((ulid: string, code: ViolationCode, note: string) => {
    wf.resolveViolation(ulid, code, me.id, note);
    toast.success("Marked resolved");
  }, [wf, me.id]);

  const setTargets = useCallback((role: WorkRole, actions: number) => {
    wf.setTargets(role, { actions });
  }, [wf]);

  return {
    me,
    call,
    assignToMe,
    reassign,
    scheduleFollowUp,
    scheduleTour,
    confirmTour,
    completeTour,
    createQuote,
    markBooked,
    setCheckIn,
    markBlocked,
    escalate,
    resolve,
    setTargets,
  };
}
