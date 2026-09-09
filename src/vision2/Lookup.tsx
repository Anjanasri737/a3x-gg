// Lead lookup — type a number or a name, see everything the system ever saw.
import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Search } from "lucide-react";
import { useMovement } from "@/movement/store";
import { useOcrEngine } from "./engine";

export function Lookup({ preset }: { preset?: string | null }) {
  const eng = useOcrEngine();
  const mv = useMovement();
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(preset ?? null);

  const results = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return [];
    const d = term.replace(/\D/g, "");
    return Object.values(eng.customers)
      .filter((c) =>
        d.length >= 3 ? (c.normalizedPhone ?? "").includes(d) : (c.name ?? "").toLowerCase().includes(term),
      )
      .slice(0, 25);
  }, [q, eng.customers]);

  const id = openId;
  const cust = id ? eng.customers[id] : null;
  const obs = id ? eng.observationsFor(id) : [];
  const claim = id ? eng.claims[id] : undefined;

  // CRM side: matching movement state by last 10 digits
  const crm = useMemo(() => {
    if (!cust?.normalizedPhone) return null;
    return (
      Object.values(mv.states).find(
        (s) => (s.phone ?? "").replace(/\D/g, "").slice(-10) === cust.normalizedPhone,
      ) ?? null
    );
  }, [cust, mv.states]);
  const crmEvents = crm ? mv.events.filter((e) => e.ulid === crm.ulid).slice(0, 30) : [];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 rounded-xl border bg-card p-3">
        <Search className="h-4 w-4 text-muted-foreground" />
        <Input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="9876543210 or Rahul"
          className="h-9 text-sm"
        />
      </div>

      {!!results.length && (
        <ul className="divide-y rounded-xl border bg-card">
          {results.map((r) => (
            <li key={r.id}>
              <button className="w-full p-2 text-left hover:bg-muted/50" onClick={() => setOpenId(r.id)}>
                <span className="text-sm font-medium">{r.name ?? r.normalizedPhone}</span>{" "}
                <span className="font-mono text-[11px] text-muted-foreground">{r.normalizedPhone ?? "no number"}</span>{" "}
                <Badge variant="outline" className="h-4 text-[9px]">{r.appearances} observations</Badge>
              </button>
            </li>
          ))}
        </ul>
      )}

      {cust && (
        <div className="space-y-3 rounded-xl border bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold">{cust.name ?? cust.normalizedPhone ?? "Unknown"}</h2>
              <p className="font-mono text-[11px] text-muted-foreground">
                {cust.id} · {cust.normalizedPhone ?? "number not visible"} · {cust.identityState}
              </p>
            </div>
            <div className="flex gap-2 text-[11px]">
              <Badge variant="outline">first seen {new Date(cust.firstSeen).toLocaleDateString()}</Badge>
              <Badge variant="outline">last seen {new Date(cust.lastSeen).toLocaleDateString()}</Badge>
              <Badge>{cust.appearances} appearances</Badge>
              {claim?.status === "active" && <Badge variant="secondary">owner {claim.ownerName}</Badge>}
            </div>
          </div>

          <div className="grid gap-2 text-xs sm:grid-cols-4">
            <Cell k="Intent" v={cust.intent} />
            <Cell k="Health" v={cust.health} />
            <Cell k="Movement" v={cust.movement} />
            <Cell k="Draft" v={cust.draft} />
          </div>
          {cust.stuckReason && (
            <p className="rounded-lg border border-destructive/40 p-2 text-xs text-destructive">{cust.stuckReason}</p>
          )}

          <Separator />
          <h3 className="text-sm font-semibold">Screenshot history · {obs.length} observations</h3>
          <ul className="space-y-2">
            {obs.map((o) => (
              <li key={o.id} className="rounded-lg border p-2 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="h-4 text-[9px]">{o.movement}</Badge>
                  <span className="text-muted-foreground">
                    seen {new Date(o.capturedAt).toLocaleString()} · shown as “{o.timestampRaw ?? "—"}”
                    {o.timestampResolved ? ` · ${new Date(o.timestampResolved).toLocaleDateString()} (${o.timestampPrecision})` : ""}
                  </span>
                  {o.seenCount > 1 && <Badge variant="secondary" className="h-4 text-[9px]">×{o.seenCount}</Badge>}
                </div>
                <div className="pt-1">{o.lastMessage ?? "—"}</div>
                <div className="pt-1 text-[10px] text-muted-foreground">
                  {o.waAccount} · row {o.rowPosition} · unread {o.unreadCount} · OCR {(o.ocrConfidence * 100).toFixed(0)}% ·
                  identity {(o.identityConfidence * 100).toFixed(0)}% · source screenshot {o.screenshotId}
                </div>
              </li>
            ))}
            {!obs.length && <li className="text-xs text-muted-foreground">No screenshot observations.</li>}
          </ul>

          <Separator />
          <h3 className="text-sm font-semibold">CRM history</h3>
          {crm ? (
            <>
              <p className="text-xs text-muted-foreground">
                Stage {crm.stage} · owner {crm.primaryOwnerName} · {crmEvents.length} activities
              </p>
              <ul className="space-y-1 pt-1">
                {crmEvents.map((e) => (
                  <li key={e.id} className="rounded border p-2 text-[11px]">
                    <b>{e.kind}</b> · {e.text}
                    <div className="text-[10px] text-muted-foreground">
                      {new Date(e.ts).toLocaleString()} · {e.actorName}
                    </div>
                  </li>
                ))}
                {!crmEvents.length && <li className="text-xs text-muted-foreground">No CRM activity yet.</li>}
              </ul>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">No CRM record linked to this number yet.</p>
          )}

          <div className="flex gap-2 pt-1">
            <Button size="sm" variant="outline" onClick={() => setOpenId(null)}>Close</Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Cell({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-lg border p-2">
      <div className="text-[10px] uppercase text-muted-foreground">{k}</div>
      <div className="font-medium capitalize">{v}</div>
    </div>
  );
}
