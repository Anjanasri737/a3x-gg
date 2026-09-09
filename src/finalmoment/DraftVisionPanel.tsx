// Draft Vision — paste a WhatsApp screenshot, get draft-ready leads.
import { useRef, useState } from "react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { ScanLine, Loader2, ImagePlus, ShieldAlert } from "lucide-react";
import { extractWhatsappRows } from "@/lib/draft-vision.functions";
import { useMovement } from "@/movement/store";
import type { MovementState } from "@/movement/types";
import { buildVisionRows, type VisionRow } from "./vision";
import { ingestMessage, WA_ACCOUNTS } from "./bridge";

interface Props {
  onAdd: (s: MovementState) => void;
  inDraft: (ulid: string) => boolean;
  remaining: number;
}

const CLASS_STYLE: Record<VisionRow["classification"], string> = {
  new: "bg-primary/10 text-primary border-primary/30",
  existing: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30",
  duplicate: "bg-muted text-muted-foreground",
  locked: "bg-destructive/10 text-destructive border-destructive/30",
  "needs-review": "bg-amber-500/10 text-amber-600 border-amber-500/30",
};

const pct = (n: number) => `${Math.round(n * 100)}%`;

const fileToDataUrl = (f: File) =>
  new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(new Error("Could not read image"));
    r.readAsDataURL(f);
  });

