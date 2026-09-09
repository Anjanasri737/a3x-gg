// Draft Vision 2.0 inside the CRM — one place for every operator's WhatsApp.
import { useEffect, useMemo, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Ingest } from "./Ingest";
import { WorkPool } from "./WorkPool";
import { Lookup } from "./Lookup";
import { Accuracy } from "./Accuracy";
import { useOcrEngine } from "./engine";

export function VisionHub({ scope }: { scope: "user" | "admin" | "tower" }) {
  const purge = useOcrEngine((s) => s.purgeExpiredRaw);
  const [tab, setTab] = useState("pool");
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    purge();
  }, [purge]);

  const title =
    scope === "tower" ? "Control Tower · Draft Vision" : scope === "admin" ? "Admin · Draft Vision" : "Draft Vision";

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 p-3 sm:p-5">
      <header className="rounded-xl border bg-card p-4">
        <h1 className="text-xl font-bold tracking-tight">{title}</h1>
        <p className="text-xs text-muted-foreground">
          Screenshots are temporary. Chat observations are permanent. One number is always one customer, and a claimed
          number is locked for everybody else.
        </p>
      </header>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex flex-wrap">
          <TabsTrigger value="pool">Work pool</TabsTrigger>
          <TabsTrigger value="ingest">Add screenshots</TabsTrigger>
          <TabsTrigger value="lookup">Lead lookup</TabsTrigger>
          <TabsTrigger value="accuracy">Accuracy</TabsTrigger>
          {scope !== "user" && <TabsTrigger value="inflow">Lead inflow</TabsTrigger>}
        </TabsList>

        <TabsContent value="pool" className="pt-3">
          <WorkPool
            onOpen={(id) => {
              setOpen(id);
              setTab("lookup");
            }}
          />
        </TabsContent>
        <TabsContent value="ingest" className="pt-3"><Ingest scope={scope} /></TabsContent>
        <TabsContent value="lookup" className="pt-3"><Lookup preset={open} /></TabsContent>
        <TabsContent value="accuracy" className="pt-3"><Accuracy /></TabsContent>
        {scope !== "user" && (
          <TabsContent value="inflow" className="pt-3"><Inflow /></TabsContent>
        )}
      </Tabs>
    </div>
  );
}

function Inflow() {
  const eng = useOcrEngine();
  const rows = useMemo(() => {
    const byDay = new Map<string, { obs: number; uniq: Set<string>; first: Set<string> }>();
    eng.observations.forEach((o) => {
      const day = new Date(o.capturedAt).toISOString().slice(0, 10);
      const rec = byDay.get(day) ?? { obs: 0, uniq: new Set<string>(), first: new Set<string>() };
      rec.obs += o.seenCount;
      rec.uniq.add(o.customerId);
      const c = eng.customers[o.customerId];
      if (c && c.firstSeen.slice(0, 10) === day) rec.first.add(o.customerId);
      byDay.set(day, rec);
    });
    return [...byDay.entries()]
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([day, r]) => ({ day, obs: r.obs, uniq: r.uniq.size, first: r.first.size, existing: r.uniq.size - r.first.size }));
  }, [eng.observations, eng.customers]);

  return (
    <div className="rounded-xl border bg-card p-4">
      <h3 className="text-sm font-semibold">Lead input trend</h3>
      <table className="w-full text-xs">
        <thead className="text-left text-muted-foreground">
          <tr><th className="py-1">Date</th><th>Chat observations</th><th>Unique leads</th><th>First-seen</th><th>Existing</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.day} className="border-t">
              <td className="py-1">{r.day}</td><td>{r.obs}</td><td>{r.uniq}</td><td>{r.first}</td><td>{r.existing}</td>
            </tr>
          ))}
          {!rows.length && <tr><td colSpan={5} className="py-3 text-muted-foreground">No screenshots processed yet.</td></tr>}
        </tbody>
      </table>
      <p className="pt-2 text-[11px] text-muted-foreground">
        “First-seen” is when our screenshots first showed the number — not necessarily when the customer first wrote.
      </p>
    </div>
  );
}
