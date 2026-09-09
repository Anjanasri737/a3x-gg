// Draft Vision — WhatsApp screenshot -> structured chat rows.
// The model is asked to behave like a chat-row detector, not a text OCR dump:
// every visible row on the left chat list becomes one object with per-field
// confidence. Nothing is invented; unreadable fields come back null.
import { createServerFn } from "@tanstack/react-start";

export interface VisionRawRow {
  position: number;
  displayName: string | null;
  phoneVisible: string | null;
  lastMessageText: string | null;
  lastMessageType:
    | "text" | "photo" | "video" | "document" | "location" | "voice" | "sticker" | "unknown" | null;
  lastMessageDirection: "customer" | "us" | "unknown" | null;
  deliveryTicks: "sent" | "delivered" | "read" | "none" | null;
  visibleTimestampText: string | null;
  unreadCount: number | null;
  unread: boolean | null;
  pinned: boolean | null;
  muted: boolean | null;
  chatType: "individual" | "group" | "unknown" | null;
  mention: boolean | null;
  ocrConfidence: number | null;
}

export interface VisionResult {
  rows: VisionRawRow[];
  notes?: string;
}

const SYSTEM = `You read WhatsApp Web/desktop screenshots.
Look ONLY at the left-hand chat list panel. Ignore the open conversation on the right, the browser chrome, the tab bar, the sidebar icons and the search box.

For EVERY visible chat row in that list, in top-to-bottom order, return one object with exactly these keys:
position (1-based), displayName, phoneVisible, lastMessageText, lastMessageType, lastMessageDirection, deliveryTicks, visibleTimestampText, unreadCount, unread, pinned, muted, chatType, mention, ocrConfidence.

Rules:
- displayName is exactly what is printed (a saved name, a company name, or a phone number).
- phoneVisible only when digits are actually printed in the row; otherwise null.
- lastMessageText is the verbatim preview line. If the preview is an attachment label (Photo, Video, Document, Location, Voice message), set lastMessageType accordingly and keep the visible label as the text.
- lastMessageDirection is "us" only when outgoing ticks are visible before the preview, "customer" when clearly incoming, otherwise "unknown".
- visibleTimestampText is the raw right-aligned value exactly as shown: "4:22 pm", "Friday", "2/9/2026", "Yesterday". Never convert it.
- unreadCount is the green badge number, null when there is no badge.
- ocrConfidence is 0-1, your confidence that you read this row correctly.
- Never invent a value. Unreadable or absent fields are null.
- Banners, section headers, "Turn on background sync" cards and filter chips are NOT chat rows.

Respond with JSON only: {"rows":[...]} and nothing else.`;

export const extractWhatsappRows = createServerFn({ method: "POST" })
  .inputValidator((input: { images: string[] }) => {
    if (!Array.isArray(input?.images) || !input.images.length) throw new Error("No screenshot supplied");
    if (input.images.length > 6) throw new Error("Max 6 screenshots per import");
    return { images: input.images };
  })
  .handler(async ({ data }): Promise<VisionResult> => {
    const key = process.env["LOVABLE_API_KEY"];
    if (!key) throw new Error("AI is not configured for this project");

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": key, "X-Lovable-AIG-SDK": "fetch" },
      body: JSON.stringify({
        model: "google/gemini-3.8-flash",
        messages: [
          { role: "system", content: SYSTEM },
          {
            role: "user",
            content: [
              { type: "text", text: "Extract every chat row from the left chat list of these screenshots." },
              ...data.images.map((url) => ({ type: "image_url", image_url: { url } })),
            ],
          },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      if (res.status === 429) throw new Error("Too many screenshots at once — wait a few seconds and paste again.");
      if (res.status === 402) throw new Error("AI credits are exhausted for this workspace.");
      throw new Error(`Screenshot reading failed (${res.status}). ${body.slice(0, 200)}`);
    }

    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const text = json.choices?.[0]?.message?.content ?? "";
    let parsed: { rows?: VisionRawRow[]; notes?: string };
    try {
      parsed = JSON.parse(text);
    } catch {
      const m = text.match(/\{[\s\S]*\}/);
      if (!m) throw new Error("Could not read the screenshot — try a sharper, uncropped image.");
      parsed = JSON.parse(m[0]);
    }

    const rows = (parsed.rows ?? [])
      .filter((r) => r && (r.displayName || r.phoneVisible))
      .map((r, i) => ({ ...r, position: r.position ?? i + 1 }));

    return { rows, notes: parsed.notes };
  });
