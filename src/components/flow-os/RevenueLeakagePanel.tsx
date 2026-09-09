import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw, UserRoundX, MessageCircleWarning, CalendarX2, ReceiptIndianRupee } from "lucide-react";

const db = supabase as unknown as { from: (table: string) => any };

type Leak = {
  lead_id: string | null;
  observation_id: string | null;
  phone: string | null;
  wa_name: string | null;
  current_owner: string | null;
  current_owner_name: string | null;
  current_handler: string | null;
  current_handler_name: string | null;
  current_pipeline_stage: string | null;
  latest_observation_at: string | null;
  last_message_preview: string | null;
  leak_type: string;
  why_red: string;
  severity: number;
};

const iconFor = (type: string) => {
  if (type.includes("UNOWNED")) return UserRoundX;
  if (type.includes("INBOUND") || type.includes("SYNC")) return MessageCircleWarning;
  if (type.includes("QUOTE") || type.includes("PAYMENT")) return ReceiptIndianRupee;
  if (type.includes("TOUR") || type.includes("ACTION")) return CalendarX2;
  return AlertTriangle;
};

export function RevenueLeakagePanel() {
  const [rows, setRows] = useState<Leak[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await db.from("flow_revenue_leakage").select("*").order("severity", { ascending: false }).order("latest_observation_at", { ascending: false, nullsFirst: false });
    if (!error) setRows((data ?? []) as Leak[]);
    setLoading(false);
  };
  useEffect(() => { void load(); }, []);

  const counts = useMemo(() => rows.reduce<Record<string, number>>((a, r) => { a[r.leak_type] = (a[r.leak_type] ?? 0) + 1; return a; }, {}), [rows]);

  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2"><h2 className="text-xl font-bold">Revenue Leakage Queue</h2><Badge variant={rows.length ? "destructive" : "secondary"}>{rows.length} need intervention</Badge></div>
          <p className="text-xs text-muted-foreground mt-1">Every red item explains the broken guarantee and the accountable person. Control Tower should drive this queue to zero or a named recovery deadline.</p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}><RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />Refresh leakage</Button>
      </div>

      <div className="flex gap-1.5 flex-wrap">
        {Object.entries(counts).sort((a,b)=>b[1]-a[1]).map(([k,v]) => <Badge key={k} variant="outline" className="text-[10px]">{k.replaceAll("_"," ")} · {v}</Badge>)}
      </div>

      <div className="space-y-2">
        {rows.map((row) => {
          const Icon = iconFor(row.leak_type);
          const handler = row.current_handler_name || row.current_owner_name || null;
          return (
            <Card key={`${row.lead_id || "obs"}-${row.observation_id || row.leak_type}`} className="p-3 border-red-500/35 bg-red-500/[0.03]">
              <div className="grid grid-cols-1 md:grid-cols-[1fr_1.2fr_auto] gap-3 items-start">
                <div>
                  <div className="flex items-center gap-2 flex-wrap"><Icon className="h-4 w-4 text-red-500" /><div className="font-semibold text-sm">{row.wa_name || "Unresolved WhatsApp customer"}</div><Badge variant="destructive" className="text-[9px]">{row.leak_type.replaceAll("_"," ")}</Badge></div>
                  <div className="text-[11px] text-muted-foreground mt-1">{row.phone || "phone unresolved"} · Saved: {row.current_pipeline_stage || "not in CRM"}</div>
                </div>
                <div>
                  <div className="text-xs">{row.last_message_preview || "No message preview"}</div>
                  <div className="text-[11px] text-red-600 mt-1"><b>Why red:</b> {row.why_red}</div>
                </div>
                <div className="text-right min-w-40">
                  <div className="text-[10px] uppercase text-muted-foreground">Who owns the fix?</div>
                  <div className="text-xs font-semibold mt-0.5">{handler || "UNOWNED — assign now"}</div>
                  <div className="text-[10px] text-muted-foreground mt-1">severity {row.severity}/100</div>
                </div>
              </div>
            </Card>
          );
        })}
        {!rows.length && <Card className="p-8 text-center text-sm text-muted-foreground">No current leakage rows. Keep reconciling screenshots to prove it stays at zero.</Card>}
      </div>
    </section>
  );
}