export function DraftVisionPanel({ onAdd, inDraft, remaining }: Props) {
  const mv = useMovement();
  const extract = useServerFn(extractWhatsappRows);
  const [shots, setShots] = useState<string[]>([]);
  const [rows, setRows] = useState<VisionRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [account, setAccount] = useState<string>(WA_ACCOUNTS[0]);
  const fileRef = useRef<HTMLInputElement>(null);

  const takeFiles = async (files: File[]) => {
    const imgs = files.filter((f) => f.type.startsWith("image/")).slice(0, 6);
    if (!imgs.length) return;
    const urls = await Promise.all(imgs.map(fileToDataUrl));
    setShots((s) => [...s, ...urls].slice(0, 6));
    toast.success(`${urls.length} screenshot${urls.length > 1 ? "s" : ""} attached`);
  };

  const onPaste = (e: React.ClipboardEvent) => {
    const files = Array.from(e.clipboardData.files);
    if (files.length) {
      e.preventDefault();
      void takeFiles(files);
    }
  };

  const run = async () => {
    if (!shots.length) return;
    setBusy(true);
    try {
      const capturedAt = new Date().toISOString();
      const screenshotId = `shot-${Date.now()}`;
      const out = await extract({ data: { images: shots } });
      const built = buildVisionRows(out.rows, {
        capturedAt,
        screenshotId,
        waAccount: account,
        alreadyPicked: Object.values(mv.states).filter((s) => inDraft(s.ulid)).map((s) => s.ulid),
      });
      setRows(built);
      if (!built.length) toast.error("No chat rows detected — try a sharper, uncropped screenshot.");
      else toast.success(`${built.length} chat rows detected`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Screenshot reading failed");
    } finally {
      setBusy(false);
    }
  };

  const toggle = (id: string) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, include: !r.include } : r)));

  const resolveTo = (id: string, ulid: string) =>
    setRows((rs) =>
      rs.map((r) =>
        r.id === id
          ? { ...r, ulid, identity: "name-context", identityConfidence: 0.9, classification: "existing", include: true }
          : r,
      ),
    );

  const addSelected = () => {
    const picked = rows.filter((r) => r.include);
    let added = 0;
    let skipped = 0;
    for (const r of picked) {
      if (added >= remaining) { skipped++; continue; }
      let ulid = r.ulid;
      if (!ulid) {
        const phone = r.phoneDigits && r.phoneDigits.length >= 10
          ? r.phoneDigits
          : `WA${r.screenshotId.slice(-6)}${String(r.raw.position).padStart(2, "0")}`;
        const created = ingestMessage({
          phoneRaw: phone,
          waAccount: r.waAccount,
          name: r.name ?? undefined,
          text: r.raw.lastMessageText ?? undefined,
          agoMins: r.ageMins ?? undefined,
        });
        ulid = created.ulid ?? null;
      }
      if (!ulid) { skipped++; continue; }
      const st = useMovement.getState().states[ulid];
      if (!st) { skipped++; continue; }
      mv.log(
        ulid,
        "note",
        `Draft Vision: read from screenshot ${r.screenshotId} row ${r.raw.position} · "${r.timestampText ?? "no time"}" · identity ${r.identity} ${pct(r.identityConfidence)} · OCR ${pct(r.ocrConfidence)} · suggested ${r.draft}`,
      );
      mv.markWaDraft(ulid, r.draft);
      onAdd(st);
      added++;
    }
    toast.success(`${added} leads added to the draft pool${skipped ? ` · ${skipped} skipped` : ""}`);
    setRows((rs) => rs.map((r) => ({ ...r, include: false })));
  };

  const selected = rows.filter((r) => r.include).length;

  return (
    <section
      className="space-y-3 rounded-xl border bg-card p-4"
      onPaste={onPaste}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => { e.preventDefault(); void takeFiles(Array.from(e.dataTransfer.files)); }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <ScanLine className="h-4 w-4 text-primary" /> Draft Vision — paste a WhatsApp screenshot
          </h2>
          <p className="text-xs text-muted-foreground">
            Every chat row is read as a record: name, number, preview, unread, pinned, visible time. No phone number needed.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="h-8 rounded-md border bg-background px-2 text-xs"
            value={account}
            onChange={(e) => setAccount(e.target.value)}
          >
            {WA_ACCOUNTS.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => void takeFiles(Array.from(e.target.files ?? []))}
          />
          <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
            <ImagePlus className="mr-1 h-3.5 w-3.5" /> Add image
          </Button>
          <Button size="sm" disabled={!shots.length || busy} onClick={() => void run()}>
            {busy ? <><Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> Reading…</> : `Read ${shots.length || ""} screenshot${shots.length === 1 ? "" : "s"}`}
          </Button>
        </div>
      </div>

      {!shots.length ? (
        <div className="rounded-lg border border-dashed p-6 text-center text-xs text-muted-foreground">
          Click here and press Ctrl/Cmd + V, or drop the screenshot anywhere in this box.
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {shots.map((s, i) => (
            <div key={i} className="relative">
              <img src={s} alt={`WhatsApp screenshot ${i + 1}`} className="h-20 w-32 rounded border object-cover" />
              <button
                className="absolute right-1 top-1 rounded bg-background/90 px-1 text-[10px]"
                onClick={() => setShots((x) => x.filter((_, j) => j !== i))}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {!!rows.length && (
        <>
          <Separator />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-2 text-[11px]">
              {(["new", "existing", "duplicate", "locked", "needs-review"] as const).map((c) => (
                <Badge key={c} variant="outline" className={cn("capitalize", CLASS_STYLE[c])}>
                  {rows.filter((r) => r.classification === c).length} {c.replace("-", " ")}
                </Badge>
              ))}
            </div>
            <Button size="sm" disabled={!selected} onClick={addSelected}>
              Add {Math.min(selected, remaining)} to draft pool
            </Button>
          </div>

          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-xs">
              <thead className="bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="w-8 px-2 py-2"></th>
                  <th className="px-2 py-2 text-left">#</th>
                  <th className="px-2 py-2 text-left">Chat</th>
                  <th className="px-2 py-2 text-left">Preview</th>
                  <th className="px-2 py-2 text-left">Seen time</th>
                  <th className="px-2 py-2 text-left">Identity</th>
                  <th className="px-2 py-2 text-left">Status</th>
                  <th className="px-2 py-2 text-left">Draft</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((r) => (
                  <tr key={r.id} className={cn("align-top", !r.include && "opacity-60")}>
                    <td className="px-2 py-2">
                      <input
                        type="checkbox"
                        checked={r.include}
                        disabled={r.classification === "locked" || r.classification === "duplicate"}
                        onChange={() => toggle(r.id)}
                      />
                    </td>
                    <td className="px-2 py-2 font-mono text-muted-foreground">{r.raw.position}</td>
                    <td className="px-2 py-2">
                      <div className="font-medium">{r.name ?? "Unknown"}</div>
                      <div className="font-mono text-[10px] text-muted-foreground">
                        {r.phoneDigits ? `···${r.phoneDigits.slice(-4)}` : "no number visible"}
                        {r.unread > 0 && <span className="ml-1 text-emerald-600">{r.unread} unread</span>}
                        {r.pinned && <span className="ml-1">📌</span>}
                        {r.isGroup && <span className="ml-1">group</span>}
                      </div>
                    </td>
                    <td className="max-w-[220px] px-2 py-2">
                      <div className="truncate">{r.raw.lastMessageText ?? "—"}</div>
                      <div className="text-[10px] text-muted-foreground">OCR {pct(r.ocrConfidence)}</div>
                    </td>
                    <td className="px-2 py-2">
                      <div className="font-mono">{r.timestampText ?? "—"}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {r.timestampPrecision}
                        {r.ageMins != null && ` · ${r.ageMins < 60 ? `${r.ageMins}m` : `${Math.round(r.ageMins / 60)}h`} old`}
                      </div>
                    </td>
                    <td className="px-2 py-2">
                      <div className="capitalize">{r.identity.replace("-", " ")}</div>
                      <div className="text-[10px] text-muted-foreground">{pct(r.identityConfidence)}</div>
                      {r.identity === "ambiguous" && (
                        <div className="mt-1 flex flex-col gap-1">
                          {r.candidates.slice(0, 3).map((c) => (
                            <button
                              key={c}
                              className="rounded border px-1 py-0.5 text-left text-[10px] hover:bg-muted"
                              onClick={() => resolveTo(r.id, c)}
                            >
                              use {mv.states[c]?.name ?? c.slice(-6)}
                            </button>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-2 py-2">
                      <Badge variant="outline" className={cn("capitalize", CLASS_STYLE[r.classification])}>
                        {r.classification.replace("-", " ")}
                      </Badge>
                      {r.lockedBy && (
                        <div className="mt-1 flex items-center gap-1 text-[10px] text-destructive">
                          <ShieldAlert className="h-3 w-3" /> {r.lockedBy}
                        </div>
                      )}
                      {r.existingDraft && (
                        <div className="text-[10px] text-muted-foreground">in {r.existingDraft}</div>
                      )}
                    </td>
                    <td className="px-2 py-2">
                      <Badge variant="secondary">{r.draft}</Badge>
                      <div className="text-[10px] text-muted-foreground">{pct(r.draftConfidence)}</div>
                      <div className="mt-1 max-w-[160px] text-[10px] text-muted-foreground">
                        {r.reasons.slice(0, 2).join(" · ")}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
