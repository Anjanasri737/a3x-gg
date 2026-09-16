// Draft Vision — paste a WhatsApp screenshot, get draft-ready leads.
import { useRef, useState } from "react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { CheckCheck, ImagePlus, Loader2, MoreVertical, Pin, ScanLine, Search, ShieldAlert, Users } from "lucide-react";
import { extractWhatsappRows } from "@/lib/draft-vision.functions";
import { useMovement } from "@/movement/store";
import type { MovementState } from "@/movement/types";
import { buildVisionRows, type VisionRow } from "./vision";
import { ingestMessage, WA_ACCOUNTS } from "./bridge";
import { LeadStoryByPhone } from "@/components/lead-os/LeadStoryByPhone";

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

async function cropAvatar(dataUrl: string, crop: VisionRow["raw"]["avatarCrop"]): Promise<string | null> {
  if (!crop) return null;
  const widthPct = crop.rightPct - crop.leftPct;
  const heightPct = crop.bottomPct - crop.topPct;
  if (widthPct <= 0 || heightPct <= 0) return null;
  try {
    const image = new Image();
    image.src = dataUrl;
    await image.decode();
    const side = Math.max(widthPct * image.naturalWidth / 100, heightPct * image.naturalHeight / 100);
    const centerX = ((crop.leftPct + crop.rightPct) / 2) * image.naturalWidth / 100;
    const centerY = ((crop.topPct + crop.bottomPct) / 2) * image.naturalHeight / 100;
    const canvas = document.createElement("canvas");
    canvas.width = 96;
    canvas.height = 96;
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.drawImage(image, centerX - side / 2, centerY - side / 2, side, side, 0, 0, 96, 96);
    return canvas.toDataURL("image/jpeg", 0.86);
  } catch {
    return null;
  }
}

const LABEL_TONES = [
  "bg-success/20 text-success-foreground border-success/35",
  "bg-info/20 text-info-foreground border-info/35",
  "bg-warning/20 text-warning-foreground border-warning/35",
  "bg-destructive/20 text-destructive-foreground border-destructive/35",
];

function labelTone(label: string) {
  const score = [...label].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return LABEL_TONES[score % LABEL_TONES.length];
}

