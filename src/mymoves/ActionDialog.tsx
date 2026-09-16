// One dialog renders every action. Questions come from the workflow config, so
// hard blocks, warnings and mandatory answers behave identically everywhere.
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Ban } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Lead } from "./types";
import { ACTIONS, WHEN_OPTIONS } from "./workflow";
import { useMyMoves } from "./store";

export function ActionDialog({ lead, actionId, onClose }: { lead: Lead; actionId: string | null; onClose: () => void }) {
  const emit = useMyMoves((s) => s.emit);
  const action = actionId ? ACTIONS[actionId] : undefined;
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [override, setOverride] = useState("");

  useEffect(() => { setAnswers({}); setOverride(""); }, [actionId]);

  const blocked = useMemo(() => action?.blockedBy?.(lead) ?? [], [action, lead]);
  const warning = useMemo(() => action?.warnIf?.(lead) ?? null, [action, lead]);
  const prompts = action?.prompts ?? [];
  const missing = prompts.filter((p) => !p.optional && !answers[p.id]);
  const canSubmit = blocked.length === 0 && missing.length === 0 && (!warning || override.trim().length > 3);

  if (!action) return null;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base">{action.label}</DialogTitle>
        </DialogHeader>

        {blocked.length > 0 && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
            <div className="mb-1 flex items-center gap-2 font-medium text-destructive">
              <Ban className="size-4" /> Cannot continue — this would damage the customer experience
            </div>
            <ul className="list-inside list-disc text-muted-foreground">
              {blocked.map((b) => <li key={b}>{b}</li>)}
            </ul>
          </div>
        )}

        {warning && (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
            <div className="mb-1 flex items-center gap-2 font-medium text-amber-600">
              <AlertTriangle className="size-4" /> {warning}
            </div>
            <Textarea value={override} onChange={(e) => setOverride(e.target.value)} placeholder="Reason for continuing anyway (recorded in history)" />
          </div>
        )}

        {blocked.length === 0 && prompts.map((p) => (
          <div key={p.id} className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              {p.q}{p.optional ? " (optional)" : ""}
            </Label>
            {p.kind === "choice" || p.kind === "when" ? (
              <div className="flex flex-wrap gap-1.5">
                {(p.kind === "when" ? WHEN_OPTIONS : p.options ?? []).map((o) => (
                  <Button key={o} size="sm" variant={answers[p.id] === o ? "default" : "outline"}
                    onClick={() => setAnswers((a) => ({ ...a, [p.id]: o }))}>{o}</Button>
                ))}
              </div>
            ) : (
              <Input type={p.kind === "number" ? "number" : p.kind === "date" ? "date" : "text"}
                placeholder={p.placeholder} value={answers[p.id] ?? ""}
                onChange={(e) => setAnswers((a) => ({ ...a, [p.id]: e.target.value }))} />
            )}
          </div>
        ))}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button disabled={!canSubmit} onClick={() => { emit(lead.id, action.id, answers, override || undefined); onClose(); }}>
            {missing.length ? `${missing.length} answer${missing.length === 1 ? "" : "s"} needed` : "Confirm"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
