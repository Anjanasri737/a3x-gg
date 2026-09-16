import { useMemo, useState } from "react";
import { Check, CheckCheck, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import type { TruthRow } from "@/lib/flow-os/service";

const AVATAR_TINTS = [
  "bg-[#6a7175]", "bg-[#5b7f6d]", "bg-[#7a6a86]", "bg-[#86705b]",
  "bg-[#4f6d86]", "bg-[#86545b]", "bg-[#5d6f4f]", "bg-[#6b5f86]",
];

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "#";
}

function tint(key: string) {
  let sum = 0;
  for (const ch of key) sum += ch.charCodeAt(0);
  return AVATAR_TINTS[sum % AVATAR_TINTS.length];
}

function waTime(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const yesterday = new Date(now.getTime() - 86400000).toDateString() === d.toDateString();
  if (sameDay) return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (yesterday) return "Yesterday";
  return d.toLocaleDateString([], { day: "2-digit", month: "2-digit", year: "2-digit" });
}

const LABEL_COLOURS: Record<string, string> = {
  green: "#25d366", orange: "#f5a623", red: "#ea4335",
  blue: "#34b7f1", grey: "#8696a0", gray: "#8696a0", yellow: "#ffd279",
};

/** Chat list that mirrors the WhatsApp inbox so a synced screenshot feels identical. */
export function WhatsAppInbox({ rows, onOpen }: { rows: TruthRow[]; onOpen: (row: TruthRow) => void }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      (r.wa_name ?? "").toLowerCase().includes(q) ||
      (r.phone ?? "").includes(q) ||
      (r.last_message_preview ?? "").toLowerCase().includes(q));
  }, [rows, query]);

  return (
    <div className="overflow-hidden rounded-xl border border-[#2a3942] bg-[#111b21] text-[#e9edef] shadow-lg">
      <div className="flex items-center justify-between gap-3 border-b border-[#2a3942] bg-[#202c33] px-4 py-3">
        <span className="text-lg font-semibold">Chats</span>
        <span className="text-xs text-[#8696a0]">{filtered.length} conversations</span>
      </div>

      <div className="bg-[#111b21] px-3 py-2">
        <div className="flex items-center gap-2 rounded-lg bg-[#202c33] px-3">
          <Search className="h-4 w-4 shrink-0 text-[#8696a0]" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search or start a new chat"
            className="h-9 border-0 bg-transparent px-0 text-sm text-[#e9edef] placeholder:text-[#8696a0] focus-visible:ring-0"
          />
        </div>
      </div>

      <ul className="max-h-[70vh] divide-y divide-[#202c33] overflow-y-auto">
        {filtered.map((row) => {
          const name = row.wa_name || row.phone || "Unknown";
          const unread = row.unread_visible ? (row.unread_count && row.unread_count > 0 ? row.unread_count : 1) : 0;
          const outgoing = (row.preview_direction ?? "").toLowerCase() === "outgoing";
          const dot = LABEL_COLOURS[(row.color_hint ?? "").toLowerCase()];
          return (
            <li key={row.lead_id}>
              <button
                type="button"
                onClick={() => onOpen(row)}
                className="flex w-full items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-[#202c33]"
              >
                <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white ${tint(name)}`}>
                  {initials(name)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-[15px] font-medium">{name}</span>
                    <span className={`shrink-0 text-[11px] ${unread ? "text-[#25d366]" : "text-[#8696a0]"}`}>
                      {waTime(row.latest_observation_at)}
                    </span>
                  </span>
                  <span className="mt-0.5 flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-1 text-[13px] text-[#8696a0]">
                      {outgoing && <CheckCheck className="h-4 w-4 shrink-0 text-[#53bdeb]" />}
                      {!outgoing && row.seen_state === "seen" && <Check className="h-4 w-4 shrink-0 text-[#8696a0]" />}
                      <span className="truncate">{row.last_message_preview || "No message captured"}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      {dot && <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: dot }} />}
                      {unread > 0 && (
                        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[#25d366] px-1.5 text-[11px] font-semibold text-[#111b21]">
                          {unread}
                        </span>
                      )}
                    </span>
                  </span>
                  <span className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-[#8696a0]">
                    <span>{row.phone}</span>
                    {row.detected_label && (
                      <span className="rounded-sm bg-[#202c33] px-1.5 py-0.5 text-[#8696a0]">{row.detected_label}</span>
                    )}
                    {row.handler_hint && <span>· {row.handler_hint}</span>}
                    {row.next_action_kind && <span>· next: {row.next_action_kind.replaceAll("_", " ")}</span>}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
        {!filtered.length && (
          <li className="px-4 py-10 text-center text-sm text-[#8696a0]">No chats to show yet.</li>
        )}
      </ul>
    </div>
  );
}