export function DraftVisionPanel({ onAdd, inDraft, remaining }: Props) {
  const mv = useMovement();
  const extract = useServerFn(extractWhatsappRows);
  const [shots, setShots] = useState<string[]>([]);
  const [rows, setRows] = useState<VisionRow[]>([]);
  const [storyPhone, setStoryPhone] = useState<string | null>(null);
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
      const withAvatars = await Promise.all(built.map(async (row) => {
        const imageIndex = row.raw.screenshotIndex ?? 0;
        const source = shots[imageIndex];
        if (!source || !row.raw.avatarPresent) return row;
        return { ...row, avatarDataUrl: await cropAvatar(source, row.raw.avatarCrop) };
      }));
      setRows(withAvatars);
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
              <Button
                type="button"
                variant="secondary"
                size="icon"
                aria-label={`Remove WhatsApp screenshot ${i + 1}`}
                className="absolute right-1 top-1 h-6 w-6"
                onClick={() => setShots((x) => x.filter((_, j) => j !== i))}
              >
                ✕
              </Button>
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

          <div className="mx-auto max-w-3xl overflow-hidden rounded-lg border border-sidebar-border bg-sidebar text-sidebar-foreground shadow-xl">
            <div className="flex items-center justify-between px-4 py-3">
              <div>
                <div className="text-base font-semibold">WhatsApp</div>
                <div className="text-[10px] text-sidebar-foreground/60">{rows.length} leads found · tap a row to include</div>
              </div>
              <MoreVertical className="h-5 w-5 text-sidebar-foreground/70" />
            </div>
            <div className="mx-3 mb-2 flex h-10 items-center gap-2 rounded-full bg-sidebar-accent px-4 text-xs text-sidebar-foreground/60">
              <Search className="h-4 w-4" /> Search leads
            </div>
            <div className="max-h-[560px] overflow-y-auto scrollbar-thin">
              {rows.map((r) => {
                const disabled = r.classification === "locked" || r.classification === "duplicate";
                const displayIdentity = r.name ?? (r.phoneDigits ? `+${r.phoneDigits}` : "Unknown contact");
                const visiblePhone = r.phoneDigits ? `+${r.phoneDigits}` : null;
                return (
                  <div key={r.id} className="border-t border-sidebar-border/70">
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={disabled}
                      aria-pressed={r.include}
                      onClick={() => toggle(r.id)}
                      className={cn(
                        "grid h-auto w-full grid-cols-[52px_minmax(0,1fr)_auto] items-start gap-3 rounded-none px-3 py-3 text-left transition-colors",
                        r.include ? "bg-sidebar-accent/80" : "hover:bg-sidebar-accent/45",
                        disabled && "cursor-not-allowed opacity-55",
                      )}
                    >
                      <div className={cn("relative grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-full bg-muted text-lg font-semibold text-muted-foreground", r.include && "ring-2 ring-success ring-offset-2 ring-offset-sidebar")}>
                        {r.avatarDataUrl ? <img src={r.avatarDataUrl} alt={`${displayIdentity} profile`} className="h-full w-full object-cover" /> : r.isGroup ? <Users className="h-5 w-5" /> : displayIdentity.charAt(0).toUpperCase()}
                        {r.include && <span className="absolute bottom-0 right-0 grid h-4 w-4 place-items-center rounded-full bg-success text-[9px] text-success-foreground">✓</span>}
                      </div>
                      <div className="min-w-0">
                        <div className="flex min-w-0 items-baseline gap-2">
                          <span className="truncate text-sm font-semibold text-sidebar-accent-foreground">{displayIdentity}</span>
                          {r.pinned && <Pin className="h-3 w-3 shrink-0 text-sidebar-foreground/55" />}
                        </div>
                        {r.name && visiblePhone && <div className="truncate text-[11px] text-sidebar-foreground/55">{visiblePhone}</div>}
                        <div className="mt-0.5 flex min-w-0 items-center gap-1 text-xs text-sidebar-foreground/65">
                          {r.raw.lastMessageDirection === "us" && <CheckCheck className={cn("h-3.5 w-3.5 shrink-0", r.raw.deliveryTicks === "read" ? "text-info" : "text-sidebar-foreground/45")} />}
                          <span className="truncate">{r.raw.lastMessageText ?? "Message preview unavailable"}</span>
                        </div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1">
                          {(r.raw.visibleLabels ?? []).map((label, index) => <span key={`${label.text}-${index}`} className={cn("rounded border px-1.5 py-0.5 text-[9px] font-semibold uppercase", labelTone(label.colour ?? label.text))}>{label.text}</span>)}
                          <span className={cn("rounded border px-1.5 py-0.5 text-[9px] font-semibold uppercase", labelTone(r.draft))}>{r.draft}</span>
                          <span className={cn("rounded border px-1.5 py-0.5 text-[9px] font-semibold uppercase", CLASS_STYLE[r.classification])}>{r.classification.replace("-", " ")}</span>
                        </div>
                      </div>
                      <div className="flex min-w-12 flex-col items-end gap-2">
                        <span className={cn("whitespace-nowrap text-[11px]", r.unread > 0 ? "font-medium text-success" : "text-sidebar-foreground/55")}>{r.timestampText ?? "—"}</span>
                        {r.unread > 0 && <span className="grid min-h-5 min-w-5 place-items-center rounded-full bg-success px-1 text-[10px] font-bold text-success-foreground">{r.unread}</span>}
                      </div>
                    </Button>
                    {(r.lockedBy || r.identity === "ambiguous") && (
                      <div className="flex flex-wrap items-center gap-2 px-[76px] pb-2 text-[10px] text-sidebar-foreground/60">
                        {r.lockedBy && <span className="flex items-center gap-1 text-destructive"><ShieldAlert className="h-3 w-3" />Owned by {r.lockedBy}</span>}
                        {r.identity === "ambiguous" && r.candidates.slice(0, 3).map((candidate) => (
                          <Button key={candidate} size="sm" variant="secondary" className="h-6 text-[10px]" onClick={() => resolveTo(r.id, candidate)}>Use {mv.states[candidate]?.name ?? candidate.slice(-6)}</Button>
                        ))}
                      </div>
                    )}
                    <div className="flex items-center justify-between px-[76px] pb-2 text-[9px] text-sidebar-foreground/40">
                      <span>OCR {pct(r.ocrConfidence)} · identity {pct(r.identityConfidence)}</span>
                      <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px] text-sidebar-foreground hover:text-sidebar-accent-foreground" disabled={!r.phoneDigits || r.phoneDigits.length < 10} onClick={() => setStoryPhone(storyPhone === r.phoneDigits ? null : r.phoneDigits)}>{storyPhone === r.phoneDigits ? "Hide lead" : "Open lead"}</Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {storyPhone && (
            <div className="space-y-2 rounded-lg border p-3">
              <h3 className="text-sm font-semibold">
                Full story — steps, last message, labels, next step, how to approach next
              </h3>
              <LeadStoryByPhone phone={storyPhone} />
            </div>
          )}
        </>
      )}
    </section>
  );
}
