import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { normalizePhoneIN } from "@/lib/lead-identity/normalize";
import { compileConversationState, compilationAsIntelligence } from "@/lib/flow-os/conversation-state-compiler";
import { compileAndPersistObservation } from "@/lib/flow-os/conversation-state-persistence";
import {
  EXTRACTION_MODEL,
  EXTRACTION_VERSION,
  type AnalyzeResponse,
  type ExtractedRow,
  type ExtractionErrorKind,
  type ExtractionResult,
  type ObservationRecord,
  type ScreenshotRecord,
} from "./types";

const BUCKET = "whatsapp-screenshots";
const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";

const SYSTEM_PROMPT = `You read screenshots of a WhatsApp CHAT LIST (the inbox list of conversations), not a single conversation.

Return EVERY visible chat row from top to bottom, including partially visible first/last rows.
Never invent hidden text. If a field is not visible, return null, or "unknown" for enum fields.
Never merge two rows. Never split one row.
If the row header shows a phone number rather than a saved name, put it in phoneRaw and leave contactName null. If it shows a name only, leave phoneRaw null. Do not guess a phone number from a name.
Copy lastMessagePreview verbatim in its original language. Do not translate or fix spelling.
previewDirection is outgoing only when a sent/delivered/read tick clearly belongs to the preview; incoming only when clearly from the contact; otherwise unknown.
unreadVisible/unreadCount come only from a visible unread badge. seenState is unseen when an unread badge is visible, seen only when read evidence is visible, otherwise unknown.
colorHint describes visible row/label colour evidence in plain words; it is evidence, not a commercial stage.
detectedLabel is only a visibly shown WhatsApp label/tag. handlerHint is only a visibly shown person/agent name.
rowTopPct/rowBottomPct are approximate vertical percentages, 0-100.
ocrConfidence is 0-100.
rawText contains all readable text from that row.
visibleRowCount must equal rows.length.

Return ONLY JSON matching:
{"visibleRowCount":number,"rows":[{"rowIndex":number,"contactName":string|null,"phoneRaw":string|null,"visibleTimestampRaw":string|null,"lastMessagePreview":string|null,"previewDirection":"incoming"|"outgoing"|"unknown","unreadVisible":boolean|null,"unreadCount":number|null,"seenState":"seen"|"unseen"|"unknown","colorHint":string|null,"detectedLabel":string|null,"handlerHint":string|null,"rowTopPct":number|null,"rowBottomPct":number|null,"ocrConfidence":number,"rawText":string}],"warnings":string[],"extractionConfidence":number}`;

const CreateBatchInput = z.object({
  whatsappAccount: z.string().max(120).nullable().optional(),
  screenshotCount: z.number().int().min(1).max(200),
});
const RegisterInput = z.object({
  batchId: z.string().uuid(),
  fileName: z.string().min(1).max(300),
  imageHash: z.string().regex(/^[0-9a-f]{64}$/),
  dataUrl: z.string().min(64).max(14_000_000),
  whatsappAccount: z.string().max(120).nullable().optional(),
});
const AnalyzeInput = z.object({ screenshotId: z.string().uuid() });
const LoadBatchInput = z.object({ batchId: z.string().uuid() });
const UpdateObservationInput = z.object({
  observationId: z.string().uuid(),
  contactName: z.string().max(200).nullable().optional(),
  phoneRaw: z.string().max(60).nullable().optional(),
  lastMessagePreview: z.string().max(2000).nullable().optional(),
  visibleTimestampRaw: z.string().max(80).nullable().optional(),
  detectedLabel: z.string().max(120).nullable().optional(),
  seenState: z.enum(["seen", "unseen", "unknown"]).optional(),
  colorHint: z.string().max(120).nullable().optional(),
  handlerHint: z.string().max(200).nullable().optional(),
  reconciliationState: z.enum(["matched_existing", "new_customer", "returning_cycle", "duplicate_observation", "needs_review", "non_customer"]).optional(),
  reconciliationReason: z.string().max(500).nullable().optional(),
  leadId: z.string().uuid().nullable().optional(),
});
const FinalizeInput = z.object({ batchId: z.string().uuid(), expectedOverride: z.number().int().min(0).max(10000).nullable().optional() });

