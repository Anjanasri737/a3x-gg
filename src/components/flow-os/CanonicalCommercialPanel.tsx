import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle2, ClipboardCheck, IndianRupee, KeyRound, ShieldCheck } from "lucide-react";
import {
  approveOwner,
  confirmCheckIn,
  ensureCheckIn,
  loadCommercialState,
  markQuotationEvent,
  recordPayment,
  requestOwnerApproval,
  saveQuotation,
  updateCheckInGates,
  verifyPayment,
} from "@/lib/flow-os/commercial-api";

export function CanonicalBookingPanel({
  leadId,
  canAct = true,
  onMeaningfulAction,
  onChanged,
}: {
  leadId: string;
  canAct?: boolean;
  onMeaningfulAction?: () => void | Promise<void>;
  onChanged?: () => void | Promise<void>;
}) {
  const [state, setState] = useState<any>({ quotation: null, booking: null, checkin: null });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [quoteOpen, setQuoteOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [propertyName, setPropertyName] = useState("");
  const [roomLabel, setRoomLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [deposit, setDeposit] = useState("");
  const [maintenance, setMaintenance] = useState("");
  const [discount, setDiscount] = useState("0");
  const [expiry, setExpiry] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentRef, setPaymentRef] = useState("");
  const [paymentEvidence, setPaymentEvidence] = useState("");
  const [needsOwnerApproval, setNeedsOwnerApproval] = useState(false);

  const refresh = useCallback(async () => setState(await loadCommercialState(leadId)), [leadId]);
  useEffect(() => { void refresh().catch(() => undefined); }, [refresh]);

  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    setMessage(null);
    try {
      await action();
      await onMeaningfulAction?.();
      await refresh();
      await onChanged?.();
      setMessage(success);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  const quote = state.quotation;
  const booking = state.booking;

  return <div className="space-y-4">
    {message && <Notice text={message} />}

    <Card className="p-4 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 font-semibold"><ClipboardCheck className="h-4 w-4" />Canonical quotation</div>
          {quote ? <div className="mt-2 text-sm">
            <div className="font-semibold">₹{Number(quote.amount ?? 0).toLocaleString("en-IN")} · {quote.property_name || "Property pending"}</div>
            <div className="text-xs text-muted-foreground mt-1">{quote.status} · expires {new Date(quote.expires_at).toLocaleString()}</div>
          </div> : <p className="mt-1 text-sm text-muted-foreground">No quotation exists for this customer.</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          {!quote && <Button disabled={!canAct || busy} onClick={() => setQuoteOpen(true)}>Create quotation</Button>}
          {quote && <>
            <Button variant="outline" disabled={!canAct || busy} onClick={() => void run(() => markQuotationEvent(quote.id, "copied"), "Quotation copied")}>Copy</Button>
            <Button variant="outline" disabled={!canAct || busy} onClick={() => void run(() => markQuotationEvent(quote.id, "sent"), "Quotation sent")}>Mark sent</Button>
            <Button disabled={!canAct || busy} onClick={() => void run(() => markQuotationEvent(quote.id, "accepted"), "Quotation accepted; payment is the next commercial gate")}>Accepted</Button>
          </>}
        </div>
      </div>

      {quoteOpen && <div className="grid gap-3 border-t pt-4 md:grid-cols-2">
        <Input value={propertyName} onChange={(e) => setPropertyName(e.target.value)} placeholder="Property" />
        <Input value={roomLabel} onChange={(e) => setRoomLabel(e.target.value)} placeholder="Room / sharing" />
        <Input type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Quote amount" />
        <Input type="number" min="0" value={deposit} onChange={(e) => setDeposit(e.target.value)} placeholder="Deposit" />
        <Input type="number" min="0" value={maintenance} onChange={(e) => setMaintenance(e.target.value)} placeholder="Maintenance" />
        <Input type="number" min="0" value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="Discount" />
        <label className="text-xs space-y-1"><span>Quote expiry</span><Input type="datetime-local" value={expiry} onChange={(e) => setExpiry(e.target.value)} /></label>
        <div className="flex items-end gap-2">
          <Button disabled={busy || !amount || Number(amount) <= 0 || !expiry} onClick={() => void run(async () => {
            await saveQuotation({
              leadId,
              propertyName: propertyName || undefined,
              roomLabel: roomLabel || undefined,
              amount: Number(amount),
              depositAmount: deposit ? Number(deposit) : undefined,
              maintenanceAmount: maintenance ? Number(maintenance) : undefined,
              discount: discount ? Number(discount) : 0,
              expiresAt: new Date(expiry).toISOString(),
            });
            setQuoteOpen(false);
          }, "Quotation saved in the canonical customer chain")}>Save quotation</Button>
          <Button variant="ghost" onClick={() => setQuoteOpen(false)}>Cancel</Button>
        </div>
      </div>}
    </Card>

    <Card className="p-4 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 font-semibold"><IndianRupee className="h-4 w-4" />Payment / booking</div>
          {booking ? <div className="mt-2 text-sm">
            <div className="font-semibold">Payment ref {booking.payment_ref || "—"}</div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Badge variant={booking.payment_verified ? "secondary" : "destructive"}>{booking.payment_verified ? "Payment verified" : "Payment unverified"}</Badge>
              <Badge variant={booking.owner_approval_required && !booking.owner_approved ? "destructive" : "outline"}>{booking.owner_approval_required ? (booking.owner_approved ? "Owner approved" : "Owner approval pending") : "Owner approval not required"}</Badge>
              <Badge variant="outline">{booking.status}</Badge>
            </div>
          </div> : <p className="mt-1 text-sm text-muted-foreground">Payment evidence is separate from booking truth. Recording a UTR never auto-checks-in a customer.</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          {!booking && <Button disabled={!canAct || busy} onClick={() => setPaymentOpen(true)}>Record payment</Button>}
          {booking && !booking.payment_verified && <Button disabled={!canAct || busy} onClick={() => void run(() => verifyPayment(booking.id), "Payment verified")}>Verify payment</Button>}
          {booking && !booking.owner_approval_required && <Button variant="outline" disabled={!canAct || busy} onClick={() => void run(() => requestOwnerApproval(booking.id), "Owner approval requested")}>Request owner approval</Button>}
          {booking?.owner_approval_required && !booking.owner_approved && <Button variant="outline" disabled={!canAct || busy} onClick={() => void run(() => approveOwner(booking.id), "Owner approval completed")}>Mark owner approved</Button>}
        </div>
      </div>

      {paymentOpen && <div className="grid gap-3 border-t pt-4 md:grid-cols-2">
        <Input type="number" min="0" value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} placeholder="Payment amount" />
        <Input value={paymentRef} onChange={(e) => setPaymentRef(e.target.value)} placeholder="Payment reference / UTR" />
        <Textarea className="md:col-span-2" value={paymentEvidence} onChange={(e) => setPaymentEvidence(e.target.value)} placeholder="Evidence URL / payment note" />
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={needsOwnerApproval} onChange={(e) => setNeedsOwnerApproval(e.target.checked)} />Owner approval required</label>
        <div className="flex gap-2">
          <Button disabled={busy || !paymentRef.trim() || !paymentAmount || Number(paymentAmount) <= 0} onClick={() => void run(async () => {
            await recordPayment({
              leadId,
              quotationId: quote?.id,
              propertyName: quote?.property_name,
              propertyId: quote?.property_id,
              roomLabel: quote?.room_label,
              roomId: quote?.room_id,
              amount: Number(paymentAmount),
              paymentRef: paymentRef.trim(),
              paymentEvidence: paymentEvidence.trim() || undefined,
              ownerApprovalRequired: needsOwnerApproval,
            });
            setPaymentOpen(false);
          }, "Payment recorded; verification remains required")}>Record payment</Button>
          <Button variant="ghost" onClick={() => setPaymentOpen(false)}>Cancel</Button>
        </div>
      </div>}
    </Card>
  </div>;
}

export function CanonicalCheckInPanel({
  leadId,
  canAct = true,
  onMeaningfulAction,
  onChanged,
}: {
  leadId: string;
  canAct?: boolean;
  onMeaningfulAction?: () => void | Promise<void>;
  onChanged?: () => void | Promise<void>;
}) {
  const [state, setState] = useState<any>({ quotation: null, booking: null, checkin: null });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [scheduledFor, setScheduledFor] = useState("");
  const [roomLabel, setRoomLabel] = useState("");

  const refresh = useCallback(async () => {
    const next = await loadCommercialState(leadId);
    setState(next);
    if (next.checkin?.room_or_bed_label) setRoomLabel(next.checkin.room_or_bed_label);
  }, [leadId]);
  useEffect(() => { void refresh().catch(() => undefined); }, [refresh]);

  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    setMessage(null);
    try {
      await action();
      await onMeaningfulAction?.();
      await refresh();
      await onChanged?.();
      setMessage(success);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  const booking = state.booking;
  const checkin = state.checkin;
  const roomAllocated = Boolean(checkin?.room_allocated && String(checkin?.room_or_bed_label || "").trim());
  const hardReady = useMemo(() => Boolean(
    booking?.payment_verified &&
    (!booking?.owner_approval_required || booking?.owner_approved) &&
    checkin?.arrived_at &&
    roomAllocated &&
    checkin?.kyc_done &&
    checkin?.agreement_done &&
    checkin?.keys_handed_over
  ), [booking, checkin, roomAllocated]);

  if (!booking) return <Card className="p-5 text-sm text-muted-foreground">No canonical booking/payment exists. Record and verify payment first.</Card>;

  return <div className="space-y-4">
    {message && <Notice text={message} />}

    {!checkin ? <Card className="p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 font-semibold"><KeyRound className="h-4 w-4" />Prepare physical check-in</div>
          <p className="mt-1 text-sm text-muted-foreground">Creates the readiness checklist. It does not mark the customer checked in.</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs space-y-1"><span>Scheduled check-in</span><Input className="w-56" type="datetime-local" value={scheduledFor} onChange={(e) => setScheduledFor(e.target.value)} /></label>
          <Button disabled={!canAct || busy || !booking.payment_verified || (booking.owner_approval_required && !booking.owner_approved)} onClick={() => void run(() => ensureCheckIn({ leadId, bookingId: booking.id, scheduledFor: scheduledFor ? new Date(scheduledFor).toISOString() : undefined }), "Check-in checklist started")}>Prepare check-in</Button>
        </div>
      </div>
    </Card> : <>
      <Card className="p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 font-semibold"><ShieldCheck className="h-4 w-4" />Hard check-in gates</div>
            <p className="mt-1 text-sm text-muted-foreground">UI and server use the same gates. No generic CRM disposition can bypass this.</p>
          </div>
          <Badge variant={hardReady ? "secondary" : "destructive"}>{checkin.status === "checked_in" ? "CHECKED IN" : hardReady ? "READY TO CONFIRM" : "BLOCKED"}</Badge>
        </div>

        <div className="grid gap-2 md:grid-cols-2">
          <Gate label="Payment verified" checked={Boolean(booking.payment_verified)} locked />
          <Gate label="Owner approval" checked={!booking.owner_approval_required || Boolean(booking.owner_approved)} locked />
          <Gate label="Physical arrival confirmed" checked={Boolean(checkin.arrived_at)} disabled={!canAct || busy} onClick={() => void run(() => updateCheckInGates(checkin.id, { arrivedAt: checkin.arrived_at ? null : new Date().toISOString() }), "Arrival evidence updated")} />
          <Gate label="KYC completed" checked={Boolean(checkin.kyc_done)} disabled={!canAct || busy} onClick={() => void run(() => updateCheckInGates(checkin.id, { kycDone: !checkin.kyc_done }), "KYC gate updated")} />
          <Gate label="Agreement completed" checked={Boolean(checkin.agreement_done)} disabled={!canAct || busy} onClick={() => void run(() => updateCheckInGates(checkin.id, { agreementDone: !checkin.agreement_done }), "Agreement gate updated")} />
          <Gate label="Keys / room handed over" checked={Boolean(checkin.keys_handed_over)} disabled={!canAct || busy} onClick={() => void run(() => updateCheckInGates(checkin.id, { keysHandedOver: !checkin.keys_handed_over }), "Key handover updated")} />
        </div>

        <div className="rounded-lg border p-3">
          <div className="text-xs font-semibold">Room / bed allocation *</div>
          <div className="mt-2 flex flex-wrap gap-2">
            <Input className="min-w-64 flex-1" value={roomLabel} onChange={(e) => setRoomLabel(e.target.value)} placeholder="Example: Room 402 · Bed B" />
            <Button variant="outline" disabled={!canAct || busy || !roomLabel.trim()} onClick={() => void run(() => updateCheckInGates(checkin.id, { roomAllocated: true, roomOrBedLabel: roomLabel.trim() }), "Room / bed allocation saved")}>Save allocation</Button>
            {checkin.room_allocated && <Button variant="ghost" disabled={!canAct || busy} onClick={() => void run(() => updateCheckInGates(checkin.id, { roomAllocated: false, roomOrBedLabel: "" }), "Room allocation cleared")}>Clear</Button>}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">Current: {checkin.room_or_bed_label || "not allocated"}</div>
        </div>
      </Card>

      <Card className="flex flex-wrap items-center justify-between gap-3 p-5">
        <div>
          <div className="flex items-center gap-2 font-semibold"><CheckCircle2 className="h-4 w-4" />Final physical check-in</div>
          <p className="mt-1 text-sm text-muted-foreground">The server re-validates payment, approval, arrival, room/bed, KYC, agreement and keys before writing CHECKED_IN.</p>
        </div>
        <Button disabled={!canAct || busy || !hardReady || checkin.status === "checked_in"} onClick={() => void run(() => confirmCheckIn(checkin.id), "Customer physically checked in; open sales actions closed")}>{checkin.status === "checked_in" ? "Checked in" : "Confirm check-in"}</Button>
      </Card>
    </>}
  </div>;
}

function Notice({ text }: { text: string }) {
  const bad = /fail|error|required|pending|blocked|not found|incomplete/i.test(text);
  return <div className={`rounded-lg border px-3 py-2 text-sm ${bad ? "border-amber-300 bg-amber-50 text-amber-950 dark:bg-amber-950/30 dark:text-amber-100" : "border-emerald-300 bg-emerald-50 text-emerald-950 dark:bg-emerald-950/30 dark:text-emerald-100"}`}>{text}</div>;
}

function Gate({ label, checked, onClick, locked, disabled }: { label: string; checked: boolean; onClick?: () => void; locked?: boolean; disabled?: boolean }) {
  return <button type="button" disabled={locked || disabled || !onClick} onClick={onClick} className={`flex items-center justify-between rounded-lg border p-3 text-left text-sm ${checked ? "border-emerald-300 bg-emerald-50 dark:bg-emerald-950/20" : "border-amber-300 bg-amber-50 dark:bg-amber-950/20"} ${(locked || disabled || !onClick) ? "cursor-default opacity-90" : "hover:brightness-[0.98]"}`}>
    <span className="font-medium">{label}</span>
    <span className={`flex h-5 w-5 items-center justify-center rounded-full border text-xs ${checked ? "border-emerald-600 bg-emerald-600 text-white" : "border-amber-500 bg-background"}`}>{checked ? "✓" : ""}</span>
  </button>;
}
