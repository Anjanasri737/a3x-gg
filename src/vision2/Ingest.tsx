// Bulk screenshot ingestion — n screenshots in, one deduplicated work pool out.
// The image is temporary; the observation is the asset.
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Upload, Trash2, ImageIcon } from "lucide-react";
import { extractWhatsappRows } from "@/lib/draft-vision.functions";
import { WA_ACCOUNTS } from "@/finalmoment/bridge";
import { useOcrEngine, sha256, type OcrBatch } from "./engine";

interface Shot {
  key: string;
  name: string;
  dataUrl: string;
  bytes: number;
}

const CHUNK = 3; // screenshots per model call

export function Ingest({ scope }: { scope: "user" | "admin" | "tower" }) {
  const eng = useOcrEngine();
  const [shots, setShots] = useState<Shot[]>([]);
  const [account, setAccount] = useState<string>(WA_ACCOUNTS[0]);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(0);
  const [last, setLast] = useState<OcrBatch | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const addFiles = async (files: FileList | File[] | null) => {
    if (!files) return;
    const arr = Array.from(files).filter((f) => f.type.startsWith("image/"));
    const read = await Promise.all(
      arr.map(
        (f) =>
          new Promise<Shot>((res) => {
            const fr = new FileReader();
            fr.onload = () =>
              res({ key: `${f.name}-${f.size}-${Math.random().toString(36).slice(2, 7)}`, name: f.name, dataUrl: String(fr.result), bytes: f.size });
            fr.readAsDataURL(f);
          }),
      ),
    );
    setShots((s) => [...s, ...read].slice(0, 50));
  };

  const run = async () => {
    if (!shots.length) return;
    setBusy(true);
    setDone(0);
    const t0 = Date.now();
    const batchId = `B-${Date.now().toString(36).toUpperCase()}`;
    const capturedAt = new Date().toISOString();
    const me = scope === "tower" ? "Control Tower" : scope === "admin" ? "Admin" : "Operator";

    let rowCount = 0;
    let dupShots = 0;
    let needsReview = 0;
    const shotIds: string[] = [];
    const touched = new Set<string>();

    try {
      for (let i = 0; i < shots.length; i += CHUNK) {
        const group = shots.slice(i, i + CHUNK);
        const fresh: Shot[] = [];
        for (const s of group) {
          const hash = await sha256(s.dataUrl);
          if (eng.findByHash(hash)) {
            dupShots += 1;
            continue;
          }
          const id = `S-${hash.slice(0, 10)}`;
          shotIds.push(id);
          eng.registerScreenshot({
            id,
            batchId,
            sha256: hash,
            uploadedBy: me,
            uploadedAt: capturedAt,
            capturedAt,
            bytes: s.bytes,
            rows: 0,
            status: "uploaded",
            expiresAt: new Date(Date.now() + 48 * 3600_000).toISOString(),
            rawDeletedAt: null,
          });
          fresh.push({ ...s, key: id });
        }
        if (!fresh.length) {
          setDone((d) => d + group.length);
          continue;
        }

        const res = await extractWhatsappRows({ data: { images: fresh.map((f) => f.dataUrl) } });
        const rows = res.rows ?? [];
        rowCount += rows.length;
        needsReview += rows.filter((r) => (r.ocrConfidence ?? 1) < 0.6 || r.chatType === "group").length;

        const out = eng.ingestRows(
          rows.map((raw) => ({
            raw,
            screenshotId: fresh[0].key,
            batchId,
            capturedAt,
            waAccount: account,
          })),
        );
        out.ids.forEach((id) => touched.add(id));
        setDone((d) => d + group.length);
      }

      // raw images are disposable: we keep the hash + metadata, never the picture
      eng.markRawDeleted(shotIds);

      const customers = useOcrEngine.getState().customers;
      const list = [...touched].map((id) => customers[id]).filter(Boolean);
      const batch: OcrBatch = {
        id: batchId,
        at: new Date().toISOString(),
        by: me,
        scope,
        screenshots: shots.length,
        duplicateScreenshots: dupShots,
        rows: rowCount,
        unique: list.length,
        firstSeen: list.filter((c) => c.appearances === 1).length,
        existing: list.filter((c) => c.appearances > 1).length,
        repeats: rowCount - list.length,
        phoneVisible: list.filter((c) => c.normalizedPhone).length,
        nameOnly: list.filter((c) => !c.normalizedPhone).length,
        unreadChats: list.filter((c) => c.unread > 0).length,
        needsReview,
        claimed: list.filter((c) => useOcrEngine.getState().claims[c.id]?.status === "active").length,
        ms: Date.now() - t0,
      };
      eng.addBatch(batch);
      setLast(batch);
      setShots([]);
      toast.success(`${batch.rows} chat rows → ${batch.unique} unique leads in the work pool`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Screenshot reading failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="space-y-3"
      onPaste={(e) => addFiles(Array.from(e.clipboardData.files))}
      onDrop={(e) => {
        e.preventDefault();
        addFiles(e.dataTransfer.files);
      }}
      onDragOver={(e) => e.preventDefault()}
    >
      <div className="rounded-xl border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold">Add screenshots · up to 50 at once</h2>
            <p className="text-[11px] text-muted-foreground">
              Paste, drop or pick several days of WhatsApp screens. Images are read once and thrown away — only the
              chat data is kept.
            </p>
          </div>
          <select
            value={account}
            onChange={(e) => setAccount(e.target.value)}
            className="h-8 rounded-md border bg-background px-2 text-xs"
          >
            {WA_ACCOUNTS.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>

        <input
          ref={fileRef}
          type="file"
          multiple
          accept="image/*"
          className="hidden"
          onChange={(e) => addFiles(e.target.files)}
        />

        <div className="flex flex-wrap items-center gap-2 pt-3">
          <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
            <ImageIcon className="mr-1 h-3.5 w-3.5" /> Add images
          </Button>
          <Button size="sm" disabled={!shots.length || busy} onClick={run}>
            <Upload className="mr-1 h-3.5 w-3.5" />
            {busy ? `Reading ${done}/${shots.length}…` : `Read ${shots.length} screenshot${shots.length === 1 ? "" : "s"}`}
          </Button>
          {!!shots.length && !busy && (
            <Button size="sm" variant="ghost" onClick={() => setShots([])}>
              <Trash2 className="mr-1 h-3.5 w-3.5" /> Clear
            </Button>
          )}
        </div>

        {busy && <Progress value={(done / Math.max(1, shots.length)) * 100} className="mt-3 h-1.5" />}

        {!!shots.length && (
          <div className="flex flex-wrap gap-2 pt-3">
            {shots.map((s) => (
              <img key={s.key} src={s.dataUrl} alt={s.name} className="h-16 w-24 rounded border object-cover" />
            ))}
          </div>
        )}
      </div>

      {last && (
        <div className="rounded-xl border bg-card p-4">
          <h3 className="text-sm font-semibold">Upload processed · {last.id}</h3>
          <div className="grid grid-cols-2 gap-2 pt-2 text-xs sm:grid-cols-4">
            <Stat label="Screenshots" v={last.screenshots} />
            <Stat label="Repeat images skipped" v={last.duplicateScreenshots} />
            <Stat label="Chat rows detected" v={last.rows} />
            <Stat label="Unique leads" v={last.unique} />
            <Stat label="First seen ever" v={last.firstSeen} />
            <Stat label="Already known" v={last.existing} />
            <Stat label="Number visible" v={last.phoneVisible} />
            <Stat label="Name only" v={last.nameOnly} />
            <Stat label="Unread chats" v={last.unreadChats} />
            <Stat label="Needs review" v={last.needsReview} />
            <Stat label="Repeat rows merged" v={Math.max(0, last.repeats)} />
            <Stat label="Time" v={`${(last.ms / 1000).toFixed(1)}s`} />
          </div>
          <p className="pt-2 text-[11px] text-muted-foreground">
            Raw images deleted · only hashes and chat data kept.
          </p>
        </div>
      )}

      {!!eng.batches.length && (
        <div className="rounded-xl border bg-card p-4">
          <h3 className="text-sm font-semibold">Upload history</h3>
          <ul className="divide-y pt-1 text-xs">
            {eng.batches.slice(0, 8).map((b) => (
              <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="font-mono">{b.id}</span>
                <span className="text-muted-foreground">
                  {new Date(b.at).toLocaleString()} · {b.by}
                </span>
                <span>
                  {b.screenshots} shots · {b.rows} rows · <b>{b.unique}</b> leads
                </span>
                <Badge variant="outline" className="text-[10px]">{b.needsReview} review</Badge>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Stat({ label, v }: { label: string; v: number | string }) {
  return (
    <div className="rounded-lg border p-2">
      <div className="text-base font-bold">{v}</div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
    </div>
  );
}
