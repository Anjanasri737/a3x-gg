import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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

export function QuoteBookingPanel({ leadId, canAct = true, onChanged }: { leadId: string; canAct?: boolean; onChanged?: () => void | Promise<void> }) {
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
  useEffect(() => { refresh().catch(() => undefined); }, [refresh]);

  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true); setMessage(null);
    try {
      await action();
      setMessage(success);
      await refresh();
      await onChanged?.();
    } catch (e) { setMessage(e instanceof Error ? e.message : "Action failed"); }
    finally { setBusy(false); }
  }

  const quote = state.quotation;
  const booking = state.booking;

  return (
    <div className="space-y-4">
      {message && <div className={`rounded-lg border px-3 py-2 text-sm ${/fail|pending|incomplete|not /i.test(message) ? "border-amber-300 bg-amber-50 text-amber-900" : "border-emerald-300 bg-emerald-50 text-emerald-900"}`}>{message}</div>}

      <Card className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 font-semibold"><ClipboardCheck className="h-4 w-4" />Quotation</div>
            {quote ? (
              <div className="mt-2 text-sm">
                <div className="font-semibold">₹{Number(quote.amount ?? 0).toLocaleString("en-IN")} · {quote.property_name || "Property not set"}</div>
                <div className="mt-1 text-xs text-muted-foreground">Status {quote.status} · Expires {new Date(quote.expires_at).toLocaleString()}</div>
              </div>
            ) : <div className="mt-1 text-sm text-muted-foreground">No canonical quotation yet.</div>}
          </div>
          <div className="flex flex-wrap gap-2">
            {!quote && <Button disabled={!canAct || busy} onClick={() => setQuoteOpen(true)}>Create quotation</Button>}
            {quote && <>
              <Button variant="outline" disabled={!canAct || busy} onClick={() => run(() => markQuotationEvent(quote.id, "copied"), "Quotation copied")}>Copy</Button>
              <Button variant="outline" disabled={!canAct || busy} onClick={() => run(() => markQuotationEvent(quote.id, "sent"), "Quotation sent")}>Mark sent</Button>
              <Button disabled={!canAct || busy} onClick={() => run(() => markQuotationEvent(quote.id, "accepted"), "Quotation accepted; move to booking intent")}>Accepted</Button>
            </>}
          </div>
        </div>

        {quoteOpen && (
          <div className="mt-4 grid gap-3 border-t border-border pt-4 md:grid-cols-2">
            <Input value={propertyName} onChange={(e) => setPropertyName(e.target.value)} placeholder="Property" />
            <Input value={roomLabel} onChange={(e) => setRoomLabel(e.target.value)} placeholder="Room / sharing" />
            <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Rent / quote amount" />
            <Input type="number" value={deposit} onChange={(e) => setDeposit(e.target.value)} placeholder="Deposit" />
            <Input type="number" value={maintenance} onChange={(e) => setMaintenance(e.target.value)} placeholder="Maintenance" />
            <Input type="number" value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="Discount" />
            <Input type="datetime-local" value={expiry} onChange={(e) => setExpiry(e.target.value)} aria-label="Quote expiry" />
            <div className="flex gap-2">
              <Button disabled={busy || !amount || !expiry} onClick={() => run(async () => {
                await saveQuotation({
                  leadId, propertyName: propertyName || undefined, roomLabel: roomLabel || undefined,
                  amount: Number(amount), depositAmount: deposit ? Number(deposit) : undefined,
                  maintenanceAmount: maintenance ? Number(maintenance) : undefined,
                  discount: discount ? Number(discount) : 0,
                  expiresAt: new Date(expiry).toISOString(),
                });
                setQuoteOpen(false);
              }, "Quotation saved")}>Save quotation</Button>
              <Button variant="ghost" onClick={() => setQuoteOpen(false)}>Cancel</Button>
            </div>
          </div>
        )}
      </Card>

      <Card className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 font-semibold"><IndianRupee className="h-4 w-4" />Booking / payment</div>
            {booking ? (
              <div className="mt-2 text-sm">
                <div className="font-semibold">Payment ref {booking.payment_ref || "—"}</div>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  <Badge variant={booking.payment_verified ? "outline" : "destructive"}>{booking.payment_verified ? "Payment verified" : "Payment unverified"}</Badge>
                  <Badge variant="outline">{booking.owner_approval_required ? (booking.owner_approved ? "Owner approved" : "Owner approval pending") : "Owner approval not required"}</Badge>
                  <Badge variant="outline">{booking.status}</Badge>
                </div>
              </div>
            ) : <div className="mt-1 text-sm text-muted-foreground">No payment recorded. Recording a payment does not automatically mean check-in ready.</div>}
          </div>
          <div className="flex flex-wrap gap-2">
            {!booking && <Button disabled={!canAct || busy} onClick={() => setPaymentOpen(true)}>Record payment</Button>}
            {booking && !booking.payment_verified && <Button disabled={!canAct || busy} onClick={() => run(() => verifyPayment(booking.id), "Payment verified")}>Verify payment</Button>}
            {booking && !booking.owner_approval_required && <Button variant="outline" disabled={!canAct || busy} onClick={() => run(() => requestOwnerApproval(booking.id), "Owner approval requested")}>Request owner approval</Button>}
            {booking?.owner_approval_required && !booking.owner_approved && <Button variant="outline" disabled={!canAct || busy} onClick={() => run(() => approveOwner(booking.id), "Owner approval completed")}>Mark owner approved</Button>}
          </div>
        </div>

        {paymentOpen && (
          <div className="mt-4 grid gap-3 border-t border-border pt-4 md:grid-cols-2">
            <Input type="number" value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} placeholder="Payment amount" />
            <Input value={paymentRef} onChange={(e) => setPaymentRef(e.target.value)} placeholder="Payment reference / UTR" />
            <Input className="md:col-span-2" value={paymentEvidence} onChange={(e) => setPaymentEvidence(e.target.value)} placeholder="Evidence URL / note" />
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={needsOwnerApproval} onChange={(e) => setNeedsOwnerApproval(e.target.checked)} />Owner approval required</label>
            <div className="flex gap-2">
              <Button disabled={busy || !paymentAmount || !paymentRef} onClick={() => run(async () => {
                await recordPayment({
                  leadId,
                  quotationId: quote?.id,
                  propertyName: quote?.property_name,
                  roomLabel: quote?.room_label,
                  amount: Number(paymentAmount),
                  paymentRef,
                  paymentEvidence: paymentEvidence || undefined,
                  ownerApprovalRequired: needsOwnerApproval,
                });
                setPaymentOpen(false);
              }, "Payment recorded. Verification is still required.")}>Record payment</Button>
              <Button variant="ghost" onClick={() => setPaymentOpen(false)}>Cancel</Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

export function CheckInPanel({ leadId, canAct = true, onChanged }: { leadId: string; canAct?: boolean; onChanged?: () => void | Promise<void> }) {
  const [state, setState] = useState<any>({ quotation: null, booking: null, checkin: null });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [scheduledFor, setScheduledFor] = useState("");
  const [roomLabel, setRoomLabel] = useState("");

  const refresh = useCallback(async () => setState(await loadCommercialState(leadId)), [leadId]);
  useEffect(() => { refresh().catch(() => undefined); }, [refresh]);

  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true); setMessage(null);
    try { await action(); setMessage(success); await refresh(); await onChanged?.(); }
    catch (e) { setMessage(e instanceof Error ? e.message : "Action failed"); }
    finally { setBusy(false); }
  }

  const booking = state.booking;
  const checkin = state.checkin;
  const hardReady = useMemo(() => Boolean(
    booking?.payment_verified &&
    (!booking?.owner_approval_required || booking?.owner_approved) &&
    checkin?.room_allocated && checkin?.kyc_done && checkin?.agreement_done && checkin?.keys_handed_over
  ), [booking, checkin]);

  if (!booking) return <Card className="p-5 text-sm text-muted-foreground">No booking/payment chain exists yet. Record and verify payment first.</Card>;

  return (
    <div className="space-y-4">
      {message && <div className={`rounded-lg border px-3 py-2 text-sm ${/pending|incomplete|not /i.test(message) ? "border-amber-300 bg-amber-50 text-amber-900" : "border-emerald-300 bg-emerald-50 text-emerald-900"}`}>{message}</div>}

      {!checkin ? (
        <Card className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><div className="flex items-center gap-2 font-semibold"><KeyRound className="h-4 w-4" />Create check-in readiness record</div><div className="mt-1 text-sm text-muted-foreground">This does not complete check-in. It starts the gate checklist.</div></div>
            <div className="flex flex-wrap gap-2">
              <Input className="w-56" type="datetime-local" value={scheduledFor} onChange={(e) => setScheduledFor(e.target.value)} aria-label="Scheduled check-in" />
              <Button disabled={!canAct || busy} onClick={() => run(() => ensureCheckIn({ leadId, bookingId: booking.id, scheduledFor: scheduledFor ? new Date(scheduledFor).toISOString() : undefined }), "Check-in readiness created")}>Prepare check-in</Button>
            </div>
          </div>
        </Card>
      ) : (
        <>
          <Card className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 font-semibold"><ShieldCheck className="h-4 w-4" />Check-in gates</div>
                <div className="mt-1 text-sm text-muted-foreground">Final action remains blocked until every configured gate passes.</div>
              </div>
              <Badge variant={hardReady ? "outline" : "destructive"}>{hardReady ? "Ready to check in" : "Blocked"}</Badge>
            </div>

            <div className="mt-4 grid gap-2 md:grid-cols-2">
              <Gate label="Payment verified" checked={Boolean(booking.payment_verified)} locked />
              <Gate label="Owner approval" checked={!booking.owner_approval_required || Boolean(booking.owner_approved)} locked />
              <Gate label="Arrived" checked={Boolean(checkin.arrived_at)} onChange={() => canAct && run(() => updateCheckInGates(checkin.id, { arrivedAt: checkin.arrived_at ? null : new Date().toISOString() }), "Arrival updated")} />
              <Gate label="Room / bed allocated" checked={Boolean(checkin.room_allocated)} onChange={() => canAct && run(() => updateCheckInGates(checkin.id, { roomAllocated: !checkin.room_allocated, roomOrBedLabel: roomLabel || checkin.room_or_bed_label || undefined }), "Room allocation updated")} />
              <Gate label="KYC done" checked={Boolean(checkin.kyc_done)} onChange={() => canAct && run(() => updateCheckInGates(checkin.id, { kycDone: !checkin.kyc_done }), "KYC updated")} />
              <Gate label="Agreement done" checked={Boolean(checkin.agreement_done)} onChange={() => canAct && run(() => updateCheckInGates(checkin.id, { agreementDone: !checkin.agreement_done }), "Agreement updated")} />
              <Gate label="Keys handed over" checked={Boolean(checkin.keys_handed_over)} onChange={() => canAct && run(() => updateCheckInGates(checkin.id, { keysHandedOver: !checkin.keys_handed_over }), "Key handover updated")} />
              <div className="rounded-lg border border-border p-3"><div className="text-xs font-semibold">Room / bed label</div><Input className="mt-2" value={roomLabel} onChange={(e) => setRoomLabel(e.target.value)} placeholder={checkin.room_or_bed_label || "Room / bed"} /></div>
            </div>
          </Card>

          <Card className="flex flex-wrap items-center justify-between gap-3 p-5">
            <div>
              <div className="flex items-center gap-2 font-semibold"><CheckCircle2 className="h-4 w-4" />Final check-in</div>
              <div className="mt-1 text-sm text-muted-foreground">Server re-validates payment, owner approval, room, KYC, agreement and keys. The UI cannot bypass the gate.</div>
            </div>
            <Button disabled={!canAct || busy || !hardReady || checkin.status === "checked_in"} onClick={() => run(() => confirmCheckIn(checkin.id), "Customer checked in. Sales actions closed.")}>{checkin.status === "checked_in" ? "Checked in" : "Confirm check-in"}</Button>
          </Card>
        </>
      )}
    </div>
  );
}

function Gate({ label, checked, onChange, locked }: { label: string; checked: boolean; onChange?: () => void; locked?: boolean }) {
  return (
    <button type="button" disabled={locked || !onChange} onClick={onChange} className={`flex items-center justify-between rounded-lg border p-3 text-left text-sm ${checked ? "border-emerald-300 bg-emerald-50" : "border-amber-200 bg-amber-50"} ${locked ? "cursor-default" : "hover:brightness-[0.98]"}`}>
      <span className="font-medium">{label}</span>
      <span className={`flex h-5 w-5 items-center justify-center rounded-full border ${checked ? "border-emerald-600 bg-emerald-600 text-white" : "border-amber-400 bg-white"}`}>{checked ? "✓" : ""}</span>
    </button>
  );
}
