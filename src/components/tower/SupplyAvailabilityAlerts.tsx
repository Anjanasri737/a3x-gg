// Tower alert: zones with live demand but ZERO verified + available + enabled supply.
import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSellableSupply } from "@/supply-hub/lib/sellable";
import { listZones, zoneOfPG, UNMAPPED, zoneMeta } from "@/supply-hub/lib/zones";
import { cn } from "@/lib/utils";

interface LeadRow { id: string; location_text: string | null; priority: string | null; zones: { name: string | null; code: string | null } | null }

function zoneOfText(text: string): string {
  const hay = (text || "").toLowerCase();
  if (!hay.trim()) return UNMAPPED;
  for (const z of listZones()) {
    if (z.keywords.some((k) => k && hay.includes(k.toLowerCase()))) return z.id;
    if (hay.includes(z.id.toLowerCase()) || hay.includes(z.label.toLowerCase())) return z.id;
  }
  return UNMAPPED;
}

export function SupplyAvailabilityAlerts({ threshold = 2 }: { threshold?: number }) {
  const { verdicts, loading } = useSellableSupply();
  const [leads, setLeads] = useState<LeadRow[]>([]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("leads")
        .select("id, location_text, priority, zones(name, code)")
        .eq("status", "open")
        .limit(1000);
      setLeads((data ?? []) as unknown as LeadRow[]);
    })();
  }, []);

  const rows = useMemo(() => {
    const demand = new Map<string, { leads: number; hot: number }>();
    for (const l of leads) {
      const zid = zoneOfText([l.location_text, l.zones?.name, l.zones?.code].filter(Boolean).join(" "));
      if (zid === UNMAPPED) continue;
      const cur = demand.get(zid) ?? { leads: 0, hot: 0 };
      cur.leads += 1;
      if (l.priority === "super_hot" || l.priority === "hot") cur.hot += 1;
      demand.set(zid, cur);
    }

    const supply = new Map<string, { sellable: number; total: number; unverified: number; full: number }>();
    for (const v of verdicts) {
      const zid = zoneOfPG(v.pg);
      const cur = supply.get(zid) ?? { sellable: 0, total: 0, unverified: 0, full: 0 };
      cur.total += 1;
      if (v.matchable) cur.sellable += 1;
      if (!v.verified) cur.unverified += 1;
      if (v.status === "full") cur.full += 1;
      supply.set(zid, cur);
    }

    return [...demand.entries()]
      .map(([zid, d]) => ({ zid, ...d, sup: supply.get(zid) ?? { sellable: 0, total: 0, unverified: 0, full: 0 } }))
      .filter((r) => r.leads >= threshold && r.sup.sellable === 0)
      .sort((a, b) => b.hot - a.hot || b.leads - a.leads);
  }, [leads, verdicts, threshold]);

  if (loading) return null;

  return (
    <Card className={cn("p-4 space-y-3", rows.length ? "border-destructive/50" : "")}>
      <div className="flex items-center gap-2">
        {rows.length ? <AlertTriangle className="h-4 w-4 text-destructive" /> : <ShieldCheck className="h-4 w-4 text-emerald-400" />}
        <div className="font-semibold">Supply availability alerts</div>
        <Badge variant={rows.length ? "destructive" : "outline"}>{rows.length} zone{rows.length === 1 ? "" : "s"} at zero</Badge>
      </div>

      {rows.length === 0 && (
        <p className="text-sm text-muted-foreground">Every zone with live demand has at least one verified, available, enabled PG.</p>
      )}

      <div className="space-y-2">
        {rows.map((r) => {
          const meta = zoneMeta(r.zid);
          return (
            <div key={r.zid} className="rounded border border-destructive/40 bg-destructive/5 p-3 text-sm">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="font-semibold">{meta.label} <span className="text-xs text-muted-foreground">({meta.short})</span></div>
                <Badge variant="outline" className="text-[10px]">{r.leads} open leads · {r.hot} hot</Badge>
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                0 sellable of {r.sup.total} mapped properties — {r.sup.unverified} unverified, {r.sup.full} full.
              </div>
              <Button size="sm" variant="outline" className="mt-2 h-7 text-xs" asChild>
                <Link to="/supply-hub/admin">Fix in Property Control</Link>
              </Button>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
