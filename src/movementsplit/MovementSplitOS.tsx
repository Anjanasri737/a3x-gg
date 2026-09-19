// Customer Movement OS as ONE split screen: the Movement OS views on the left,
// and the very same Booking Flow panel on the right — no second page, no tab hop.
import { useEffect, useState } from "react";
import { Compass } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useMovementSync } from "@/movement/bridge";
import { seedMovement } from "@/movement/seed";
import {
  ActiveList, Dashboards, DraftingPanel, JourneyTimeline, UnmatchedQueue, WorkPanel,
} from "@/movement/components";
import { SplitFlow, type SplitFocus } from "@/bf100x/SplitFlow";
import { canonicalCustomerId } from "@/lib/canonical/customer-id";

const WIDTH_KEY = "gharpayy-movement-split-width-pct";
const PRESETS = [40, 50, 60];

export function MovementSplitOS() {
  useEffect(() => { seedMovement(); }, []);
  const { list, nameOf, me } = useMovementSync();
  const [selected, setSelected] = useState<string | null>(null);
  const [tab, setTab] = useState("work");
  const [focus, setFocus] = useState<SplitFocus | undefined>();
  const [leftPct, setLeftPct] = useState(45);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const saved = Number(localStorage.getItem(WIDTH_KEY));
    if (saved >= 25 && saved <= 75) setLeftPct(saved);
  }, []);
  useEffect(() => { localStorage.setItem(WIDTH_KEY, String(leftPct)); }, [leftPct]);
  useEffect(() => {
    if (!dragging) return;
    const move = (e: PointerEvent) => setLeftPct(Math.min(75, Math.max(25, Math.round((e.clientX / window.innerWidth) * 100))));
    const up = () => setDragging(false);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
  }, [dragging]);

  useEffect(() => {
    if (!selected && list.length) openInBookingFlow(list[0].ulid);
  }, [list, selected]);

  // Click a customer anywhere on the left → they open in the booking flow on the
  // right, resolved by the single canonical customer id.
  function openInBookingFlow(ulid: string) {
    setSelected(ulid);
    const m = nameOf.get(ulid);
    setFocus({
      name: m?.name,
      phone: m?.phone,
      canonicalId: canonicalCustomerId({ phone: m?.phone, name: m?.name }),
      key: `${ulid}-${Date.now()}`,
    });
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] w-full flex-col overflow-hidden">
      <div className="flex shrink-0 items-center gap-2 border-b px-2 py-1">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/15">
          <Compass className="h-4 w-4 text-primary" />
        </div>
        <div className="min-w-0">
          <h1 className="truncate text-xs font-semibold leading-tight">Customer Movement OS · Split</h1>
          <p className="truncate text-[10px] leading-tight text-muted-foreground">
            Pick a customer on the left — everything you can do in the booking flow opens on the right
          </p>
        </div>
        <div className="ml-auto flex items-center gap-0.5 rounded-md border px-1 py-0.5">
          <span className="text-[9px] text-muted-foreground">Left</span>
          {PRESETS.map((p) => (
            <button key={p} type="button" onClick={() => setLeftPct(p)}
              className={cn("rounded px-1 text-[9px]", leftPct === p ? "bg-primary/15 text-primary" : "text-muted-foreground")}>
              {p}%
            </button>
          ))}
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-col overflow-y-auto p-2" style={{ width: `${leftPct}%` }}>
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="h-7">
              <TabsTrigger value="work" className="px-2 text-[10px]">Work</TabsTrigger>
              <TabsTrigger value="drafting" className="px-2 text-[10px]">Drafting</TabsTrigger>
              <TabsTrigger value="dashboard" className="px-2 text-[10px]">Dashboards</TabsTrigger>
              <TabsTrigger value="stream" className="px-2 text-[10px]">Journey</TabsTrigger>
              <TabsTrigger value="unmatched" className="px-2 text-[10px]">Unmatched</TabsTrigger>
            </TabsList>

            <TabsContent value="work" className="mt-2 space-y-2">
              <ActiveList list={list} meta={nameOf} selected={selected} onSelect={openInBookingFlow} meId={me.id} />
              <WorkPanel ulid={selected} meta={nameOf} />
              <JourneyTimeline ulid={selected} />
            </TabsContent>

            <TabsContent value="drafting" className="mt-2">
              <DraftingPanel list={list} meta={nameOf} />
            </TabsContent>

            <TabsContent value="dashboard" className="mt-2">
              <Dashboards list={list} meta={nameOf} />
            </TabsContent>

            <TabsContent value="stream" className="mt-2">
              <JourneyTimeline ulid={null} />
            </TabsContent>

            <TabsContent value="unmatched" className="mt-2">
              <UnmatchedQueue />
            </TabsContent>
          </Tabs>
        </div>

        <div
          role="separator"
          aria-label="Drag to resize"
          onPointerDown={() => setDragging(true)}
          className={cn("w-1.5 shrink-0 cursor-col-resize bg-border transition-colors hover:bg-primary", dragging && "bg-primary")}
        />

        <div className="min-w-0 flex-1 overflow-hidden border-l">
          <SplitFlow panelOnly focus={focus} />
        </div>
      </div>
    </div>
  );
}

export default MovementSplitOS;
