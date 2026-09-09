// Final Moment — the 300-second draft round: mark 30 on WhatsApp, sync 30 in CRM, work 30.
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { useMovement } from "@/movement/store";
import { seedMovement } from "@/movement/seed";
import { DRAFT_META, type DraftCode, type MovementState } from "@/movement/types";
import { last4, parseTokens, roundPace, useFinalMoment, type RoundLabel } from "./store";
import { LogActivity } from "./LogActivity";
import { BridgePanel } from "./BridgePanel";
import { ensureStuckChats, ingestMessage } from "./bridge";

const ROUNDS: RoundLabel[] = ["D1", "D2", "D3", "D4"];
const DAILY_CONNECT_TARGET = 70;
const DRAFT_SIZE = 30; // each draft is exactly 30 chats — 30 is the minimum to start

const fmtClock = (secs: number) => {
  const s = Math.max(0, secs);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

const ago = (iso?: string | null) => {
  if (!iso) return "—";
  const m = Math.round((Date.now() - +new Date(iso)) / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  if (m < 1440) return `${Math.round(m / 60)}h`;
  return `${Math.round(m / 1440)}d`;
};

function useTick(ms = 1000) {
  const [, set] = useState(0);
  useEffect(() => {
    const id = setInterval(() => set((n) => n + 1), ms);
    return () => clearInterval(id);
  }, [ms]);
}

export function FinalMoment() {
  useTick();
  const mv = useMovement();
  const fm = useFinalMoment();
  const [label, setLabel] = useState<RoundLabel>("D1");
  const [query, setQuery] = useState("");
  const [paste, setPaste] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    seedMovement();
    // real stuck WhatsApp chats so every 30-chat draft is real work
    const made = ensureStuckChats(40);
    if (made) toast.success(`${made} stuck WhatsApp chats pulled into the draft pool`);
  }, []);

  const states = useMemo(
    () => Object.values(mv.states).filter((s) => s.stage !== "booked" && s.stage !== "check-in"),
    [mv.states],
  );

  const activeRound = fm.rounds.find((r) => r.id === fm.activeRoundId) ?? null;

  /** last-4 index for instant search */
  const index = useMemo(() => {
    const map = new Map<string, MovementState[]>();
    for (const s of states) {
      const k = last4(s.phone);
      if (!k) continue;
      map.set(k, [...(map.get(k) ?? []), s]);
    }
    return map;
  }, [states]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [] as MovementState[];
    const digits = q.replace(/\D/g, "");
    return states
      .filter((s) =>
        digits
          ? (s.phone ?? "").replace(/\D/g, "").includes(digits)
          : (s.name ?? "").toLowerCase().includes(q),
      )
      .slice(0, 8);
  }, [query, states]);

  /** digits typed so far — the 4-digit parser lights up as soon as we have 4 */
  const typedDigits = query.replace(/\D/g, "");

  /** no CRM chat for these digits: the bridge opens a shadow lead and drafts it */
  function addTypedNumber() {
    const l4 = typedDigits.slice(-4);
    const phone = typedDigits.length >= 10 ? typedDigits : `9${l4.padStart(9, "0")}`;
    const row = ingestMessage({
      phoneRaw: phone,
      name: `WA ···${l4}`,
      text: "Marked 111111 on WhatsApp",
    });
    const st = row.ulid ? useMovement.getState().states[row.ulid] : null;
    if (!st) {
      toast.error("Could not open that chat");
      return;
    }
    addLead(st);
    toast.success(`···${l4} added from WhatsApp`);
  }

  const markTimer = fm.markTimers?.[label];
  const elapsed = markTimer
    ? Math.floor((Date.now() - +new Date(markTimer.startedAt)) / 1000)
    : fm.markStartedAt
      ? Math.floor((Date.now() - +new Date(fm.markStartedAt)) / 1000)
      : 0;
  const remaining = fm.windowSecs - elapsed;
  const pace = activeRound ? roundPace(activeRound) : null;
  const doneSet = new Set(activeRound?.done ?? []);

  const connectedToday = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return mv.events.filter(
      (e) => e.kind === "call-result" && e.to === "connected" && +new Date(e.ts) >= +start,
    ).length;
  }, [mv.events]);

  const lockedByOther = (ulid: string) => {
    const l = mv.lockOf(ulid);
    return l && l.operatorId !== mv.actor.id ? l : null;
  };

  /* ------------------------------- marking ------------------------------- */

  function addLead(s: MovementState, viaWa = true) {
    if (fm.picks.length >= DRAFT_SIZE) {
      toast.error(`One draft holds exactly ${DRAFT_SIZE} chats — lock and work these first`);
      return;
    }
    if (fm.picks.includes(s.ulid)) {
      toast.info(`${s.name ?? last4(s.phone)} already in this draft`);
      return;
    }
    const other = lockedByOther(s.ulid);
    if (other) {
      mv.attemptClaim(s.ulid, "drafting", "draft round");
      toast.error(`In ${other.operatorName}'s draft — you can read history, not call`);
      return;
    }
    fm.pick(s.ulid);
    if (viaWa) {
      fm.markWa(s.ulid);
      mv.markWaDraft(s.ulid, label as DraftCode);
    }
    setQuery("");
    searchRef.current?.focus();
  }

  function syncPaste() {
    const tokens = parseTokens(paste);
    if (!tokens.length) {
      toast.error("Paste phone numbers or their last 4 digits");
      return;
    }
    const matched: string[] = [];
    const missing: string[] = [];
    for (const t of tokens) {
      const hits = index.get(t);
      if (!hits || !hits.length) {
        missing.push(t);
        continue;
      }
      const free = hits.find((h) => !lockedByOther(h.ulid));
      if (!free) {
        missing.push(t);
        continue;
      }
      matched.push(free.ulid);
      if (fm.picks.length + matched.length >= DRAFT_SIZE) break;
    }
    fm.pickMany(matched.slice(0, Math.max(0, DRAFT_SIZE - fm.picks.length)));
    fm.markWaMany(matched);
    for (const u of matched) mv.markWaDraft(u, label as DraftCode);
    setPaste("");
    toast.success(`Auto-synced ${matched.length} chats${missing.length ? ` · ${missing.length} not found / locked` : ""}`);
  }

  const usedLabels = fm.rounds.map((r) => r.label);
  const labelUsed = (r: RoundLabel) => usedLabels.includes(r);

  function startRound() {
    if (labelUsed(label)) {
      toast.error(`Draft ${label} is already done today — each draft runs once`);
      return;
    }
    if (fm.picks.length < DRAFT_SIZE) {
      toast.error(`${DRAFT_SIZE} chats minimum per draft — ${DRAFT_SIZE - fm.picks.length} more to go`);
      return;
    }
    const claimed: string[] = [];
    for (const u of fm.picks) {
      const r = mv.attemptClaim(u, "drafting", `${label} draft round`);
      if (r.ok) claimed.push(u);
    }
    if (!claimed.length) {
      toast.error("Every marked chat is locked by someone else");
      return;
    }
    mv.startBatch(label === "D1" ? "G1" : label === "D2" ? "G2" : label === "D3" ? "G3" : "G4", claimed);
    fm.startRound(label, claimed);
    toast.success(`${label} round started · ${claimed.length} leads locked to you`);
  }

  /* -------------------------------- working ------------------------------- */

  const roundLeads = activeRound ? activeRound.ulids.map((u) => mv.states[u]).filter(Boolean) : [];
  const cursor = Math.min(activeRound?.cursor ?? 0, Math.max(0, roundLeads.length - 1));
  const current = roundLeads[cursor];

  const OUTCOME_COUNTERS = ["tours", "quotes", "bookings", "closed"] as const;

  function act(fn: () => void, counter?: Parameters<typeof fm.bump>[0], msg?: string) {
    fn();
    if (counter) fm.bump(counter);
    // an outcome finishes the lead for this round — it counts towards the 90-minute pace
    if (counter && (OUTCOME_COUNTERS as readonly string[]).includes(counter) && current) {
      fm.markDone(current.ulid);
    }
    if (msg) toast.success(msg);
  }

  /** jump to the next lead that is not finished yet */
  function next() {
    if (!activeRound) return;
    const done = new Set(activeRound.done ?? []);
    const order = [
      ...roundLeads.slice(cursor + 1).map((s, i) => cursor + 1 + i),
      ...roundLeads.slice(0, cursor).map((_, i) => i),
    ];
    const nextIdx = order.find((i) => !done.has(roundLeads[i].ulid));
    if (nextIdx === undefined) {
      toast.info("All 30 are done — close the round");
      return;
    }
    fm.setCursor(nextIdx);
  }

  function doneAndNext() {
    if (!current) return;
    fm.markDone(current.ulid);
    toast.success(`${current.name ?? last4(current.phone)} done`);
    next();
  }


  function finishRound() {
    if (!activeRound) return;
    for (const u of activeRound.ulids) mv.release(u);
    const b = mv.batches.find((x) => x.ulids.length === activeRound.ulids.length && !x.endedAt);
    if (b) mv.endBatch(b.id);
    fm.endRound();
    toast.success(`${activeRound.label} closed · ${activeRound.connected} connected · ${activeRound.bookings} booked`);
  }

  const timeline = current ? mv.events.filter((e) => e.ulid === current.ulid).slice(0, 14) : [];

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 p-3 sm:p-5">
      {/* ------------------------------- header ------------------------------ */}
      <header className="rounded-xl border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold tracking-tight">Final Moment</h1>
            <p className="text-xs text-muted-foreground">
              Mark 30 on WhatsApp · sync by last 4 digits · work the 30 · 4 rounds a day
            </p>
          </div>
          <div className="flex items-center gap-4">
            {activeRound && pace ? (
              <div className="text-right">
                <div
                  className={cn(
                    "font-mono text-2xl font-bold",
                    pace.remainingSecs <= 10 * 60 && "text-destructive",
                  )}
                >
                  {pace.remainingSecs < 0 ? `+${fmtClock(-pace.remainingSecs)}` : fmtClock(pace.remainingSecs)}
                </div>
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  left of {activeRound.workMins ?? 90} min for {pace.totalCount}
                </div>
              </div>
            ) : (
              <div className="text-right">
                <div className={cn("font-mono text-2xl font-bold", remaining <= 30 && "text-destructive")}>
                  {fmtClock(remaining)}
                </div>
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  {fm.windowSecs}s marking window · {label}
                </div>
              </div>
            )}
            <div className="text-right">
              <div className="text-2xl font-bold">
                {connectedToday}
                <span className="text-sm text-muted-foreground">/{DAILY_CONNECT_TARGET}</span>
              </div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">connected today</div>
            </div>
          </div>
        </div>

        {/* per-draft timers — one clock per draft, running from the first lead added */}
        <div className="mt-3 grid gap-2 sm:grid-cols-4">
          {ROUNDS.map((r) => {
            const t = fm.markTimers?.[r];
            const round = fm.rounds.find((x) => x.label === r);
            const isActive = activeRound?.label === r;
            const p = round ? roundPace(round) : null;
            const markSecs = round
              ? round.markSecs
              : t
                ? Math.floor((Date.now() - +new Date(t.startedAt)) / 1000)
                : 0;
            return (
              <button
                key={r}
                disabled={!!activeRound || labelUsed(r)}
                onClick={() => {
                  setLabel(r);
                  fm.startMarkTimer(r);
                }}
                className={cn(
                  "rounded-lg border p-2 text-left",
                  label === r && !activeRound && "border-primary bg-primary/5",
                  isActive && "border-primary bg-primary/10",
                  labelUsed(r) && !isActive && "opacity-60",
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold">Draft {r}</span>
                  <span className="text-[10px] uppercase text-muted-foreground">
                    {isActive ? "working" : round?.endedAt ? "closed" : round ? "locked" : t ? "marking" : "idle"}
                  </span>
                </div>
                <div className="font-mono text-lg font-bold">
                  {isActive && p
                    ? p.remainingSecs < 0
                      ? `+${fmtClock(-p.remainingSecs)}`
                      : fmtClock(p.remainingSecs)
                    : fmtClock(markSecs)}
                </div>
                <div className="text-[10px] text-muted-foreground">
                  {isActive && p
                    ? `${p.doneCount}/${p.totalCount} done · ${p.perMinute.toFixed(2)}/min`
                    : round
                      ? `marked in ${fmtClock(round.markSecs)} · ${(round.done ?? []).length}/${round.ulids.length} done`
                      : label === r
                        ? `${fm.picks.length}/${DRAFT_SIZE} marked`
                        : "not started"}
                </div>
              </button>
            );
          })}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button size="sm" variant="ghost" onClick={() => fm.resetMarkTimer(label)}>
            Restart 300s
          </Button>
          <Badge variant="secondary">
            {activeRound ? `${activeRound.label} in progress` : `${fm.picks.length}/${DRAFT_SIZE} marked`}
          </Badge>
          {pace && (
            <Badge variant={pace.delta < 0 ? "destructive" : "default"}>
              {pace.delta < 0 ? `${Math.abs(pace.delta)} behind pace` : `${pace.delta} ahead of pace`}
            </Badge>
          )}
        </div>
        <Progress
          className="mt-3"
          value={activeRound && pace
            ? (pace.doneCount / Math.max(1, pace.totalCount)) * 100
            : (fm.picks.length / DRAFT_SIZE) * 100}
        />

      </header>

      {!activeRound && (
        <>
          <DraftVisionPanel
            onAdd={(s) => addLead(s)}
            inDraft={(u) => fm.picks.includes(u)}
            remaining={Math.max(0, DRAFT_SIZE - fm.picks.length)}
          />
          <BridgePanel
            onAdd={(s) => addLead(s)}
            inDraft={(u) => fm.picks.includes(u)}
          />
        </>
      )}


      {!activeRound ? (
        /* ------------------------------ MARK 30 ----------------------------- */
        <section className="grid gap-4 lg:grid-cols-[1fr_360px]">
          <div className="space-y-3 rounded-xl border bg-card p-4">
            <div>
              <h2 className="text-sm font-semibold">1 · Find the chat by last 4 digits</h2>
              <p className="text-xs text-muted-foreground">
                Type the last 4 digits — one match is added instantly with the WhatsApp 111111 mark.
              </p>
            </div>
            <Input
              ref={searchRef}
              autoFocus
              inputMode="numeric"
              placeholder="e.g. 4821"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                fm.startMarkTimer(label);
              }}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                if (results[0]) addLead(results[0]);
                else if (typedDigits.length >= 4) addTypedNumber();
              }}
            />

            {/* live parser — the moment 4 digits are typed, offer the add */}
            {typedDigits.length >= 4 && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-primary/40 bg-primary/5 p-2">
                <div className="min-w-0 text-xs">
                  <span className="font-mono font-semibold">···{typedDigits.slice(-4)}</span>{" "}
                  {results.length ? (
                    <span className="text-muted-foreground">
                      {results.length} chat{results.length > 1 ? "s" : ""} matched — {results[0].name ?? "Unknown"}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">no CRM chat — the bridge will create one</span>
                  )}
                </div>
                <Button size="sm" onClick={() => (results[0] ? addLead(results[0]) : addTypedNumber())}>
                  Add this lead
                </Button>
              </div>
            )}

            {!!results.length && (
              <ul className="divide-y rounded-lg border">
                {results.map((s) => {
                  const other = lockedByOther(s.ulid);
                  return (
                    <li key={s.ulid} className="flex items-center justify-between gap-2 p-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">
                          {s.name ?? "Unknown"}{" "}
                          <span className="font-mono text-xs text-muted-foreground">···{last4(s.phone)}</span>
                        </div>
                        <div className="truncate text-xs text-muted-foreground">
                          {s.zone || s.waAccount} · last msg {ago(s.lastCustomerMsgAt)} · {s.crmDraft ?? "no draft"}
                          {other ? ` · locked by ${other.operatorName}` : ""}
                        </div>
                      </div>
                      <Button size="sm" onClick={() => addLead(s)} disabled={!!other}>
                        111111
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}

            <Separator />
            <div>
              <h2 className="text-sm font-semibold">2 · Or paste the whole list</h2>
              <p className="text-xs text-muted-foreground">
                Paste the numbers you marked on WhatsApp — full numbers or last 4 digits, any separator.
              </p>
            </div>
            <Textarea
              rows={4}
              placeholder="4821, 9930 7742&#10;+91 98765 41234"
              value={paste}
              onChange={(e) => {
                setPaste(e.target.value);
                fm.startMarkTimer(label);
              }}
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={syncPaste}>
                Auto-sync pasted chats
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  const free = states
                    .filter((s) => !fm.picks.includes(s.ulid) && !lockedByOther(s.ulid))
                    .sort(
                      (a, b) =>
                        +new Date(b.lastCustomerMsgAt ?? b.updatedAt) -
                        +new Date(a.lastCustomerMsgAt ?? a.updatedAt),
                    )
                    .slice(0, DRAFT_SIZE - fm.picks.length)
                    .map((s) => s.ulid);
                  fm.pickMany(free);
                  fm.markWaMany(free);
                  for (const u of free) mv.markWaDraft(u, label as DraftCode);
                  toast.success(`Filled ${free.length} stuck chats to reach ${DRAFT_SIZE}`);
                }}
              >
                Fill to {DRAFT_SIZE} stuck chats
              </Button>
            </div>
          </div>

          {/* marked pool */}
          <aside className="space-y-3 rounded-xl border bg-card p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">Marked · {fm.picks.length}</h2>
              <Button size="sm" variant="ghost" onClick={fm.clearPicks}>
                Clear
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Exactly {DRAFT_SIZE} per draft · {DRAFT_SIZE} is the minimum to lock · each draft (D1–D4) runs once a day.
            </p>
            <ul className="max-h-[420px] space-y-1 overflow-auto">
              {fm.picks.map((u, i) => {
                const s = mv.states[u];
                if (!s) return null;
                return (
                  <li key={u} className="flex items-center justify-between gap-2 rounded-md border p-2">
                    <div className="min-w-0">
                      <div className="truncate text-xs font-medium">
                        {i + 1}. {s.name ?? "Unknown"}{" "}
                        <span className="font-mono text-muted-foreground">···{last4(s.phone)}</span>
                      </div>
                      <div className="flex gap-1 pt-1">
                        {(Object.keys(DRAFT_META) as DraftCode[]).map((c) => (
                          <button
                            key={c}
                            onClick={() => mv.draft(u, c)}
                            className={cn(
                              "rounded border px-1.5 py-0.5 text-[10px]",
                              s.crmDraft === c && "bg-primary text-primary-foreground",
                            )}
                          >
                            {c}
                          </button>
                        ))}
                      </div>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => fm.unpick(u)}>
                      ×
                    </Button>
                  </li>
                );
              })}
              {!fm.picks.length && (
                <li className="py-6 text-center text-xs text-muted-foreground">Nothing marked yet.</li>
              )}
            </ul>
            <Button
              className="w-full"
              onClick={startRound}
              disabled={fm.picks.length < DRAFT_SIZE || labelUsed(label)}
            >
              {labelUsed(label)
                ? `Draft ${label} already done`
                : fm.picks.length < DRAFT_SIZE
                  ? `Need ${DRAFT_SIZE - fm.picks.length} more to lock`
                  : `Lock & work these ${fm.picks.length}`}
            </Button>
          </aside>
        </section>
      ) : (
        /* ------------------------------ WORK 30 ----------------------------- */
        <section className="grid gap-4 lg:grid-cols-[1fr_340px]">
          <div className="space-y-3 rounded-xl border bg-card p-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold">
                  {activeRound.label} · lead {cursor + 1} of {roundLeads.length}
                  {current && doneSet.has(current.ulid) ? " · done" : ""}
                </h2>
                <p className="text-xs text-muted-foreground">
                  Locked to you — nobody else can call these while the round is open.
                </p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={doneAndNext} disabled={!current}>
                  Done · next
                </Button>
                <Button size="sm" variant="outline" onClick={next}>
                  Skip →
                </Button>
                <Button size="sm" variant="destructive" onClick={finishRound}>
                  Close round
                </Button>
              </div>
            </div>

            {/* ---------------------------- pace panel --------------------------- */}
            {pace && (
              <div className="rounded-lg border p-3">
                <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-5">
                  <div>
                    <div className="text-lg font-bold">
                      {pace.doneCount}
                      <span className="text-xs text-muted-foreground">/{pace.totalCount}</span>
                    </div>
                    <div className="text-[10px] uppercase text-muted-foreground">done</div>
                  </div>
                  <div>
                    <div className="font-mono text-lg font-bold">{Math.floor(pace.elapsedMins)}m</div>
                    <div className="text-[10px] uppercase text-muted-foreground">elapsed</div>
                  </div>
                  <div>
                    <div className="text-lg font-bold">{pace.perMinute.toFixed(2)}</div>
                    <div className="text-[10px] uppercase text-muted-foreground">leads / min</div>
                  </div>
                  <div>
                    <div className={cn("text-lg font-bold", pace.delta < 0 && "text-destructive")}>
                      {pace.delta >= 0 ? `+${pace.delta}` : pace.delta}
                    </div>
                    <div className="text-[10px] uppercase text-muted-foreground">vs pace</div>
                  </div>
                  <div>
                    <div className="font-mono text-lg font-bold">
                      {pace.secsPerRemaining ? fmtClock(Math.round(pace.secsPerRemaining)) : "—"}
                    </div>
                    <div className="text-[10px] uppercase text-muted-foreground">per lead left</div>
                  </div>
                </div>
                <p className="pt-2 text-[11px] text-muted-foreground">
                  {pace.overdue
                    ? `Over the ${activeRound.workMins ?? 90}-minute window by ${fmtClock(-pace.remainingSecs)} — ${pace.totalCount - pace.doneCount} still open.`
                    : `Target ${pace.shouldBeDone} done by now · projected finish ${
                        pace.projectedMins ? `${Math.round(pace.projectedMins)}m` : "—"
                      } · marking took ${fmtClock(activeRound.markSecs)}.`}
                </p>
                {/* per-minute completion bars */}
                <div className="mt-2 flex h-10 items-end gap-[2px]">
                  {pace.minuteBuckets.map((n, i) => (
                    <div
                      key={i}
                      title={`Minute ${i + 1}: ${n} done`}
                      className={cn(
                        "flex-1 rounded-sm bg-muted",
                        n > 0 && "bg-primary",
                      )}
                      style={{ height: `${Math.max(6, Math.min(100, n * 33))}%` }}
                    />
                  ))}
                </div>
                <div className="text-[10px] text-muted-foreground">per-minute completions</div>
              </div>
            )}


            {current && (
              <>
                <div className="rounded-lg border p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-base font-semibold">{current.name ?? "Unknown"}</span>
                    <span className="font-mono text-xs text-muted-foreground">{current.phone ?? "—"}</span>
                    <Badge variant="secondary">{current.stage}</Badge>
                    {current.crmDraft && <Badge>{current.crmDraft}</Badge>}
                    {current.goodLead && <Badge variant="outline">GOOD LEAD</Badge>}
                  </div>
                  <div className="pt-1 text-xs text-muted-foreground">
                    Owner {current.primaryOwnerName} · {current.zone || current.waAccount} · last customer msg{" "}
                    {ago(current.lastCustomerMsgAt)}
                    {current.lastCustomerMsg ? ` · "${current.lastCustomerMsg}"` : ""}
                  </div>
                </div>

                <LogActivity lead={current} />

                <div className="space-y-2">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Quick call buttons
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => act(() => mv.startCall(current.ulid), "calls", "Call started")}>
                      Start call
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        mv.logCall(current.ulid, "connected");
                        fm.bump("connected");
                        toast.success("Connected logged");
                      }}
                    >
                      Connected
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => act(() => mv.logCall(current.ulid, "no-answer"), undefined, "No answer")}>
                      No answer
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => act(() => mv.logCall(current.ulid, "busy"), undefined, "Busy")}>
                      Busy
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => act(() => mv.logCall(current.ulid, "wrong-number"), undefined, "Wrong number")}>
                      Wrong number
                    </Button>
                  </div>

                  <div className="pt-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Text &amp; update
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        act(() => mv.sendMessage(current.ulid, "Shared verified options on WhatsApp"), "texts", "WhatsApp sent")
                      }
                    >
                      WhatsApp sent
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => act(() => mv.shareOptions(current.ulid, 3), undefined, "3 options shared")}>
                      Send 3 options
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        act(
                          () =>
                            mv.capture(current.ulid, {
                              moveInDate: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
                              location: current.zone || "Koramangala",
                              budget: 12000,
                              inBangalore: true,
                              responding: true,
                            }),
                          undefined,
                          "Update captured",
                        )
                      }
                    >
                      Got the update
                    </Button>
                  </div>

                  <div className="pt-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Push forward
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      onClick={() =>
                        act(
                          () => {
                            mv.draft(current.ulid, "D1");
                            mv.qualify(current.ulid, true);
                            mv.setStage(current.ulid, "negotiation", "Marked definite close");
                            mv.log(current.ulid, "note", "Definite close — committed by customer");
                            fm.bump("closed");
                            fm.markDone(current.ulid);
                          },
                          undefined,
                          "Marked as definite close",
                        )
                      }
                    >
                      Definite close
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        act(
                          () =>
                            mv.scheduleTour(
                              current.ulid,
                              new Date(Date.now() + 86400000).toISOString(),
                              current.tourProperty ?? "Gharpayy Koramangala",
                            ),
                          "tours",
                          "Pushed to tour",
                        )
                      }
                    >
                      Push to tour
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => act(() => mv.sendQuote(current.ulid), "quotes", "Pushed to quote")}>
                      Push to quote
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        act(
                          () => {
                            mv.collectPayment(current.ulid);
                            mv.book(current.ulid);
                          },
                          "bookings",
                          "Booked",
                        )
                      }
                    >
                      Push to booking
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => act(() => mv.exit(current.ulid, "no-response"), undefined, "Exited")}>
                      Lost
                    </Button>
                  </div>
                </div>

                <Separator />
                <div>
                  <div className="pb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    History — visible to everyone
                  </div>
                  <ul className="space-y-1">
                    {timeline.map((e) => (
                      <li key={e.id} className="flex gap-2 text-xs">
                        <span className="w-10 shrink-0 font-mono text-muted-foreground">{ago(e.ts)}</span>
                        <span className="shrink-0 text-muted-foreground">{e.actorName}</span>
                        <span>{e.text}</span>
                      </li>
                    ))}
                    {!timeline.length && <li className="text-xs text-muted-foreground">No activity yet.</li>}
                  </ul>
                </div>
              </>
            )}
          </div>

          <aside className="space-y-3 rounded-xl border bg-card p-4">
            <h2 className="text-sm font-semibold">Round list</h2>
            <ul className="max-h-[360px] space-y-1 overflow-auto">
              {roundLeads.map((s, i) => {
                const isDone = doneSet.has(s.ulid);
                return (
                  <li key={s.ulid}>
                    <button
                      onClick={() => fm.setCursor(i)}
                      className={cn(
                        "w-full rounded-md border p-2 text-left text-xs",
                        i === cursor && "border-primary bg-primary/5",
                        isDone && "opacity-60",
                      )}
                    >
                      <span className={cn("font-medium", isDone && "line-through")}>
                        {i + 1}. {s.name ?? "Unknown"}
                      </span>{" "}
                      <span className="font-mono text-muted-foreground">···{last4(s.phone)}</span>
                      {isDone && <span className="ml-1 text-primary">✓</span>}
                      <div className="text-muted-foreground">
                        {s.stage} · {s.crmDraft ?? "no draft"}
                      </div>
                    </button>
                  </li>
                );
              })}

            </ul>
            <Separator />
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              {(["calls", "connected", "texts", "tours", "quotes", "bookings"] as const).map((k) => (
                <div key={k} className="rounded-md border p-2">
                  <div className="text-lg font-bold">{activeRound[k]}</div>
                  <div className="text-[10px] uppercase text-muted-foreground">{k}</div>
                </div>
              ))}
            </div>
          </aside>
        </section>
      )}

      {/* ------------------------------ round log ---------------------------- */}
      <section className="rounded-xl border bg-card p-4">
        <h2 className="text-sm font-semibold">Rounds today</h2>
        <ul className="mt-2 space-y-1 text-xs">
          {fm.rounds.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-2 rounded-md border p-2">
              <Badge variant={r.endedAt ? "secondary" : "default"}>{r.id}</Badge>
              <span>
                {(r.done ?? []).length}/{r.ulids.length} done in {r.workMins ?? 90}m
              </span>
              <span className="text-muted-foreground">
                marked in {fmtClock(r.markSecs ?? 0)} · {r.calls} calls · {r.connected} connected · {r.tours} tours ·{" "}
                {r.quotes} quotes · {r.bookings} booked · {r.closed} definite
              </span>

              <span className="ml-auto text-muted-foreground">
                {new Date(r.startedAt).toLocaleTimeString()} {r.endedAt ? `→ ${new Date(r.endedAt).toLocaleTimeString()}` : "· open"}
              </span>
            </li>
          ))}
          {!fm.rounds.length && <li className="text-muted-foreground">No rounds yet — mark 30 and start D1.</li>}
        </ul>
      </section>
    </div>
  );
}