function sleep(ms: number) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function text(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t.slice(0, 1200) : null;
}
function numberValue(v: unknown): number | null { return typeof v === "number" && Number.isFinite(v) ? v : null; }
function stripFences(value: string) {
  let t = value.trim().replace(/^```[a-zA-Z]*\s*/, "").replace(/```\s*$/, "").trim();
  const first = t.indexOf("{");
  const last = t.lastIndexOf("}");
  if (first >= 0 && last > first) t = t.slice(first, last + 1);
  return t;
}
function coerceResult(parsed: unknown): ExtractionResult {
  const root = (parsed ?? {}) as Record<string, unknown>;
  const rawRows = Array.isArray(root.rows) ? root.rows : [];
  const rows: ExtractedRow[] = rawRows.map((raw, index) => {
    const row = (raw ?? {}) as Record<string, unknown>;
    const direction = text(row.previewDirection) ?? "unknown";
    const seen = text(row.seenState) ?? "unknown";
    return {
      rowIndex: numberValue(row.rowIndex) ?? index + 1,
      contactName: text(row.contactName),
      phoneRaw: text(row.phoneRaw),
      visibleTimestampRaw: text(row.visibleTimestampRaw),
      lastMessagePreview: text(row.lastMessagePreview),
      previewDirection: ["incoming", "outgoing", "unknown"].includes(direction) ? direction as ExtractedRow["previewDirection"] : "unknown",
      unreadVisible: typeof row.unreadVisible === "boolean" ? row.unreadVisible : null,
      unreadCount: numberValue(row.unreadCount),
      seenState: ["seen", "unseen", "unknown"].includes(seen) ? seen as ExtractedRow["seenState"] : "unknown",
      colorHint: text(row.colorHint),
      detectedLabel: text(row.detectedLabel),
      handlerHint: text(row.handlerHint),
      rowTopPct: numberValue(row.rowTopPct),
      rowBottomPct: numberValue(row.rowBottomPct),
      ocrConfidence: Math.max(0, Math.min(100, numberValue(row.ocrConfidence) ?? 50)),
      rawText: text(row.rawText) ?? "",
    };
  });
  const warnings = Array.isArray(root.warnings) ? root.warnings.map(text).filter((v): v is string => Boolean(v)) : [];
  const declared = numberValue(root.visibleRowCount);
  if (declared !== null && declared !== rows.length) warnings.push(`Model declared ${declared} rows but returned ${rows.length}.`);
  return {
    visibleRowCount: rows.length,
    rows,
    warnings,
    extractionConfidence: Math.max(0, Math.min(100, numberValue(root.extractionConfidence) ?? 60)),
  };
}

class ExtractionError extends Error {
  constructor(public kind: ExtractionErrorKind, message: string, public retryable = false) { super(message); }
}

async function callVision(dataUrl: string, apiKey: string): Promise<ExtractionResult> {
  const response = await fetch(GATEWAY, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "Lovable-API-Key": apiKey,
      "X-Lovable-AIG-SDK": "gharpayy-flow-os",
    },
    body: JSON.stringify({
      model: EXTRACTION_MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: [
          { type: "text", text: "Extract every visible WhatsApp chat-list row. JSON only." },
          { type: "image_url", image_url: { url: dataUrl } },
        ] },
      ],
      temperature: 0,
    }),
  });
  if (!response.ok) {
    const body = (await response.text().catch(() => "")).slice(0, 300);
    if (response.status === 402) throw new ExtractionError("credits", "Lovable AI credits are exhausted for screenshot analysis.", false);
    if (response.status === 429) throw new ExtractionError("rate_limit", "Lovable AI Vision is rate limited. Retry shortly.", true);
    if (response.status >= 500) throw new ExtractionError("upstream", `Lovable AI Vision is temporarily unavailable (${response.status}).`, true);
    throw new ExtractionError("unknown", `Lovable AI Vision rejected the screenshot (${response.status}). ${body}`, false);
  }
  const json = await response.json() as { choices?: Array<{ message?: { content?: string | Array<{ text?: string }> } }> };
  const content = json.choices?.[0]?.message?.content;
  const raw = typeof content === "string" ? content : Array.isArray(content) ? content.map((part) => part?.text ?? "").join("") : "";
  if (!raw.trim()) throw new ExtractionError("invalid_json", "Lovable AI Vision returned an empty result.", true);
  try { return coerceResult(JSON.parse(stripFences(raw))); }
  catch { throw new ExtractionError("invalid_json", "Lovable AI Vision returned invalid JSON.", true); }
}

