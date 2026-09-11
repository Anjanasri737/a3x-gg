import "@/lib/flow-os/service";

declare module "@/lib/flow-os/service" {
  interface TruthRow {
    /** Latest WhatsApp observation selected by flow_three_day_truth. */
    observation_id: string | null;
    movement_signal?: string | null;
    ocr_confidence?: number | null;
    whatsapp_account?: string | null;
    next_action_priority?: string | null;
    canonical_event?: string | null;
    conversation_stage?: string | null;
    waiting_on?: string | null;
    conversation_health?: string | null;
    conversation_movement?: string | null;
    conversation_momentum?: number | null;
    compiled_next_action?: string | null;
    compiled_action_due_at?: string | null;
    compiled_priority?: string | null;
    screenshot_status?: string | null;
    evidence_quality?: number | null;
    compiler_confidence?: number | null;
    compiler_needs_review?: boolean | null;
  }
}

export {};
