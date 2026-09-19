// Label console, inside the flow. Suggestions come from the journey answers,
// the catalogue comes from the CRM label library, and every change is logged.
import { useMemo, useState } from "react";
import { Search, Tag, Wand2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { CORE_LABELS, SEVERITY_STYLE } from "@/lib/labels/catalog";
import { LABEL_GROUPS } from "@/lib/labels/groups";
import type { FlowLead } from "@/bookingflow/types";
import { useBookingFlow } from "@/bookingflow/store";
import { QUICK_LABELS, suggestedLabels } from "./suggest";

export function LabelConsole({ lead }: { lead: FlowLead }) {
  const { toggleLabel } = useBookingFlow();
  const [q, setQ] = useState("");
  const [group, setGroup] = useState<string>("ALL");

  const suggested = useMemo(() => suggestedLabels(lead).filter((l) => !lead.labels.includes(l)), [lead]);
  const catalogue = useMemo(
    () =>
      CORE_LABELS.filter(
        (l) =>
          (group === "ALL" || l.group === group) &&
          (!q || `${l.label} ${l.short} ${l.why}`.toLowerCase().includes(q.toLowerCase())),
      ).slice(0, 40),
    [q, group],
  );

  return (
    <div className="space-y-3">
      <Card className="p-3">
        <p className="flex items-center gap-1.5 text-xs font-medium"><Tag className="h-3.5 w-3.5" />On this customer</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {lead.labels.length === 0 && <span className="text-xs text-muted-foreground">Nothing labelled yet — pick from below.</span>}
          {lead.labels.map((l) => (
            <button key={l} type="button" onClick={() => toggleLabel(lead.id, l)}
              className="rounded-full border border-primary bg-primary/15 px-2.5 py-1 text-[11px] text-primary">
              {l} ×
            </button>
          ))}
        </div>
      </Card>

      {suggested.length > 0 && (
        <Card className="p-3">
          <p className="flex items-center gap-1.5 text-xs font-medium"><Wand2 className="h-3.5 w-3.5" />Suggested from what already happened</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {suggested.map((l) => (
              <button key={l} type="button" onClick={() => toggleLabel(lead.id, l)}
                className="rounded-full border border-dashed px-2.5 py-1 text-[11px] text-muted-foreground hover:bg-accent">
                + {l}
              </button>
            ))}
          </div>
        </Card>
      )}

      <Card className="p-3">
        <p className="text-xs font-medium">Quick labels</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {QUICK_LABELS.map((l) => (
            <button key={l} type="button" onClick={() => toggleLabel(lead.id, l)}
              className={cn("rounded-full border px-2.5 py-1 text-[11px]",
                lead.labels.includes(l) ? "border-primary bg-primary/15 text-primary" : "text-muted-foreground hover:bg-accent")}>
              {l}
            </button>
          ))}
        </div>
      </Card>

      <Card className="p-3">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs font-medium">CRM label library</p>
          <div className="relative ml-auto">
            <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
            <Input className="h-8 w-44 pl-7 text-xs" placeholder="Search labels" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </div>
        <div className="mt-2 flex flex-wrap gap-1">
          <Button size="sm" variant={group === "ALL" ? "secondary" : "ghost"} className="h-7 px-2 text-[11px]" onClick={() => setGroup("ALL")}>All</Button>
          {LABEL_GROUPS.map((g) => (
            <Button key={g.id} size="sm" variant={group === g.id ? "secondary" : "ghost"} className="h-7 px-2 text-[11px]" onClick={() => setGroup(g.id)}>
              {g.title}
            </Button>
          ))}
        </div>
        <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
          {catalogue.map((l) => (
            <button key={l.id} type="button" onClick={() => toggleLabel(lead.id, l.short)}
              className={cn("rounded-md border p-2 text-left text-[11px] transition hover:border-primary hover:bg-accent",
                lead.labels.includes(l.short) && "border-primary bg-primary/10")}>
              <span className="flex items-center gap-1.5">
                <span className="font-medium">{l.short}</span>
                <Badge variant="outline" className={cn("text-[9px]", SEVERITY_STYLE[l.severity])}>{l.severity}</Badge>
              </span>
              <span className="mt-0.5 block text-muted-foreground">{l.label}</span>
            </button>
          ))}
        </div>
      </Card>
    </div>
  );
}
