// Copy of the Customer Movement OS with the split-screen Booking Flow inside it.
import { useEffect, useState } from "react";
import { Compass } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useMovementSync } from "@/movement/bridge";
import { seedMovement } from "@/movement/seed";
import {
  ActiveList, Dashboards, DraftingPanel, JourneyTimeline, UnmatchedQueue, WorkPanel,
} from "@/movement/components";
import { SplitFlow, type SplitFocus } from "@/bf100x/SplitFlow";

export function MovementSplitOS() {
  useEffect(() => { seedMovement(); }, []);
  const { list, nameOf, me } = useMovementSync();
  const [selected, setSelected] = useState<string | null>(null);
  const [tab, setTab] = useState("split");
  const [focus, setFocus] = useState<SplitFocus | undefined>();

  useEffect(() => {
    if (!selected && list.length) setSelected(list[0].ulid);
  }, [list, selected]);

  // Click a customer anywhere in Movement OS → they open in the booking flow.
  function openInBookingFlow(ulid: string) {
    setSelected(ulid);
    const m = nameOf.get(ulid);
    setFocus({ name: m?.name, phone: m?.phone, key: `${ulid}-${Date.now()}` });
    setTab("split");
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="h-8 w-8 rounded-lg bg-primary/15 flex items-center justify-center">
          <Compass className="h-4 w-4 text-primary" />
        </div>
        <div>
          <h1 className="text-sm font-semibold leading-tight">Customer Movement OS · Split</h1>
          <p className="text-[10px] text-muted-foreground leading-tight">
            Same journey · plus the split-screen booking flow with D1–D4 drafts and your own panel width
          </p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="split">Booking flow (split)</TabsTrigger>
          <TabsTrigger value="work">Work</TabsTrigger>
          <TabsTrigger value="drafting">Drafting</TabsTrigger>
          <TabsTrigger value="dashboard">Dashboards</TabsTrigger>
          <TabsTrigger value="stream">Journey</TabsTrigger>
          <TabsTrigger value="unmatched">Unmatched</TabsTrigger>
        </TabsList>

        <TabsContent value="split" className="mt-3">
          <div className="overflow-hidden rounded-lg border">
            <SplitFlow embedded focus={focus} />
          </div>
        </TabsContent>

        <TabsContent value="work" className="mt-3">
          <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-3">
            <ActiveList list={list} meta={nameOf} selected={selected} onSelect={setSelected} meId={me.id} />
            <div className="space-y-3">
              <WorkPanel ulid={selected} meta={nameOf} />
              <JourneyTimeline ulid={selected} />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="drafting" className="mt-3">
          <DraftingPanel list={list} meta={nameOf} />
        </TabsContent>

        <TabsContent value="dashboard" className="mt-3">
          <Dashboards list={list} meta={nameOf} />
        </TabsContent>

        <TabsContent value="stream" className="mt-3">
          <JourneyTimeline ulid={null} />
        </TabsContent>

        <TabsContent value="unmatched" className="mt-3">
          <UnmatchedQueue />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default MovementSplitOS;
