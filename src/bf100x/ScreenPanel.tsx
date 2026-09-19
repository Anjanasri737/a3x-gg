// Four or five questions on one screen. Same options, same rules, fewer clicks.
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, Lock } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { isExtraRequired, isStepDone, missingOn } from "@/bookingflow/journey";
import type { JStep } from "@/bookingflow/journey";
import type { FlowLead } from "@/bookingflow/types";
import { useBookingFlow } from "@/bookingflow/store";
import { SCREENS, currentScreen, screenIndex, screenProgress } from "./screens";
import type { Screen } from "./screens";

const inputType = (kind: JStep["kind"] | "TEXT" | "NUMBER" | "DATE" | "DATETIME") =>
  kind === "DATE" ? "date" : kind === "DATETIME" ? "datetime-local" : kind === "NUMBER" ? "number" : "text";

export function ScreenPanel({ lead, screen, expert }: { lead: FlowLead; screen: Screen; expert: boolean }) {
  const { answerStep, editFields } = useBookingFlow();
  const f = lead.f ?? {};
  const [draft, setDraft] = useState<Record<string, string>>({});

  useEffect(() => setDraft({}), [screen.id, lead.id]);

  const now = currentScreen(f);
  const idx = screenIndex(screen.id);
  const nowIdx = screenIndex(now.id);
  const locked = idx > nowIdx && !expert;
  const p = screenProgress(f, screen);
  const val = (k: string) => draft[k] ?? f[k] ?? "";
  const put = (k: string, v: string) => setDraft((s) => ({ ...s, [k]: v }));

  const merged = useMemo(() => ({ ...f, ...draft }), [f, draft]);

  function saveAll() {
    const touched = screen.steps.filter((st) =>
      [st.field, ...(st.extra ?? []).map((x) => x.field)].some((k) => draft[k] !== undefined && draft[k] !== f[k]),
    );
    if (touched.length === 0) {
      toast.error("Answer at least one question on this screen first");
      return;
    }
    // block a half-filled step instead of saving nonsense
    for (const st of touched) {
      const main = merged[st.field];
      if (!main) { toast.error(`${st.title} still needs an answer`); return; }
      const missingExtra = (st.extra ?? []).filter((x) => !merged[x.field] && isExtraRequired(merged, st, x.field));
      if (missingExtra.length) { toast.error(`${st.title}: also fill ${missingExtra.map((m) => m.label).join(", ")}`); return; }
    }
    touched.forEach((st) => {
      const payload: Record<string, string> = {};
      [st.field, ...(st.extra ?? []).map((x) => x.field)].forEach((k) => {
        if (draft[k] !== undefined) payload[k] = draft[k]!;
      });
      if (isStepDone(f, st)) editFields(lead.id, payload, "corrected on the 100x screen");
      else answerStep(lead.id, st.key, payload);
    });
    setDraft({});
    toast.success(`${touched.length} ${touched.length === 1 ? "answer" : "answers"} saved on one screen`);
  }

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="text-[10px]">Screen {idx + 1} of {SCREENS.length}</Badge>
        <Badge variant="secondary" className="text-[10px]">{screen.title}</Badge>
        <Badge variant="outline" className="text-[10px]">{p.done}/{p.total} answered</Badge>
        {locked && <Badge variant="outline" className="text-[10px]"><Lock className="mr-1 h-3 w-3" />Opens after “{now.title}”</Badge>}
        {idx === nowIdx && <Badge className="text-[10px]">Do this now</Badge>}
      </div>

      {locked ? (
        <p className="mt-3 rounded-md border border-dashed p-3 text-xs text-muted-foreground">
          Finish “{now.title}” first. Still needed there: {now.steps.flatMap((s) => missingOn(f, s)).join(", ") || "an answer"}.
        </p>
      ) : (
        <div className="mt-3 space-y-3">
          {screen.steps.map((st, i) => {
            const done = isStepDone(f, st);
            return (
              <div key={st.key} className={cn("rounded-lg border p-3", done && "bg-muted/30")}>
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="text-xs text-muted-foreground">{i + 1}.</span>
                  <p className="text-sm font-medium">{st.question}</p>
                  {done && <Badge className="bg-primary/15 text-[10px] text-primary hover:bg-primary/15"><Check className="mr-1 h-3 w-3" />done</Badge>}
                  <span className="ml-auto text-[10px] text-muted-foreground">waiting on {st.waitingOn}</span>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">{st.help}</p>

                {st.kind === "CHOICE" ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {st.options?.map((o) => (
                      <button
                        key={o.value}
                        type="button"
                        onClick={() => put(st.field, o.value)}
                        title={o.hint}
                        className={cn(
                          "rounded-full border px-2.5 py-1 text-[11px] transition",
                          val(st.field) === o.value ? "border-primary bg-primary/15 text-primary" : "text-muted-foreground hover:bg-accent",
                          o.effect && "border-destructive/50",
                        )}
                      >
                        {o.label}{o.effect === "ESCALATE" ? " → Tower" : o.effect === "CLOSE" ? " → closes" : ""}
                      </button>
                    ))}
                  </div>
                ) : (
                  <Input
                    className="mt-2 h-8 max-w-xs text-xs"
                    type={inputType(st.kind)}
                    placeholder={st.placeholder}
                    value={val(st.field)}
                    onChange={(e) => put(st.field, e.target.value)}
                  />
                )}

                <div className="mt-2 flex flex-wrap gap-2">
                  {(st.extra ?? []).map((x) => (
                    <label key={x.field} className="text-[11px]">
                      <span className="text-muted-foreground">{x.label}</span>
                      <Input
                        className="mt-1 h-8 w-[13rem] text-xs"
                        type={inputType(x.kind)}
                        placeholder={x.placeholder}
                        value={val(x.field)}
                        onChange={(e) => put(x.field, e.target.value)}
                      />
                    </label>
                  ))}
                </div>

                {!done && missingOn(merged, st).length > 0 && (
                  <p className="mt-1.5 flex items-center gap-1 text-[11px] text-destructive">
                    <AlertTriangle className="h-3 w-3" />Still missing: {missingOn(merged, st).join(", ")}
                  </p>
                )}
              </div>
            );
          })}

          <div className="flex flex-wrap items-center gap-2 border-t pt-3">
            <Button size="sm" onClick={saveAll}>Save this screen</Button>
            <Button size="sm" variant="ghost" onClick={() => setDraft({})} disabled={Object.keys(draft).length === 0}>Clear my edits</Button>
            <span className="text-[11px] text-muted-foreground">
              One save writes every answer on this screen to the timeline.
            </span>
          </div>
        </div>
      )}
    </Card>
  );
}
