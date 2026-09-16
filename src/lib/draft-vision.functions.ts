// Draft Vision — WhatsApp screenshot -> structured chat rows.
// The model is asked to behave like a chat-row detector, not a text OCR dump:
// every visible row on the left chat list becomes one object with per-field
// confidence. Nothing is invented; unreadable fields come back null.
import { createServerFn } from "@tanstack/react-start";

export interface VisionRawRow {
  screenshotIndex: number | null;
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
  avatarPresent: boolean | null;
  avatarCrop: {
    leftPct: number;
    topPct: number;
    rightPct: number;
    bottomPct: number;
  } | null;
  ocrConfidence: number | null;
}

export interface VisionResult {
  rows: VisionRawRow[];
  notes?: string;
}

const SYSTEM = `You read WhatsApp Web/desktop screenshots.
Look ONLY at the left-hand chat list panel. Ignore the open conversation on the right, the browser chrome, the tab bar, the sidebar icons and the search box.

For EVERY visible chat row in that list, in top-to-bottom order, return one object with exactly these keys:
screenshotIndex (0-based input image index), position (1-based within that screenshot), displayName, phoneVisible, lastMessageText, lastMessageType, lastMessageDirection, deliveryTicks, visibleTimestampText, unreadCount, unread, pinned, muted, chatType, mention, avatarPresent, avatarCrop, ocrConfidence.

Rules:
- displayName is exactly what is printed (a saved name, a company name, or a phone number).
- phoneVisible only when digits are actually printed in the row; otherwise null.
- lastMessageText is the verbatim preview line. If the preview is an attachment label (Photo, Video, Document, Location, Voice message), set lastMessageType accordingly and keep the visible label as the text.
- lastMessageDirection is "us" only when outgoing ticks are visible before the preview, "customer" when clearly incoming, otherwise "unknown".
- visibleTimestampText is the raw right-aligned value exactly as shown: "4:22 pm", "Friday", "2/9/2026", "Yesterday". Never convert it.
- unreadCount is the green badge number, null when there is no badge.
- avatarPresent is true when the row has a visible profile photo or avatar. avatarCrop is the tight square around that avatar as percentages of the full screenshot: {"leftPct":0-100,"topPct":0-100,"rightPct":0-100,"bottomPct":0-100}. Return null when the bounds are uncertain. Do not include any floating app button or sidebar icon.
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

    const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": key, "X-Lovable-AIG-SDK": "fetch" },
      body: JSON.stringify({
        model: "openai/gpt-6-astra",
        stream: true,
        reasoning: { effort: "low", summary: "auto" },
        store: false,
        text: { format: { type: "json_object" } },
        input: [
          { role: "developer", content: [{ type: "input_text", text: SYSTEM }] },
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: "Extract every chat row from the left chat list of these screenshots. Answer with JSON only.",
              },
              ...data.images.map((url) => ({ type: "input_image", image_url: url })),
            ],
          },
        ],
      }),
    });

    if (!res.ok || !res.body) {
      const body = await res.text().catch(() => "");
      if (res.status === 429) throw new Error("Too many screenshots at once — wait a few seconds and paste again.");
      if (res.status === 402) throw new Error("AI credits are exhausted for this workspace.");
      throw new Error(`Screenshot reading failed (${res.status}). ${body.slice(0, 300)}`);
    }

    // Reasoning runs stream: accumulate the answer deltas, never buffer the call.
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    let text = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        try {
          const evt = JSON.parse(payload) as { type?: string; delta?: string; response?: { output_text?: string } };
          if (evt.type === "response.output_text.delta" && typeof evt.delta === "string") text += evt.delta;
          else if (evt.type === "response.completed" && evt.response?.output_text) text ||= evt.response.output_text;
        } catch {
          /* keep reading */
        }
      }
    }

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
