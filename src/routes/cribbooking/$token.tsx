import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { fetchCribByToken } from "@/cribbooking/store";
import {
  cribMessage, cribTotals, inr, fmtDate, roomLabel, endDate, dueLabel,
  RENT_CYCLES, type CribBooking,
} from "@/cribbooking/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Copy, MessageSquare, Loader2 } from "lucide-react";

export const Route = createFileRoute("/cribbooking/$token")({
  head: () => ({
    meta: [
      { title: "Your Crib Booking — Gharpayy" },
      { name: "description", content: "Your Gharpayy booking summary: property, room, rent, deposit and agreement terms in one page." },
      { property: "og:title", content: "Your Crib Booking — Gharpayy" },
      { property: "og:description", content: "Property, room, rent, deposit and agreement terms in one page." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CribPublicPage,
});

function CribPublicPage() {
  const { token } = Route.useParams();
  const [row, setRow] = useState<CribBooking | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing">("loading");

  useEffect(() => {
    let alive = true;
    void (async () => {
      const res = await fetchCribByToken(token);
      if (!alive) return;
      if (res.row) {
        setRow(res.row);
        setState("ready");
      } else {
        setState("missing");
      }
    })();
    return () => {
      alive = false;
    };
  }, [token]);

  if (state === "loading") {
    return (
      <Center>
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </Center>
    );
  }

  if (state === "missing" || !row) {
    return (
      <Center>
        <div className="text-center">
          <h1 className="text-lg font-bold">Booking not found</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            This crib link is invalid or has been cancelled. Please ask your Gharpayy manager for a fresh link.
          </p>
        </div>
      </Center>
    );
  }

  const t = cribTotals(row);
  const msg = cribMessage(row, row.token);
  const cycleLabel = RENT_CYCLES.find((c) => c.id === row.rent_cycle)?.label ?? row.rent_cycle;
  const waNumber = `${row.country_code}${row.tenant_phone}`.replace(/[^\d]/g, "");

  return (
    <div className="min-h-screen bg-muted/30 pb-16">
      <div className="mx-auto w-full max-w-2xl px-3 py-5 sm:px-5 sm:py-8">
        <header className="rounded-xl border bg-card p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Gharpayy booking</p>
              <h1 className="mt-1 text-xl font-bold tracking-tight sm:text-2xl">{row.tenant_name}</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {row.country_code} {row.tenant_phone}
              </p>
            </div>
            <Badge variant={row.status === "cancelled" ? "destructive" : row.status === "signed" ? "default" : "secondary"}>
              {row.status}
            </Badge>
          </div>
        </header>

        <Section title="Property">
          <Row label="Property" value={row.property_name || row.property_id} />
          <Row label="Property ID" value={row.property_id} mono />
          <Row label="Room" value={roomLabel(row.room_type_id)} />
        </Section>

        <Section title="Agreement">
          <Row label="Start date" value={fmtDate(row.agreement_start_date)} />
          <Row label="Duration" value={`${row.agreement_duration} months`} />
          <Row label="Ends on" value={fmtDate(endDate(row.agreement_start_date, row.agreement_duration))} />
          <Row label="Lock-in" value={`${row.lock_in_period} months`} />
          <Row label="Notice period" value={`${row.notice_period} month(s)`} />
          <Row label="Rent cycle" value={cycleLabel} />
          <Row label="Rent due" value={dueLabel(row)} />
        </Section>

        <Section title="Money">
          <Row label="Monthly rent" value={inr(row.monthly_rent)} />
          <Row label="Maintenance" value={inr(row.maintenance_amount)} />
          <Row label="Security deposit" value={inr(row.security_deposit)} />
          <Row label={`Payable per cycle (${t.cycleMonths} mo)`} value={inr(t.perCycle)} />
          <div className="mt-2 flex items-center justify-between rounded-lg bg-primary/10 px-3 py-3">
            <span className="text-sm font-semibold">Move-in payable</span>
            <span className="text-lg font-bold">{inr(t.moveIn)}</span>
          </div>
        </Section>

        {row.notes ? (
          <Section title="Notes">
            <p className="whitespace-pre-wrap text-sm text-muted-foreground">{row.notes}</p>
          </Section>
        ) : null}

        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          <Button
            variant="outline"
            onClick={() => {
              void navigator.clipboard.writeText(msg);
              toast.success("Booking summary copied");
            }}
          >
            <Copy className="mr-2 h-4 w-4" /> Copy booking summary
          </Button>
          <Button asChild>
            <a href={`https://wa.me/${waNumber}?text=${encodeURIComponent(msg)}`} target="_blank" rel="noreferrer">
              <MessageSquare className="mr-2 h-4 w-4" /> Send on WhatsApp
            </a>
          </Button>
        </div>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          Questions? Reply on WhatsApp to your Gharpayy manager.
        </p>
      </div>
    </div>
  );
}

function Center({ children }: { children: ReactNode }) {
  return <div className="flex min-h-screen items-center justify-center bg-muted/30 px-6">{children}</div>;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-4 rounded-xl border bg-card p-4 sm:p-5">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>
      <div className="space-y-1">{children}</div>
    </section>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-dashed py-1.5 last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={mono ? "text-right font-mono text-xs font-medium" : "text-right text-sm font-medium"}>{value}</span>
    </div>
  );
}
