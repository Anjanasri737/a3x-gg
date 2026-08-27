// "Sell this PG" — verified-only supply panel for a lead.
// Only lists PGs that are ENABLED + fully VERIFIED + AVAILABLE (or limited).
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Copy, MessageCircle, ShieldCheck, CheckCircle2, X } from "lucide-react";
import { matchLead, rating, type Lead as SupplyLead } from "@/supply-hub/lib/matcher";
import { useSellableSupply } from "@/supply-hub/lib/sellable";
import { messageKit } from "@/supply-hub/lib/messages-kit";
import { useAssignedPG } from "@/supply-hub/lib/assignment";
import { AVAIL_LABEL } from "@/supply-hub/lib/verify";
import { waLink } from "@/supply-hub/lib/wa";
import { cn } from "@/lib/utils";

export interface SellThisPGProps {
  leadId: string;
  leadName?: string;
  phone?: string;
  area?: string;
  gender?: SupplyLead["gender"];
  budgetMin?: number;
  budgetMax?: number;
  occupancy?: SupplyLead["occupancy"];
  /** Called with the verified pitch text when a PG is assigned to the lead. */
  onInjectMessages?: (pitch: string, pgName: string) => void;
  limit?: number;
}

export function SellThisPG(props: SellThisPGProps) {
  const { leadId, leadName, phone, area, limit = 6 } = props;
  const { matchablePGs, loading } = useSellableSupply();
  const { assigned, assign, clear } = useAssignedPG(leadId);
  const [open, setOpen] = useState<string | null>(null);

  const results = useMemo(() => {
    if (!matchablePGs.length) return [];
    const lead: SupplyLead = {
      name: leadName,
      phone,
      area: area ?? "",
      gender: props.gender ?? "Any",
      budgetMin: props.budgetMin ?? 7000,
      budgetMax: props.budgetMax ?? 30000,
      occupancy: props.occupancy ?? "Any",
      audience: "Both",
    };
    return matchLead(lead, matchablePGs)
      .filter((m) => !m.disqualified && m.total > 0)
      .slice(0, limit);
  }, [matchablePGs, leadName, phone, area, props.gender, props.budgetMin, props.budgetMax, props.occupancy, limit]);

  const copy = async (text: string, label: string) => {
    await navigator.clipboard.writeText(text);
    toast.success(`${label} copied`);
  };

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-emerald-400" />
        <div className="font-semibold">Sell this PG</div>
        <Badge variant="outline" className="text-[10px]">verified · available · enabled only</Badge>
      </div>
      <p className="text-xs text-muted-foreground">
        Unverified, disabled, full and waitlist properties are never shown here — you can only pitch stock we can actually close.
      </p>

      {assigned && (
        <div className="rounded border border-emerald-400/40 bg-emerald-400/10 p-2 text-xs flex items-center justify-between gap-2">
          <span>
            Assigned: <span className="font-semibold">{assigned.pgName}</span> — verified messages injected into this lead.
          </span>
          <Button size="sm" variant="ghost" onClick={() => { clear(); toast.success("Assignment cleared"); }}>
            <X className="h-3 w-3" />
          </Button>
        </div>
      )}

      {loading && <div className="text-sm text-muted-foreground">Loading verified supply…</div>}
      {!loading && results.length === 0 && (
        <div className="text-sm text-muted-foreground">
          No verified + available PG matches this lead. Verify or re-open availability in Supply Hub → Property Control.
        </div>
      )}

      <div className="space-y-2">
        {results.map((r) => {
          const rt = rating(r.total);
          const kit = messageKit(r.pg);
          const isOpen = open === r.pg.id;
          const status = (r.pg as { availability?: { status?: keyof typeof AVAIL_LABEL } }).availability?.status;
          const isAssigned = assigned?.pgId === r.pg.id;
          return (
            <div key={r.pg.id} className={cn("rounded border p-3 space-y-2", isAssigned ? "border-emerald-400/50" : "border-border")}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{r.pg.area} · {r.pg.gender} · {r.pg.tier}</div>
                  <div className="font-semibold truncate">{r.pg.name}</div>
                  <div className="text-xs text-muted-foreground">{r.bedLabel}{r.commuteKm !== null ? ` · ${r.commuteKm} km` : ""}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className={cn("font-semibold text-lg", rt.color)}>{r.total}</div>
                  {status && <div className="text-[10px] text-muted-foreground">{AVAIL_LABEL[status]}</div>}
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {kit.map((m) => (
                  <Button key={m.kind} size="sm" variant="outline" className="h-7 text-xs" onClick={() => copy(m.text, m.label)}>
                    <Copy className="h-3 w-3 mr-1" />{m.label.replace(" message", "")}
                    {m.verbatim && <span className="ml-1 text-emerald-400">✓</span>}
                  </Button>
                ))}
                <Button size="sm" variant="outline" className="h-7 text-xs" asChild>
                  <a href={waLink(phone, kit.map((m) => m.text).join("\n\n———\n\n"))} target="_blank" rel="noreferrer">
                    <MessageCircle className="h-3 w-3 mr-1" />WhatsApp all
                  </a>
                </Button>
                <Button
                  size="sm"
                  className="h-7 text-xs"
                  variant={isAssigned ? "secondary" : "default"}
                  onClick={() => {
                    const rec = assign(r.pg);
                    if (rec) {
                      props.onInjectMessages?.(rec.pitch, rec.pgName);
                      toast.success(`${r.pg.name} assigned — verified messages injected`);
                    }
                  }}
                >
                  <CheckCircle2 className="h-3 w-3 mr-1" />{isAssigned ? "Assigned" : "Assign to lead"}
                </Button>
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setOpen(isOpen ? null : r.pg.id)}>
                  {isOpen ? "Hide" : "Preview"} messages
                </Button>
              </div>

              {isOpen && (
                <div className="space-y-2">
                  {kit.map((m) => (
                    <pre key={m.kind} className="whitespace-pre-wrap rounded bg-muted/40 p-2 text-[11px] leading-relaxed">{m.text}</pre>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
