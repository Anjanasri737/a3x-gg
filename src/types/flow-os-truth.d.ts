import "@/lib/flow-os/service";

declare module "@/lib/flow-os/service" {
  interface TruthRow {
    /** Latest WhatsApp observation selected by flow_three_day_truth. */
    observation_id: string | null;
    movement_signal?: string | null;
    ocr_confidence?: number | null;
    whatsapp_account?: string | null;
    next_action_priority?: string | null;
  }
}

export {};
