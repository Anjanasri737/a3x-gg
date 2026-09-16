import { createServerFn } from "@tanstack/react-start";

/** Demo inbox rows: name, phone, message, seen state, colour, handler, label, unread. */
const SAMPLE: Array<[string, string, string, string, string, string, string, number]> = [
  ["Rahul Sharma", "9876543210", "Can I visit today at 6?", "unseen", "green", "Aditi", "Tour-ready", 2],
  ["Sneha Iyer", "9845012345", "Sharing my budget, 12k max", "unseen", "green", "Aditi", "Qualifying", 1],
  ["Karan Mehta", "9900112233", "Is the Koramangala room still free?", "unseen", "orange", "Vikram", "Needs options", 3],
  ["Priya Nair", "9812345678", "Sent the deposit screenshot", "seen", "blue", "Neha", "Payment check", 0],
  ["Aman Gupta", "9701234567", "Moving next month, will confirm", "seen", "grey", "Neha", "Future", 0],
  ["Divya Rao", "9663012345", "Please share photos again", "unseen", "green", "Vikram", "Needs options", 1],
  ["Nikhil Verma", "9008078901", "Tour done, liked HSR one", "seen", "blue", "Aditi", "Post-tour", 0],
  ["Meera Joshi", "9880123456", "Parents want to see the place", "unseen", "orange", "Neha", "Negotiating", 2],
  ["Sahil Khan", "9739012345", "Rent kitna hai bhai", "unseen", "green", "Vikram", "Qualifying", 4],
  ["Tanvi Shetty", "9611234567", "Can we do 11k?", "unseen", "red", "Aditi", "Negotiating", 1],
  ["Arjun Reddy", "9502345678", "Booked, sending token now", "seen", "blue", "Neha", "Booking", 0],
  ["Pooja Das", "9845567890", "No reply since last week", "seen", "grey", "Vikram", "No response", 0],
];

/**
 * Loads a clearly marked sample WhatsApp inbox so the Vision page can be reviewed
 * without uploading real screenshots. Idempotent: existing sample rows are reused.
 */
export const loadVisionSampleData = createServerFn({ method: "POST" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin;
  const account = "Gharpayy WhatsApp";
  const now = Date.now();

  const { data: existing } = await db
    .from("screenshot_batches")
    .select("id")
    .eq("metadata->>mode", "sample-demo")
    .limit(1)
    .maybeSingle();

  if (existing?.id) {
    const { count } = await db
      .from("screenshot_observations")
      .select("id", { count: "exact", head: true })
      .eq("batch_id", existing.id);
    return { batchId: existing.id, rows: count ?? SAMPLE.length, created: false };
  }

  const { data: batch, error: batchError } = await db
    .from("screenshot_batches")
    .insert({
      whatsapp_account: account,
      capture_window_start: new Date(now - 3 * 86_400_000).toISOString(),
      capture_window_end: new Date(now).toISOString(),
      screenshot_count: 1,
      visible_rows_expected: SAMPLE.length,
      rows_segmented: SAMPLE.length,
      rows_reconciled: SAMPLE.length,
      unresolved_count: 0,
      detected_rows_total: SAMPLE.length,
      status: "complete",
      metadata: { mode: "sample-demo" },
    })
    .select("id")
    .single();
  if (batchError) throw batchError;

  const { data: shot, error: shotError } = await db
    .from("whatsapp_screenshots")
    .insert({
      batch_id: batch.id,
      whatsapp_account: account,
      image_hash: `sample-demo-${now}`,
      captured_at: new Date(now).toISOString(),
      visible_row_count: SAMPLE.length,
      processing_status: "extracted",
      ai_visible_row_count: SAMPLE.length,
      extraction_confidence: 0.95,
      extraction_model: "demo",
      file_name: "sample-inbox.png",
    })
    .select("id")
    .single();
  if (shotError) throw shotError;

  for (const [index, row] of SAMPLE.entries()) {
    const [name, phone, message, seen, colour, handler, label, unread] = row;
    const at = new Date(now - (index + 1) * 3_600_000).toISOString();
    const e164 = `+91${phone}`;

    const { data: found } = await db.from("leads").select("id").eq("phone", e164).limit(1).maybeSingle();
    let leadId = found?.id as string | undefined;

    if (!leadId) {
      const { data: lead, error: leadError } = await db
        .from("leads")
        .insert({
          phone: e164,
          wa_name: name,
          location_text: "Bengaluru",
          status: "open",
          priority: unread > 1 ? "hot" : "active",
          last_wa_message: message,
          last_wa_seen_at: at,
          wa_seen_state: seen,
          wa_unread_count: unread,
          wa_label_colour: colour,
          wa_label_name: label,
          current_handler_name: handler,
          lead_source: "Sample demo",
          conversation_bucket: label,
          latest_whatsapp_preview: message,
          latest_whatsapp_observation_at: at,
        })
        .select("id")
        .single();
      if (leadError) throw leadError;
      leadId = lead.id;
    }

    const { error: obsError } = await db.from("screenshot_observations").insert({
      screenshot_id: shot.id,
      batch_id: batch.id,
      whatsapp_account: account,
      row_index: index + 1,
      contact_name: name,
      phone_raw: phone,
      phone_normalized: e164,
      lead_id: leadId,
      visible_timestamp_raw: new Date(at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
      last_message_preview: message,
      preview_direction: seen === "unseen" ? "incoming" : "unknown",
      unread_visible: unread > 0,
      unread_count: unread,
      seen_state: seen,
      color_hint: colour,
      detected_label: label,
      handler_hint: handler,
      ocr_confidence: 95,
      raw_text: `${name} | ${phone} | ${message}`,
      captured_at: at,
      reconciliation_state: "matched_existing",
      intelligence: { source: "sample-demo" },
    });
    if (obsError) throw obsError;
  }

  return { batchId: batch.id, rows: SAMPLE.length, created: true };
});
