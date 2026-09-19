// The switch at the top of the control room: Founder admin or Team admin.
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Crown, ShieldCheck } from "lucide-react";
import { useViewer, type ViewerRole } from "./viewer";

export function ViewerBar({ options }: { options: { zones: string[]; accounts: string[]; people: string[] } }) {
  const v = useViewer();
  const isAdmin = v.role === "admin";
  const scopeSet = v.zones.length > 0 || v.accounts.length > 0;

  const pick = (role: ViewerRole) => v.setRole(role);

  return (
    <section className="rounded-xl border bg-card p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Viewing as</span>
        <Button size="sm" variant={!isAdmin ? "default" : "outline"} className="h-7 px-2 text-xs" onClick={() => pick("founder")}>
          <Crown className="mr-1 h-3.5 w-3.5" /> Founder admin
        </Button>
        <Button size="sm" variant={isAdmin ? "default" : "outline"} className="h-7 px-2 text-xs" onClick={() => pick("admin")}>
          <ShieldCheck className="mr-1 h-3.5 w-3.5" /> Team admin
        </Button>

        {isAdmin ? (
          <>
            <Input value={v.name} onChange={(e) => v.setName(e.target.value)} placeholder="Admin name"
              className="h-7 w-36 text-xs" />
            <Badge variant="outline" className={cn(scopeSet ? "border-emerald-500/40 text-emerald-600" : "border-amber-500/40 text-amber-600")}>
              {scopeSet ? `${v.zones.length || "all"} areas · ${v.accounts.length || "all"} accounts` : "Scope not set"}
            </Badge>
            <span className="text-[11px] text-muted-foreground">
              Sees only their own areas and accounts. Money, people quality, full history and Control Tower escalation stay with the founder.
            </span>
            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => v.clearScope()}>Clear scope</Button>
          </>
        ) : (
          <span className="text-[11px] text-muted-foreground">Full company view, every power, every number.</span>
        )}
      </div>

      {isAdmin && (
        <div className="mt-2 space-y-1.5">
          <Chips label="Areas" all={options.zones} picked={v.zones} onToggle={v.toggleZone} />
          <Chips label="WhatsApp accounts" all={options.accounts} picked={v.accounts} onToggle={v.toggleAccount} />
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="w-28 shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">Their person</span>
            <Button size="sm" variant={v.person ? "outline" : "default"} className="h-6 px-2 text-[11px]" onClick={() => v.setPerson("")}>
              Whole team
            </Button>
            {options.people.slice(0, 12).map((p) => (
              <Button key={p} size="sm" variant={v.person === p ? "default" : "outline"} className="h-6 px-2 text-[11px]"
                onClick={() => v.setPerson(v.person === p ? "" : p)}>{p}</Button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function Chips({ label, all, picked, onToggle }: { label: string; all: string[]; picked: string[]; onToggle: (v: string) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="w-28 shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
      {all.length === 0 && <span className="text-[11px] text-muted-foreground">Nothing recorded yet.</span>}
      {all.slice(0, 24).map((item) => (
        <Button key={item} size="sm" variant={picked.includes(item) ? "default" : "outline"} className="h-6 px-2 text-[11px]"
          onClick={() => onToggle(item)}>{item}</Button>
      ))}
    </div>
  );
}
