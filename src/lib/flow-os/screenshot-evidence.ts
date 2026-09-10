import { supabase } from "@/integrations/supabase/client";
import { getCurrentFlowOperator } from "./revenue-api";

const db = supabase as any;
const BUCKET = "flow-screenshot-evidence";

async function sha256Hex(file: File) {
  try {
    const hash = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
    return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return null;
  }
}

function safeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(-160) || "screenshot";
}

export interface UploadedScreenshotEvidence {
  id: string;
  screenshotKey: string;
  storagePath: string;
  sha256?: string | null;
}

export async function uploadScreenshotEvidence(
  batchId: string,
  files: File[],
  capturedAt?: string,
): Promise<UploadedScreenshotEvidence[]> {
  if (!files.length) return [];
  const operator = await getCurrentFlowOperator();
  const uploaded: UploadedScreenshotEvidence[] = [];

  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    const hash = await sha256Hex(file);
    const screenshotKey = file.name || `screenshot-${index + 1}`;
    const storagePath = `${batchId}/${String(index + 1).padStart(3, "0")}-${safeFileName(file.name)}`;

    const { error: uploadError } = await supabase.storage.from(BUCKET).upload(storagePath, file, {
      upsert: false,
      contentType: file.type || undefined,
    });
    if (uploadError) throw uploadError;

    const { data, error } = await db.from("flow_screenshots").insert({
      batch_id: batchId,
      screenshot_key: screenshotKey,
      original_file_name: file.name,
      mime_type: file.type || null,
      byte_size: file.size,
      sha256: hash,
      storage_path: storagePath,
      captured_at: capturedAt ?? null,
      processing_state: "uploaded",
      created_by: operator.id,
    }).select("id,screenshot_key,storage_path,sha256").single();
    if (error) throw error;

    uploaded.push({
      id: data.id,
      screenshotKey: data.screenshot_key,
      storagePath: data.storage_path,
      sha256: data.sha256,
    });
  }

  return uploaded;
}

export async function listScreenshotEvidence(batchId: string) {
  const { data, error } = await db.from("flow_screenshots").select("*").eq("batch_id", batchId).order("created_at");
  if (error) throw error;
  return data ?? [];
}

export async function getScreenshotSignedUrl(storagePath: string, expiresSeconds = 300) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, expiresSeconds);
  if (error) throw error;
  return data.signedUrl;
}
