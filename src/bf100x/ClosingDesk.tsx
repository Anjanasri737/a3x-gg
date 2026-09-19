// Closing board, inside the flow. Everyone past the tour, with the money on the
// screen and the closing actions one click away.
import { useMemo, useState } from "react";
import { IndianRupee, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { health, fmtMins } from "@/bookingflow/engine";
import { useBookingFlow } from "@/bookingflow/store";
import { useHydrated } from "@/bookingflow/useHydrated";

type Tab = "CLOSING" | "BOOKED" | "MONEY_PENDING" | "CHECKIN";

const TABS: { key: Tab; label: string }[] = [
  { key: "CLOSING", label: "Quote & decision" },
  { key: "BOOKED", label: "Booking & approval" },
  { key: "MONEY_PENDING", label: "Money pending" },
  { key: "CHECKIN", label: "Check-in" },
];

const money = (v?: string) => (v ? `₹${Number(v).toLocaleString("en-IN")}` : "—");

export function ClosingDesk({ onOpenLead }: { onOpenLead: (id: string) => void }) {
  const { leads, answerStep, editFields, setNext } = useBookingFlow();
  const hydrated = useHydrated();
  const [tab, setTab] = useState<Tab>("CLOSING");
  const [amount, setAmount] = useState<Record<string, string>>({});

  const rows = useMemo(() => {
    if (!hydrated) return [];
    return leads
      .map((l) => ({ l, h: health(l), f: l.f ?? {} }))
      .filter(({ f, h }) => {
        if (h.closed) return false;
        switch (tab) {
          case "CLOSING": return Boolean(f["tourFeedback"]) && !f["bookingAmount"];
          case "BOOKED": return Boolean(f["bookingAmount"]) && f["approval"] !== "APPROVED";
          case "MONEY_PENDING": return f["payment"] === "PENDING" || f["payment"] === "PARTIAL" || (Boolean(f["approval"]) && !f["payment"]);
          case "CHECKIN": return Boolean(f["reserved"]) && f["checkinDay"] !== "CHECKED_IN";
          default: return true;
        }
      })
      .sort((a, b) => b.h.signals.length - a.h.signals.length);
  }, [leads, tab, hydrated]);

  const pot = rows.reduce((sum, { f }) => sum + Number(f["rent"] ?? 0), 0);

  function collect(id: string, f: Record<string, string>) {
    const amt = amount[id];
    if (!amt) { toast.error("Type the amount received first"); return; }
    const payload = { payment: "RECEIVED", paymentAmount: amt, paymentMode: "Gharpayy UPI" };
    if (f["payment"]) editFields(id, payload, "payment updated on the closing desk");
    else answerStep(id, "PAYMENT", payload);
    setNext(id, "Prepare check-in", new Date(Date.now() + 24 * 3_600_000).toISOString());
    toast.success(`₹${Number(amt).toLocaleString("en-IN")} recorded`);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {TABS.map((t) => (
          <Button key={t.key} size="sm" variant={tab === t.key ? "default" : "outline"} className="h-7 px-2 text-[11px]" onClick={() => setTab(t.key)}>{t.label}</Button>
        ))}
        <Badge variant="outline" className="ml-auto text-[10px]"><IndianRupee className="mr-1 h-3 w-3" />{rows.length} customers · {money(String(pot || ""))} monthly rent on the table</Badge>
      </div>

      {rows.map(({ l, h, f }) => (
        <Card key={l.id} className="p-3">
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="text-sm font-medium underline-offset-2 hover:underline" onClick={() => onOpenLead(l.id)}>{l.name}</button>
            <span className="text-xs text-muted-foreground">{l.phone}</span>
            <Badge variant="secondary" className="text-[10px]">{l.owner ?? "no owner"}</Badge>
            <Badge variant="outline" className="text-[10px]">{h.stepNo}. {h.step?.title ?? "Checked in"}</Badge>
            {h.sla === "LATE" && <Badge variant="destructive" className="text-[10px]">late {fmtMins(h.minutesLate)}</Badge>}
            {h.toTower && <Badge variant="destructive" className="text-[10px]"><ShieldAlert className="mr-1 h-3 w-3" />tower</Badge>}
          </div>
          <div className="mt-1 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
            <span>Property: {f["property"] || "—"}</span>
            <span>Rent: {money(f["rent"])}</span>
            <span>Deposit: {money(f["deposit"])}</span>
            <span>Booking: {money(f["bookingAmount"])}</span>
            <span>Received: {money(f["paymentAmount"])}</span>
            <span>Decision: {f["decision"] || "—"}</span>
            <span>Approval: {f["approval"] || "—"}</span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {tab === "MONEY_PENDING" && (
              <>
                <Input className="h-7 w-28 text-xs" type="number" placeholder="Amount" value={amount[l.id] ?? ""} onChange={(e) => setAmount((s) => ({ ...s, [l.id]: e.target.value }))} />
                <Button size="sm" className="h-7 px-2 text-[11px]" onClick={() => collect(l.id, f)}>Money received</Button>
              </>
            )}
            <Button size="sm" variant="outline" className="h-7 px-2 text-[11px]"
              onClick={() => { setNext(l.id, "Follow up on decision", new Date(Date.now() + 3_600_000).toISOString()); toast.success("Follow-up set for the next hour"); }}>
              Chase in 1 hour
            </Button>
            <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]" onClick={() => onOpenLead(l.id)}>Open the customer</Button>
          </div>
        </Card>
      ))}

      {hydrated && rows.length === 0 && (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          Nobody sits in this part of closing right now. Work the board and they will land here.
        </Card>
      )}
    </div>
  );
}
