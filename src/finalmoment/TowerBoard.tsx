// Control tower board — built entirely from Final Moment round data + movement events.
import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { useMovement } from "@/movement/store";
import { OPERATORS } from "@/movement/types";
import { roundPace, useFinalMoment } from "./store";
import { useBridge } from "./bridge";

const DAILY_CONNECT_TARGET = 70;
const startOfDay = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return +d;
};
const fmtClock = (secs: number) => {
  const s = Math.max(0, Math.round(secs));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

function useTick(ms = 5000) {
  const [, set] = useState(0);
  useEffect(() => {
    const id = setInterval(() => set((n) => n + 1), ms);
    return () => clearInterval(id);
  }, [ms]);
}

function Stat({ label, value, sub, tone }: { label: string; value: string | number; sub?: string; tone?: "bad" | "good" }) {
  return (
    <div className="rounded-lg border p-3">
      <div className={cn("text-2xl font-bold", tone === "bad" && "text-destructive")}>{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      {sub && <div className="pt-1 text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

export function TowerBoard({ compact = false }: { compact?: boolean }) {
  useTick();
  const mv = useMovement();
  const fm = useFinalMoment();
  const bridge = useBridge();

  const day = startOfDay();
  const roundsToday = useMemo(
    () => fm.rounds.filter((r) => +new Date(r.startedAt) >= day),
    [fm.rounds, day],
  );

  const totals = useMemo(() => {
    const t = { marked: 0, done: 0, calls: 0, connected: 0, texts: 0, tours: 0, quotes: 0, bookings: 0, closed: 0, mins: 0 };
    for (const r of roundsToday) {
      t.marked += r.ulids.length;
      t.done += (r.done ?? []).length;
      t.calls += r.calls;
      t.connected += r.connected;
      t.texts += r.texts;
      t.tours += r.tours;
      t.quotes += r.quotes;
      t.bookings += r.bookings;
      t.closed += r.closed;
      t.mins += roundPace(r).elapsedMins;
    }
    return t;
  }, [roundsToday]);

  const perMinute = totals.mins > 0 ? totals.done / totals.mins : 0;
  const states = Object.values(mv.states);

  const toursToConfirm = states.filter((s) => s.stage === "tour-scheduled" && !s.tourConfirmed);
  const paymentsToCollect = states.filter(
    (s) => s.paymentExpected || s.nextAction?.kind === "collect-payment" || s.stage === "payment",
  );

  const connectedToday = mv.events.filter(
    (e) => e.kind === "call-result" && e.to === "connected" && +new Date(e.ts) >= day,
  );

  const operators = useMemo(() => {
    const hour = new Date().getHours();
    const workedHours = Math.max(1, Math.min(10, hour - 9));
    const expected = Math.round((DAILY_CONNECT_TARGET / 10) * workedHours);
    return OPERATORS.map((o) => {
      const conn = connectedToday.filter((e) => e.actorId === o.id).length;
      const calls = mv.events.filter(
        (e) => e.kind === "call-started" && e.actorId === o.id && +new Date(e.ts) >= day,
      ).length;
      return { ...o, conn, calls, expected, behind: conn < expected };
    }).sort((a, b) => a.conn - b.conn);
  }, [connectedToday, mv.events, day]);

  const behind = operators.filter((o) => o.behind);
  const activePace = fm.activeRoundId
    ? roundPace(fm.rounds.find((r) => r.id === fm.activeRoundId)!)
    : null;

  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="rounds today" value={roundsToday.length} sub={`${totals.done}/${totals.marked} chats cleared`} />
        <Stat label="leads / minute" value={perMinute.toFixed(2)} sub={`${Math.round(totals.mins)} min on the desk`} />
        <Stat
          label="connected today"
          value={`${connectedToday.length}/${DAILY_CONNECT_TARGET}`}
          tone={connectedToday.length < DAILY_CONNECT_TARGET ? "bad" : "good"}
          sub={`${totals.calls} calls dialled`}
        />
        <Stat label="tours to confirm" value={toursToConfirm.length} tone={toursToConfirm.length ? "bad" : "good"} />
        <Stat label="payments to collect" value={paymentsToCollect.length} tone={paymentsToCollect.length ? "bad" : "good"} />
        <Stat
          label="operators behind pace"
          value={behind.length}
          tone={behind.length ? "bad" : "good"}
          sub={`${mv.unmatched.length} unmatched chats`}
        />
      </div>

      {activePace && (
        <div className="rounded-lg border p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-semibold">Round in progress</span>
            <Badge variant={activePace.delta < 0 ? "destructive" : "default"}>
              {activePace.delta < 0 ? `${Math.abs(activePace.delta)} behind` : `${activePace.delta} ahead`}
            </Badge>
          </div>
          <Progress className="mt-2" value={(activePace.doneCount / Math.max(1, activePace.totalCount)) * 100} />
          <div className="pt-1 text-[11px] text-muted-foreground">
            {activePace.doneCount}/{activePace.totalCount} done ·{" "}
            {activePace.remainingSecs < 0 ? `over by ${fmtClock(-activePace.remainingSecs)}` : `${fmtClock(activePace.remainingSecs)} left`} ·{" "}
            {activePace.perMinute.toFixed(2)}/min
          </div>
        </div>
      )}

      {!compact && (
        <>
          <div className="rounded-lg border p-3">
            <div className="pb-2 text-sm font-semibold">Rounds today</div>
            <ul className="space-y-1 text-xs">
              {roundsToday.map((r) => {
                const p = roundPace(r);
                return (
                  <li key={r.id} className="flex flex-wrap items-center gap-2 rounded-md border p-2">
                    <Badge variant={r.endedAt ? "secondary" : "default"}>{r.id}</Badge>
                    <span>
                      {(r.done ?? []).length}/{r.ulids.length} in {r.workMins ?? 90}m
                    </span>
                    <span className="text-muted-foreground">
                      {p.perMinute.toFixed(2)}/min · marked in {fmtClock(r.markSecs ?? 0)} · {r.connected} connected ·{" "}
                      {r.tours} tours · {r.quotes} quotes · {r.bookings} booked · {r.closed} definite
                    </span>
                    <Badge variant={p.delta < 0 ? "destructive" : "secondary"} className="ml-auto">
                      {p.delta < 0 ? `${Math.abs(p.delta)} behind` : `${p.delta} ahead`}
                    </Badge>
                  </li>
                );
              })}
              {!roundsToday.length && (
                <li className="text-muted-foreground">
                  No rounds yet today —{" "}
                  <Link to="/final-moment" className="underline">
                    start D1 in Final Moment
                  </Link>
                  .
                </li>
              )}
            </ul>
          </div>

          <div className="grid gap-3 lg:grid-cols-3">
            <div className="rounded-lg border p-3">
              <div className="pb-2 text-sm font-semibold">Tours to confirm</div>
              <ul className="max-h-56 space-y-1 overflow-auto text-xs">
                {toursToConfirm.slice(0, 20).map((s) => (
                  <li key={s.ulid} className="flex items-center justify-between gap-2 rounded-md border p-2">
                    <span className="truncate">
                      {s.name ?? "Unknown"} · {s.tourProperty ?? "—"}
                    </span>
                    <Button size="sm" variant="outline" onClick={() => mv.confirmTour(s.ulid)}>
                      Confirm
                    </Button>
                  </li>
                ))}
                {!toursToConfirm.length && <li className="text-muted-foreground">All tours confirmed.</li>}
              </ul>
            </div>

            <div className="rounded-lg border p-3">
              <div className="pb-2 text-sm font-semibold">Payments to collect</div>
              <ul className="max-h-56 space-y-1 overflow-auto text-xs">
                {paymentsToCollect.slice(0, 20).map((s) => (
                  <li key={s.ulid} className="flex items-center justify-between gap-2 rounded-md border p-2">
                    <span className="truncate">
                      {s.name ?? "Unknown"} · {s.stage}
                    </span>
                    <Button size="sm" variant="outline" onClick={() => mv.collectPayment(s.ulid)}>
                      Collected
                    </Button>
                  </li>
                ))}
                {!paymentsToCollect.length && <li className="text-muted-foreground">Nothing pending.</li>}
              </ul>
            </div>

            <div className="rounded-lg border p-3">
              <div className="pb-2 text-sm font-semibold">Operators vs pace</div>
              <ul className="space-y-1 text-xs">
                {operators.map((o) => (
                  <li key={o.id} className="flex items-center justify-between gap-2 rounded-md border p-2">
                    <span className="truncate">{o.name}</span>
                    <span className="text-muted-foreground">
                      {o.conn}/{o.expected} connected · {o.calls} calls
                    </span>
                    <Badge variant={o.behind ? "destructive" : "secondary"}>{o.behind ? "behind" : "on pace"}</Badge>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="rounded-lg border p-3 text-xs text-muted-foreground">
            WhatsApp bridge: {bridge.matched} matched · {bridge.shadows} shadow leads created ·{" "}
            {mv.unmatched.length} unmatched conversations still to identify.
          </div>
        </>
      )}
    </div>
  );
}