async function callVisionWithRetry(dataUrl: string, apiKey: string) {
  try { return await callVision(dataUrl, apiKey); }
  catch (error) {
    const e = error as ExtractionError;
    if (!e.retryable) throw error;
    await sleep(900 + Math.floor(Math.random() * 900));
    return callVision(dataUrl, apiKey);
  }
}

async function createLeadForPhone(admin: any, row: ExtractedRow, phone: string) {
  const now = new Date().toISOString();
  const { data, error } = await admin.from("leads").insert({
    phone,
    wa_name: row.contactName,
    location_text: null,
    zone_id: null,
    movein_bucket: null,
    movein_date: null,
    location_score: 0,
    movein_score: 0,
    score: row.unreadVisible ? 20 : 0,
    priority: row.unreadVisible ? "hot" : "active",
    status: "open",
    current_pipeline_stage: "DOSSIER",
    latest_whatsapp_observation_at: now,
    latest_whatsapp_preview: row.lastMessagePreview,
    whatsapp_seen_state: row.seenState,
  }).select("id").single();
  if (error) throw new Error(`Could not create CRM customer: ${error.message}`);
  await admin.from("lead_cycles").insert({ lead_id: data.id, cycle_no: 1, open_reason: "screenshot_vision_first_seen" });
  return data.id as string;
}

async function persistRows(admin: any, args: { screenshotId: string; batchId: string; whatsappAccount: string | null; rows: ExtractedRow[] }) {
  const { data: existingRows } = await admin.from("screenshot_observations").select("phone_normalized,lead_id").eq("batch_id", args.batchId);
  const seenPhones = new Set<string>((existingRows ?? []).map((r: any) => r.phone_normalized).filter(Boolean));
  const payload: Record<string, unknown>[] = [];

  for (const row of args.rows) {
    const phone = row.phoneRaw ? normalizePhoneIN(row.phoneRaw) : "";
    const compiled = compileConversationState({
      lastMessage: row.lastMessagePreview,
      rawText: row.rawText,
      direction: row.previewDirection,
      unreadVisible: row.unreadVisible,
      seenState: row.seenState,
      colorHint: row.colorHint,
      detectedLabel: row.detectedLabel,
      handlerHint: row.handlerHint,
      ocrConfidence: row.ocrConfidence,
    });
    const intelligence = compiled.legacy;
    let leadId: string | null = null;
    let state: "matched_existing" | "new_customer" | "duplicate_observation" | "needs_review" = "needs_review";
    let reason = "Identity needs operator review";

    if (phone) {
      const { data: existingLead } = await admin.from("leads").select("id,current_pipeline_stage").eq("phone", phone).maybeSingle();
      if (existingLead) {
        leadId = existingLead.id;
        state = seenPhones.has(phone) ? "duplicate_observation" : "matched_existing";
        reason = seenPhones.has(phone) ? "Same canonical customer already appeared in this batch" : "Normalized phone matched an existing CRM customer";
      } else if (row.ocrConfidence >= 70) {
        leadId = await createLeadForPhone(admin, row, phone);
        state = "new_customer";
        reason = "Valid visible phone was absent from CRM, so a canonical customer was created";
      } else {
        reason = "Phone is readable but OCR confidence is too low to auto-create a CRM customer";
      }
    } else if (!row.contactName) {
      reason = "Neither name nor valid phone is readable";
    } else {
      reason = "Name-only WhatsApp row cannot be safely auto-merged without a phone";
    }
    if (phone) seenPhones.add(phone);

    payload.push({
      screenshot_id: args.screenshotId,
      batch_id: args.batchId,
      whatsapp_account: args.whatsappAccount,
      row_index: row.rowIndex,
      contact_name: row.contactName,
      phone_raw: row.phoneRaw,
      phone_normalized: phone || null,
      lead_id: leadId,
      visible_timestamp_raw: row.visibleTimestampRaw,
      last_message_preview: row.lastMessagePreview,
      preview_direction: row.previewDirection,
      unread_visible: row.unreadVisible,
      unread_count: row.unreadCount,
      seen_state: row.seenState,
      whatsapp_row_color: row.colorHint,
      color_hint: row.colorHint,
      detected_label: row.detectedLabel,
      handler_hint: row.handlerHint,
      stage_inference: intelligence.inferredPipelineHint,
      stage_confidence: intelligence.confidence,
      ocr_confidence: row.ocrConfidence,
      raw_text: row.rawText,
      captured_at: new Date().toISOString(),
      reconciliation_state: state,
      reconciliation_reason: reason,
      movement_signal: intelligence.isPriorityInterrupt ? "PRIORITY_INTERRUPT" : "OBSERVED",
      work_bucket: intelligence.inferredWorkBucket,
      primary_mission: intelligence.primaryMission,
      blocker_hint: intelligence.blockerHint,
      intelligence: compilationAsIntelligence(compiled),
    });

    if (leadId) {
      await admin.from("leads").update({
        latest_whatsapp_observation_at: new Date().toISOString(),
        latest_whatsapp_preview: row.lastMessagePreview,
        whatsapp_seen_state: row.seenState,
        inferred_stage: intelligence.inferredPipelineHint,
        inferred_label: row.detectedLabel,
        whatsapp_sync_state: intelligence.inferredPipelineHint ? "AMBER" : "GREEN",
        updated_at: new Date().toISOString(),
      }).eq("id", leadId);
    }
  }

  if (!payload.length) return [] as ObservationRecord[];
  const { data, error } = await admin.from("screenshot_observations").insert(payload).select("*");
  if (error) throw new Error(`Could not save extracted rows: ${error.message}`);
  for (const observation of data ?? []) await compileAndPersistObservation(admin, observation);
  return (data ?? []) as ObservationRecord[];
}

