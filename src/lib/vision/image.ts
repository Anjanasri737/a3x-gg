export const MAX_EDGE_PX = 1800;
export const JPEG_QUALITY = 0.86;

export interface PreparedImage {
  fileName: string;
  dataUrl: string;
  bytes: number;
  width: number;
  height: number;
  hash: string;
}

async function loadBitmap(file: File): Promise<{
  width: number;
  height: number;
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void;
}> {
  if (typeof createImageBitmap === "function") {
    const bmp = await createImageBitmap(file);
    return { width: bmp.width, height: bmp.height, draw: (ctx, w, h) => ctx.drawImage(bmp, 0, 0, w, h) };
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Could not read this image"));
      el.src = url;
    });
    return { width: img.naturalWidth, height: img.naturalHeight, draw: (ctx, w, h) => ctx.drawImage(img, 0, 0, w, h) };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function dataUrlToBytes(dataUrl: string): ArrayBuffer {
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  const bin = atob(base64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

export async function prepareScreenshot(file: File): Promise<PreparedImage> {
  const src = await loadBitmap(file);
  const scale = Math.min(1, MAX_EDGE_PX / Math.max(src.width, src.height));
  const width = Math.max(1, Math.round(src.width * scale));
  const height = Math.max(1, Math.round(src.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser could not process the image");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  src.draw(ctx, width, height);
  const dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
  const bytes = dataUrlToBytes(dataUrl);
  return { fileName: file.name, dataUrl, bytes: bytes.byteLength, width, height, hash: await sha256Hex(bytes) };
}
