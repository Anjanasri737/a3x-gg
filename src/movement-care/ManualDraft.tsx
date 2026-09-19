import { useMemo, useState } from "react";
import { ArrowLeftRight, Hand, PlusCircle, Search, Timer, Trash2, UserPlus, Wand2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface ManualCandidate {
  ulid: string;
  name: string;
  phone: string;
  area: string;
  note: string;
  bucket: string;
}

export interface NewLeadInput {
  name: string;
  phone: string;
  area: string;
  budget: string;
  moveIn: string;
  note: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  candidates: ManualCandidate[];
  manualList: string[];
  manualMode: boolean;
  manualSize: number;
  onManualMode: (on: boolean) => void;
  onManualSize: (size: number) => void;
  onAdd: (ulid: string) => void;
  onRemove: (ulid: string) => void;
  onReplace: (outUlid: string, inUlid: string) => void;
  onClear: () => void;
  onCreateLead: (input: NewLeadInput) => void;
  onFillDemo: () => void;
  onStartEmpty: () => void;
  runningFor: string | null;
}

export function ManualDraftPanel({
  open, onClose, candidates, manualList, manualMode, manualSize,
  onManualMode, onManualSize, onAdd, onRemove, onReplace, onClear, onCreateLead, onFillDemo,
  onStartEmpty, runningFor,
}: Props) {
  const [query, setQuery] = useState("");
  const [replacing, setReplacing] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [lead, setLead] = useState<NewLeadInput>({ name: "", phone: "", area: "", budget: "", moveIn: "", note: "" });

  const byId = useMemo(() => new Map(candidates.map((item) => [item.ulid, item])), [candidates]);
  const picked = manualList.map((ulid) => byId.get(ulid)).filter(Boolean) as ManualCandidate[];
  const text = query.trim().toLowerCase();
  const pool = candidates.filter((item) => {
    if (manualList.includes(item.ulid) && replacing === null) return false;
    if (!text) return true;
    return `${item.name} ${item.phone} ${item.area}`.toLowerCase().includes(text);
  });

  if (!open) return null;

  const submitLead = () => {
    if (!lead.name.trim() && !lead.phone.trim()) return;
    onCreateLead(lead);
    setLead({ name: "", phone: "", area: "", budget: "", moveIn: "", note: "" });
    setShowForm(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-background/70 backdrop-blur-sm">
      <div className="flex h-full w-full max-w-3xl flex-col border-l bg-card shadow-xl">
        <header className="flex shrink-0 flex-wrap items-center gap-2 border-b px-3 py-2">
          <Hand className="h-4 w-4 text-primary" />
          <div className="min-w-0">
            <p className="text-sm font-semibold">Draft by hand</p>
            <p className="text-[10px] text-muted-foreground">Add, remove, replace or build the whole list of {manualSize} yourself.</p>
          </div>
          <Button size="sm" variant="ghost" className="ml-auto h-7 px-2" onClick={onClose}><X className="h-4 w-4" /></Button>
        </header>

        <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b px-3 py-2">
          <Button size="sm" variant={manualMode ? "default" : "outline"} className="h-7 text-[10px]" onClick={() => onManualMode(true)}>
            I pick every lead
          </Button>
          <Button size="sm" variant={!manualMode ? "default" : "outline"} className="h-7 text-[10px]" onClick={() => onManualMode(false)}>
            System picks for me
          </Button>
          <span className="ml-2 text-[10px] text-muted-foreground">How many in my draft</span>
          <Input type="number" min={1} max={200} value={manualSize} className="h-7 w-16 text-xs"
            onChange={(event) => onManualSize(Number(event.target.value))} />
          <Badge variant={picked.length >= manualSize ? "default" : "outline"} className="text-[10px]">
            {picked.length} of {manualSize} picked
          </Badge>
          <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={onStartEmpty}>
            <Timer className="h-3 w-3" /> {runningFor ? `Restart · clock ${runningFor}` : `Start with ${manualSize} empty rows`}
          </Button>
          <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={onFillDemo}>
            <Wand2 className="h-3 w-3" /> Demo: fill all {manualSize}
          </Button>
          {picked.length > 0 && (
            <Button size="sm" variant="ghost" className="h-7 text-[10px] text-destructive" onClick={onClear}>Empty the list</Button>
          )}
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-2">
          <section className="min-h-0 overflow-y-auto border-r">
            <div className="sticky top-0 z-10 flex items-center gap-1.5 border-b bg-card px-3 py-2">
              <Search className="h-3.5 w-3.5 text-muted-foreground" />
              <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, number or area"
                className="h-7 border-0 px-0 text-xs shadow-none focus-visible:ring-0" />
              <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => setShowForm((value) => !value)}>
                <UserPlus className="h-3 w-3" /> New lead
              </Button>
            </div>

            {showForm && (
              <div className="border-b bg-muted/30 p-3">
                <p className="text-[10px] font-semibold uppercase text-muted-foreground">Add a lead by hand</p>
                <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                  <Input value={lead.name} onChange={(event) => setLead({ ...lead, name: event.target.value })} placeholder="Name" className="h-8 text-xs" />
                  <Input value={lead.phone} onChange={(event) => setLead({ ...lead, phone: event.target.value })} placeholder="WhatsApp number" className="h-8 text-xs" />
                  <Input value={lead.area} onChange={(event) => setLead({ ...lead, area: event.target.value })} placeholder="Area" className="h-8 text-xs" />
                  <Input value={lead.budget} onChange={(event) => setLead({ ...lead, budget: event.target.value })} placeholder="Budget" className="h-8 text-xs" />
                  <Input value={lead.moveIn} onChange={(event) => setLead({ ...lead, moveIn: event.target.value })} placeholder="Move-in date" className="h-8 text-xs" />
                  <Input value={lead.note} onChange={(event) => setLead({ ...lead, note: event.target.value })} placeholder="Where this lead came from" className="h-8 text-xs" />
                </div>
                <Button size="sm" className="mt-1.5 h-7 text-[10px]" onClick={submitLead}>
                  <PlusCircle className="h-3 w-3" /> Add and put in my draft
                </Button>
              </div>
            )}

            {replacing && (
              <div className="border-b bg-warning/10 px-3 py-1.5 text-[10px]">
                Choose who replaces <span className="font-semibold">{byId.get(replacing)?.name}</span>.
                <Button size="sm" variant="ghost" className="ml-1 h-5 px-1 text-[10px]" onClick={() => setReplacing(null)}>Cancel</Button>
              </div>
            )}

            <div className="divide-y">
              {pool.slice(0, 120).map((item) => (
                <div key={item.ulid} className="flex items-center gap-2 px-3 py-1.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold">{item.name}</p>
                    <p className="truncate text-[10px] text-muted-foreground">{item.phone || "no number"} · {item.area} · {item.note}</p>
                  </div>
                  <Badge variant={item.bucket === "P0" ? "destructive" : "outline"} className="text-[9px]">{item.bucket}</Badge>
                  {replacing ? (
                    <Button size="sm" className="h-6 px-2 text-[10px]"
                      onClick={() => { onReplace(replacing, item.ulid); setReplacing(null); }}>
                      Use this one
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" className="h-6 px-2 text-[10px]" onClick={() => onAdd(item.ulid)}>
                      <PlusCircle className="h-3 w-3" /> Add
                    </Button>
                  )}
                </div>
              ))}
              {pool.length === 0 && <p className="px-3 py-4 text-xs text-muted-foreground">No one matches that search.</p>}
            </div>
          </section>

          <section className="min-h-0 overflow-y-auto">
            <div className="sticky top-0 z-10 border-b bg-card px-3 py-2">
              <p className="text-[10px] font-semibold uppercase text-muted-foreground">My draft</p>
              <p className="text-xs font-medium">{picked.length} picked · {Math.max(0, manualSize - picked.length)} still to choose</p>
            </div>
            <div className="divide-y">
              {picked.map((item, index) => (
                <div key={item.ulid} className={cn("flex items-center gap-2 px-3 py-1.5", replacing === item.ulid && "bg-warning/10")}>
                  <span className="w-5 shrink-0 font-mono text-[10px] text-muted-foreground">{index + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold">{item.name}</p>
                    <p className="truncate text-[10px] text-muted-foreground">{item.phone || "no number"} · {item.area}</p>
                  </div>
                  <Button size="sm" variant="outline" className="h-6 px-2 text-[10px]" onClick={() => setReplacing(item.ulid)}>
                    <ArrowLeftRight className="h-3 w-3" /> Replace
                  </Button>
                  <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px] text-destructive" onClick={() => onRemove(item.ulid)}>
                    <Trash2 className="h-3 w-3" /> Remove
                  </Button>
                </div>
              ))}
              {picked.length === 0 && (
                <p className="px-3 py-4 text-xs text-muted-foreground">
                          You have {manualSize} empty rows. Fill them one at a time while you work — add from the left, add a brand new lead, or use the demo to fill all {manualSize} at once.
                </p>
              )}
            </div>
          </section>
        </div>

        <footer className="flex shrink-0 items-center gap-2 border-t px-3 py-2">
          <p className="text-[10px] text-muted-foreground">
            {manualMode ? "Your queue shows only the leads you picked." : "Turn on “I pick every lead” to work your own list."}
          </p>
          <Button size="sm" className="ml-auto h-7 text-[10px]" onClick={() => { onManualMode(true); onClose(); }}>
            Work this draft
          </Button>
        </footer>
      </div>
    </div>
  );
}