export const createScreenshotBatch = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => CreateBatchInput.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const { data: row, error } = await admin.from("screenshot_batches").insert({
      screenshot_count: data.screenshotCount,
      whatsapp_account: data.whatsappAccount ?? null,
      visible_rows_expected: 0,
      status: "processing",
      metadata: { extractionProvider: "Lovable AI Vision", extractionModel: EXTRACTION_MODEL },
    }).select("id").single();
    if (error) throw new Error(`Could not start screenshot batch: ${error.message}`);
    return { batchId: row.id as string };
  });

export const registerScreenshot = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => RegisterInput.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const { data: prior } = await admin.from("whatsapp_screenshots").select("id,visible_row_count").eq("image_hash", data.imageHash).eq("processing_status", "extracted").order("created_at", { ascending: false }).limit(1).maybeSingle();
    const base64 = data.dataUrl.slice(data.dataUrl.indexOf(",") + 1);
    const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
    const storagePath = `${data.batchId}/${data.imageHash.slice(0, 16)}-${Date.now()}.jpg`;
    const upload = await admin.storage.from(BUCKET).upload(storagePath, bytes, { contentType: "image/jpeg", upsert: false });
    if (upload.error) throw new Error(`Private screenshot upload failed: ${upload.error.message}`);
    const { data: shot, error } = await admin.from("whatsapp_screenshots").insert({
      batch_id: data.batchId,
      whatsapp_account: data.whatsappAccount ?? null,
      image_hash: data.imageHash,
      file_name: data.fileName,
      temporary_storage_path: storagePath,
      processing_status: "uploaded",
      visible_row_count: 0,
      reused_from_screenshot_id: prior?.id ?? null,
    }).select("id").single();
    if (error) throw new Error(`Could not register screenshot: ${error.message}`);
    return { screenshotId: shot.id as string, reused: Boolean(prior), priorRowCount: prior?.visible_row_count ?? 0 };
  });

