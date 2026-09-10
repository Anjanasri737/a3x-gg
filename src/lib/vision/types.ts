export const EXTRACTION_VERSION = "wa-vision-1";
export const EXTRACTION_MODEL = "google/gemini-3.6-flash";

export type PreviewDirection = "incoming" | "outgoing" | "unknown";
export type SeenState = "seen" | "unseen" | "unknown";
export type ExtractionErrorKind = "credits" | "rate_limit" | "upstream" | "invalid_json" | "config" | "storage" | "unknown";

export interface ExtractedRow {
  rowIndex: number;
  contactName: string | null;
  phoneRaw: string | null;
  visibleTimestampRaw: string | null;
  lastMessagePreview: string | null;
  previewDirection: PreviewDirection;
  unreadVisible: boolean | null;
  unreadCount: number | null;
  seenState: SeenState;
  colorHint: string | null;
  detectedLabel: string | null;
  handlerHint: string | null;
  rowTopPct: number | null;
  rowBottomPct: number | null;
  ocrConfidence: number;
  rawText: string;
}

export interface ExtractionResult {
  visibleRowCount: number;
  rows: ExtractedRow[];
  warnings: string[];
  extractionConfidence: number;
}

export interface ObservationRecord {
  id: string;
  screenshot_id: string;
  batch_id: string;
  row_index: number | null;
  contact_name: string | null;
  phone_raw: string | null;
  phone_normalized: string | null;
  visible_timestamp_raw: string | null;
  last_message_preview: string | null;
  preview_direction: string;
  unread_visible: boolean | null;
  unread_count: number | null;
  seen_state: string;
  color_hint: string | null;
  detected_label: string | null;
  handler_hint: string | null;
  ocr_confidence: number | null;
  raw_text: string;
  reconciliation_state: string;
  reconciliation_reason: string | null;
  stage_inference: string | null;
  stage_confidence: number | null;
  work_bucket: string | null;
  primary_mission: string | null;
  blocker_hint: string | null;
  operator_edited: boolean;
  lead_id: string | null;
  intelligence: Record<string, any>;
}

export interface ScreenshotRecord {
  id: string;
  batch_id: string;
  file_name: string | null;
  image_hash: string | null;
  temporary_storage_path: string | null;
  processing_status: string;
  visible_row_count: number;
  ai_visible_row_count: number | null;
  extraction_confidence: number | null;
  extraction_model: string | null;
  extraction_version: string | null;
  warnings: string[];
  error_message: string | null;
  reused_from_screenshot_id: string | null;
}

export type AnalyzeResponse =
  | {
      ok: true;
      screenshotId: string;
      detectedRowCount: number;
      insertedRowCount: number;
      extractionConfidence: number;
      warnings: string[];
      reused: boolean;
      model: string;
      observations: ObservationRecord[];
    }
  | {
      ok: false;
      screenshotId: string;
      errorKind: ExtractionErrorKind;
      message: string;
      retryable: boolean;
    };
