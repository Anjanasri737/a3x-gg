// Draft Vision accuracy — how much of what the camera read can be trusted.
import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { useOcrEngine } from "./engine";

export function Accuracy() {
  const eng = useOcrEngine();

  const m = useMemo(() => {
    const cust = Object.values(eng.customers);
    const obs = eng.observations;
    const matched = cust.filter((c) => c.identityState === "verified").length;
    const provisional = cust.filter((c) => c.identityState === "provisional").length;
    const invalid = cust.filter((c) => c.identityState === "invalid").length;
    const lowConf = obs.filter((o) => o.ocrConfidence < 0.6 || o.identityConfidence < 0.6);
    const rejected = cust.filter((c) => c.rejected);
    const claimed = Object.values(eng.claims).filter((c) => c.status === "active").length;
    const rows = obs.reduce((n, o) => n + o.seenCount, 0);
    return {
      cust, obs, matched, provisional, invalid, lowConf, rejected, claimed, rows,
      accuracy: cust.length ? Math.round(((cust.length - rejected.length) / cust.length) * 100) : 100,
      matchRate: cust.length ? Math.round((matched / cust.length) * 100) : 0,
      dedupeSaved: rows - obs.length,
    };
  }, [eng.customers, eng.observations, eng.claims]);

  const stuckReasons = useMemo(() => {
    const map = new Map<string, number>();
    Object.values(eng.customers).forEach((c) => {
      if (c.stuckReason) map.set(c.stuckReason, (map.get(c.stuckReason) ?? 0) + 1);
    });
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [eng.customers]);

  const lastMessages = useMemo(() => {
    const map = new Map<string, number>();
    Object.values(eng.customers).forEach((c) => {
      const k = (c.lastMessage ?? "").slice(0, 40);
      if (k) map.set(k, (map.get(k) ?? 0) + 1);
    });
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [eng.customers]);

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-4">
        <Card k="Unique leads" v={m.cust.length} />
        <Card k="Matched to a number" v={`${m.matched} · ${m.matchRate}%`} />
        <Card k="Low confidence rows" v={m.lowConf.length} tone={m.lowConf.length ? "warn" : undefined} />
        <Card k="Wrongly added" v={m.rejected.length} tone={m.rejected.length ? "bad" : undefined} />
        <Card k="Name-only (provisional)" v={m.provisional} />
        <Card k="Ignored (groups etc.)" v={m.invalid} />
        <Card k="Repeat rows merged" v={m.dedupeSaved} />
        <Card k="Currently claimed" v={m.claimed} />
      </div>

      <div className="rounded-xl border bg-card p-4">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold">Clean-add accuracy</span>
          <span>{m.accuracy}%</span>
        </div>
        <Progress value={m.accuracy} className="mt-2 h-2" />
        <p className="pt-2 text-[11px] text-muted-foreground">
          Share of leads created from screenshots that were not later marked as wrongly added.
        </p>
      </div>

      <div className="rounded-xl border bg-card p-4">
        <h3 className="text-sm font-semibold">Needs review · {m.lowConf.length}</h3>
        <ul className="max-h-72 divide-y overflow-y-auto text-xs">
          {m.lowConf.slice(0, 40).map((o) => (
            <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>{o.visibleName ?? o.visiblePhone ?? "Unreadable"}</span>
              <span className="truncate text-muted-foreground">{o.lastMessage ?? "—"}</span>
              <Badge variant="outline" className="text-[10px]">OCR {(o.ocrConfidence * 100).toFixed(0)}%</Badge>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 text-[11px]"
                onClick={() => {
                  eng.reject(o.customerId, "Marked not a lead in review");
                  toast.success("Marked as wrongly added — removed from the work pool");
                }}
              >
                Not a lead
              </Button>
            </li>
          ))}
          {!m.lowConf.length && <li className="py-3 text-muted-foreground">Nothing to review.</li>}
        </ul>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border bg-card p-4">
          <h3 className="text-sm font-semibold">Top stuck reasons</h3>
          <ul className="pt-1 text-xs">
            {stuckReasons.map(([r, n]) => (
              <li key={r} className="flex justify-between border-b py-1">
                <span>{r}</span><b>{n}</b>
              </li>
            ))}
            {!stuckReasons.length && <li className="text-muted-foreground">No stuck chats detected yet.</li>}
          </ul>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <h3 className="text-sm font-semibold">What customers last said</h3>
          <ul className="pt-1 text-xs">
            {lastMessages.map(([r, n]) => (
              <li key={r} className="flex justify-between gap-2 border-b py-1">
                <span className="truncate">{r}</span><b>{n}</b>
              </li>
            ))}
            {!lastMessages.length && <li className="text-muted-foreground">No chats read yet.</li>}
          </ul>
        </div>
      </div>
    </div>
  );
}

function Card({ k, v, tone }: { k: string; v: number | string; tone?: "warn" | "bad" }) {
  return (
    <div className="rounded-xl border bg-card p-3">
      <div className={tone === "bad" ? "text-xl font-bold text-destructive" : "text-xl font-bold"}>{v}</div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{k}</div>
    </div>
  );
}