export const analyzeScreenshot = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => AnalyzeInput.parse(input))
  .handler(async ({ data }): Promise<AnalyzeResponse> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const { data: shot } = await admin.from("whatsapp_screenshots").select("*").eq("id", data.screenshotId).maybeSingle();
    if (!shot) return { ok: false, screenshotId: data.screenshotId, errorKind: "unknown", message: "Screenshot not found", retryable: false };
    const fail = async (kind: ExtractionErrorKind, message: string, retryable: boolean): Promise<AnalyzeResponse> => {
      await admin.from("whatsapp_screenshots").update({ processing_status: "error", error_message: message }).eq("id", shot.id);
      return { ok: false, screenshotId: shot.id, errorKind: kind, message, retryable };
    };

    try {
      let result: ExtractionResult;
      let model = EXTRACTION_MODEL;
      let reused = false;
      if (shot.reused_from_screenshot_id) {
        const { data: priorRows } = await admin.from("screenshot_observations").select("*").eq("screenshot_id", shot.reused_from_screenshot_id).order("row_index");
        const previous = (priorRows ?? []) as ObservationRecord[];
        result = {
          visibleRowCount: previous.length,
          extractionConfidence: 95,
          warnings: ["Duplicate image rechecked / prior extraction reused — no AI call was made."],
          rows: previous.map((row, index) => ({
            rowIndex: row.row_index ?? index + 1,
            contactName: row.contact_name,
            phoneRaw: row.phone_raw,
            visibleTimestampRaw: row.visible_timestamp_raw,
            lastMessagePreview: row.last_message_preview,
            previewDirection: ["incoming", "outgoing", "unknown"].includes(row.preview_direction) ? row.preview_direction as ExtractedRow["previewDirection"] : "unknown",
            unreadVisible: row.unread_visible,
            unreadCount: row.unread_count,
            seenState: ["seen", "unseen", "unknown"].includes(row.seen_state) ? row.seen_state as ExtractedRow["seenState"] : "unknown",
            colorHint: row.color_hint,
            detectedLabel: row.detected_label,
            handlerHint: row.handler_hint,
            rowTopPct: null,
            rowBottomPct: null,
            ocrConfidence: row.ocr_confidence ?? 80,
            rawText: row.raw_text,
          })),
        };
        model = "reused";
        reused = true;
      } else {
        const apiKey = process.env.LOVABLE_API_KEY;
        if (!apiKey) return fail("config", "LOVABLE_API_KEY is unavailable. Enable Lovable's built-in AI connector for this project.", false);
        if (!shot.temporary_storage_path) return fail("storage", "Screenshot storage path is missing.", false);
        const download = await admin.storage.from(BUCKET).download(shot.temporary_storage_path);
        if (download.error || !download.data) return fail("storage", "Could not read the private screenshot.", false);
        const bytes = new Uint8Array(await download.data.arrayBuffer());
        let binary = "";
        for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        await admin.from("whatsapp_screenshots").update({ processing_status: "analyzing" }).eq("id", shot.id);
        result = await callVisionWithRetry(`data:image/jpeg;base64,${btoa(binary)}`, apiKey);
      }
      const observations = await persistRows(admin, { screenshotId: shot.id, batchId: shot.batch_id, whatsappAccount: shot.whatsapp_account ?? null, rows: result.rows });
      await admin.from("whatsapp_screenshots").update({
        processing_status: "extracted",
        visible_row_count: result.rows.length,
        ai_visible_row_count: result.visibleRowCount,
        extraction_confidence: result.extractionConfidence,
        extraction_model: model,
        extraction_version: EXTRACTION_VERSION,
        warnings: result.warnings,
        error_message: null,
        raw_ocr_summary: { rowCount: result.rows.length, confidence: result.extractionConfidence },
      }).eq("id", shot.id);
      return { ok: true, screenshotId: shot.id, detectedRowCount: result.visibleRowCount, insertedRowCount: observations.length, extractionConfidence: result.extractionConfidence, warnings: result.warnings, reused, model, observations };
    } catch (error) {
      const e = error as ExtractionError;
      return fail(e.kind ?? "unknown", e.message || "Screenshot analysis failed", Boolean(e.retryable));
    }
  });

