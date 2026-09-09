// Work pool — operators pick leads, not screenshots.
// A number claimed by anyone is locked for everyone else.
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Lock, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMovement } from "@/movement/store";
import { useOcrEngine, type OcrCustomer } from "./engine";

type Filt = "all" | "hot" | "unread" | "stuck" | "new" | "available" | "mine";

const FILTERS: Array<[Filt, string]> = [
  ["all", "All"], ["available", "Available"], ["hot", "Hot"], ["unread", "Unread"],
  ["stuck", "Stuck"], ["new", "First seen"], ["mine", "Mine"],
];

export function WorkPool({ onOpen }: { onOpen?: (id: string) => void }) {
  const eng = useOcrEngine();
  const me = useMovement((s) => s.actor);
  const [q, setQ] = useState("");
  const [filt, setFilt] = useState<Filt>("available");
  const [sel, setSel] = useState<string[]>([]);

  const holderOf = (id: string) => {
    const c = eng.claims[id];
    if (!c || c.status !== "active" || +new Date(c.expiresAt) <= Date.now()) return null;
    return c;
  };

  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    const d = term.replace(/\D/g, "");
    return Object.values(eng.customers)
      .filter((c) => !c.rejected && c.identityState !== "invalid")
      .filter((c) => {
        const h = holderOf(c.id);
        switch (filt) {
          case "hot": return c.intent === "hot";
          case "unread": return c.unread > 0;
          case "stuck": return c.health === "stuck";
          case "new": return c.appearances === 1;
          case "available": return !h;
          case "mine": return h?.ownerId === me.id;
          default: return true;
        }
      })
      .filter((c) =>
        !term ? true : d.length >= 3 ? (c.normalizedPhone ?? "").includes(d) : (c.name ?? "").toLowerCase().includes(term),
      )
      .sort((a, b) => +new Date(b.lastSeen) - +new Date(a.lastSeen));
  }, [eng.customers, eng.claims, q, filt, me.id]);

  const claimSelected = () => {
    let ok = 0;
    let blocked = 0;
    sel.forEach((id) => {
      const r = eng.claim(id, { id: me.id, name: me.name }, eng.customers[id]?.draft);
      r.ok ? ok++ : blocked++;
    });
    setSel([]);
    toast.success(`${ok} lead${ok === 1 ? "" : "s"} claimed${blocked ? ` · ${blocked} already held` : ""}`);
  };

  const startNext = (n: number) => {
    const pick = list.filter((c) => !holderOf(c.id)).slice(0, n).map((c) => c.id);
    setSel(pick);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3">
        <Search className="h-4 w-4 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search number or name"
          className="h-8 w-56 text-xs"
        />
        {FILTERS.map(([f, label]) => (
          <Button key={f} size="sm" variant={filt === f ? "default" : "outline"} className="h-7 text-[11px]" onClick={() => setFilt(f)}>
            {label}
          </Button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => startNext(15)}>Next 15</Button>
          <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => startNext(30)}>Next 30</Button>
          <Button size="sm" className="h-7 text-[11px]" disabled={!sel.length} onClick={claimSelected}>
            Claim {sel.length || ""}
          </Button>
        </div>
      </div>

      <div className="rounded-xl border bg-card">
        <div className="border-b p-2 text-[11px] text-muted-foreground">
          {list.length} leads · {list.filter((c) => !holderOf(c.id)).length} available
        </div>
        <ul className="max-h-[60vh] divide-y overflow-y-auto">
          {list.map((c) => {
            const held = holderOf(c.id);
            const mine = held?.ownerId === me.id;
            return (
              <li key={c.id} className={cn("flex items-start gap-2 p-2", held && !mine && "opacity-70")}>
                <Checkbox
                  className="mt-1"
                  disabled={!!held && !mine}
                  checked={sel.includes(c.id)}
                  onCheckedChange={(v) => setSel((s) => (v ? [...s, c.id] : s.filter((x) => x !== c.id)))}
                />
                <button className="flex-1 text-left" onClick={() => onOpen?.(c.id)}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{c.name ?? c.normalizedPhone ?? "Unknown"}</span>
                    {c.normalizedPhone && <span className="font-mono text-[11px] text-muted-foreground">{c.normalizedPhone}</span>}
                    <Badge variant="outline" className="h-4 text-[9px]">{c.draft}</Badge>
                    <Badge variant={c.intent === "hot" ? "default" : "secondary"} className="h-4 text-[9px]">{c.intent}</Badge>
                    {c.unread > 0 && <Badge className="h-4 text-[9px]">{c.unread} unread</Badge>}
                    {c.appearances > 1 && <Badge variant="outline" className="h-4 text-[9px]">seen {c.appearances}×</Badge>}
                    {!c.normalizedPhone && <Badge variant="outline" className="h-4 text-[9px]">name only</Badge>}
                  </div>
                  <div className="truncate text-[11px] text-muted-foreground">{c.lastMessage ?? "No preview"}</div>
                  {c.stuckReason && <div className="text-[11px] text-destructive">{c.stuckReason}</div>}
                </button>
                <div className="shrink-0 text-right">
                  {held ? (
                    <Badge variant={mine ? "default" : "outline"} className="gap-1 text-[10px]">
                      <Lock className="h-3 w-3" /> {mine ? "Yours" : held.ownerName}
                    </Badge>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-[11px]"
                      onClick={() => {
                        const r = eng.claim(c.id, { id: me.id, name: me.name }, c.draft);
                        toast[r.ok ? "success" : "error"](r.ok ? `Claimed ${c.name ?? c.normalizedPhone}` : `Held by ${r.heldBy}`);
                      }}
                    >
                      Claim
                    </Button>
                  )}
                  <div className="pt-1 text-[10px] text-muted-foreground">{new Date(c.lastSeen).toLocaleDateString()}</div>
                </div>
              </li>
            );
          })}
          {!list.length && <li className="p-6 text-center text-xs text-muted-foreground">No leads yet — add screenshots.</li>}
        </ul>
      </div>
    </div>
  );
}

export type { OcrCustomer };