export const loadVisionBatch = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => LoadBatchInput.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const [batch, screenshots, observations] = await Promise.all([
      admin.from("screenshot_batches").select("*").eq("id", data.batchId).maybeSingle(),
      admin.from("whatsapp_screenshots").select("*").eq("batch_id", data.batchId).order("uploaded_at"),
      admin.from("screenshot_observations").select("*").eq("batch_id", data.batchId).order("created_at"),
    ]);
    return { batch: batch.data ?? null, screenshots: (screenshots.data ?? []) as ScreenshotRecord[], observations: (observations.data ?? []) as ObservationRecord[] };
  });

export const updateVisionObservation = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => UpdateObservationInput.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const patch: Record<string, unknown> = { operator_edited: true };
    if (data.contactName !== undefined) patch.contact_name = data.contactName;
    if (data.phoneRaw !== undefined) { patch.phone_raw = data.phoneRaw; patch.phone_normalized = data.phoneRaw ? normalizePhoneIN(data.phoneRaw) || null : null; }
    if (data.lastMessagePreview !== undefined) patch.last_message_preview = data.lastMessagePreview;
    if (data.visibleTimestampRaw !== undefined) patch.visible_timestamp_raw = data.visibleTimestampRaw;
    if (data.detectedLabel !== undefined) patch.detected_label = data.detectedLabel;
    if (data.seenState !== undefined) patch.seen_state = data.seenState;
    if (data.colorHint !== undefined) { patch.color_hint = data.colorHint; patch.whatsapp_row_color = data.colorHint; }
    if (data.handlerHint !== undefined) patch.handler_hint = data.handlerHint;
    if (data.reconciliationState !== undefined) patch.reconciliation_state = data.reconciliationState;
    if (data.reconciliationReason !== undefined) patch.reconciliation_reason = data.reconciliationReason;
    if (data.leadId !== undefined) patch.lead_id = data.leadId;
    if (data.lastMessagePreview !== undefined) {
      const compiled = compileConversationState({ lastMessage: data.lastMessagePreview, detectedLabel: data.detectedLabel ?? null, seenState: data.seenState ?? "unknown" });
      Object.assign(patch, { stage_inference: compiled.legacy.inferredPipelineHint, stage_confidence: compiled.confidence, work_bucket: compiled.legacy.inferredWorkBucket, primary_mission: compiled.legacy.primaryMission, blocker_hint: compiled.blocker, intelligence: { ...compilationAsIntelligence(compiled), recomputedAfterEdit: true } });
    }
    const { data: updated, error } = await admin.from("screenshot_observations").update(patch).eq("id", data.observationId).select("*").single();
    if (error) throw new Error(`Could not save row correction: ${error.message}`);
    if (data.lastMessagePreview !== undefined) await compileAndPersistObservation(admin, updated);
    return updated as ObservationRecord;
  });

export const finalizeVisionBatch = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => FinalizeInput.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const [{ data: shots }, { data: rows }] = await Promise.all([
      admin.from("whatsapp_screenshots").select("ai_visible_row_count,visible_row_count,processing_status").eq("batch_id", data.batchId),
      admin.from("screenshot_observations").select("id,reconciliation_state").eq("batch_id", data.batchId),
    ]);
    const screenshots = shots ?? [];
    const observations = rows ?? [];
    const detected = screenshots.reduce((sum: number, shot: any) => sum + (shot.ai_visible_row_count ?? shot.visible_row_count ?? 0), 0);
    const expected = data.expectedOverride ?? detected;
    const inserted = observations.length;
    const silentDrops = Math.max(0, expected - inserted);
    const unresolved = observations.filter((row: any) => row.reconciliation_state === "needs_review").length;
    const errors = screenshots.filter((shot: any) => shot.processing_status === "error").length;
    const complete = inserted > 0 && silentDrops === 0 && unresolved === 0 && errors === 0;
    await admin.from("screenshot_batches").update({ status: complete ? "complete" : "review", detected_rows_total: detected, expected_override: data.expectedOverride ?? null, visible_rows_expected: expected, rows_segmented: inserted, rows_reconciled: inserted - unresolved, unresolved_count: unresolved, screenshot_count: screenshots.length, updated_at: new Date().toISOString() }).eq("id", data.batchId);
    return { detected, expected, inserted, silentDrops, unresolved, errors, complete };
  });
