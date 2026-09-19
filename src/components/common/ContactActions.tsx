// One row of contact buttons used everywhere a phone number shows:
// copy the number (best on a laptop), dial it (best on a phone), and open the
// WhatsApp chat straight away.
import { Copy, Phone } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Digits only, with the India country code when it is missing. */
export function waNumber(phone: string) {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 11 && digits.startsWith("0")) return `91${digits.slice(1)}`;
  return digits;
}

export function waLink(phone: string, message?: string) {
  const n = waNumber(phone);
  const text = message ? `?text=${encodeURIComponent(message)}` : "";
  return n ? `https://wa.me/${n}${text}` : "";
}

export async function copyText(value: string, what = "Number") {
  try {
    if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(value);
    else {
      const el = document.createElement("textarea");
      el.value = value;
      el.style.position = "fixed";
      el.style.opacity = "0";
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      el.remove();
    }
    toast.success(`${what} copied`, { description: value });
  } catch {
    toast.error(`Could not copy the ${what.toLowerCase()}`, { description: value });
  }
}

export function ContactActions({
  phone,
  name,
  message,
  className,
  compact,
}: {
  phone?: string | null;
  name?: string;
  message?: string;
  className?: string;
  compact?: boolean;
}) {
  if (!phone) return null;
  const chat = waLink(phone, message ?? (name ? `Hi ${name}, this is Gharpayy.` : undefined));
  const stop = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
  };
  const h = compact ? "h-6" : "h-7";

  return (
    <span className={cn("inline-flex items-center gap-1", className)} onClick={(e) => e.stopPropagation()}>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className={cn(h, "gap-1 px-1.5 text-[11px]")}
        title={`Copy ${phone}`}
        aria-label={`Copy ${phone}`}
        onClick={(e) => {
          stop(e);
          void copyText(phone, "Number");
        }}
      >
        <Copy className="h-3 w-3" />
        {!compact && <span className="hidden sm:inline">Copy</span>}
      </Button>

      <Button
        asChild
        size="sm"
        variant="outline"
        className={cn(h, "gap-1 px-1.5 text-[11px]")}
        title={`Call ${phone}`}
      >
        <a href={`tel:${phone.replace(/\s/g, "")}`} aria-label={`Call ${phone}`} onClick={(e) => e.stopPropagation()}>
          <Phone className="h-3 w-3" />
          {!compact && <span className="hidden sm:inline">Call</span>}
        </a>
      </Button>

      {chat && (
        <Button
          asChild
          size="sm"
          variant="outline"
          className={cn(h, "gap-1 border-emerald-500/40 px-1.5 text-[11px] text-emerald-600 hover:bg-emerald-500/10 dark:text-emerald-400")}
          title={`Open the WhatsApp chat with ${name ?? phone}`}
        >
          <a href={chat} target="_blank" rel="noreferrer" aria-label={`Open WhatsApp chat with ${name ?? phone}`} onClick={(e) => e.stopPropagation()}>
            <WaMark />
            {!compact && <span className="hidden sm:inline">WhatsApp</span>}
          </a>
        </Button>
      )}
    </span>
  );
}

/** The WhatsApp mark, drawn so it needs no image or network call. */
export function WaMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={cn("h-3.5 w-3.5 fill-current", className)}>
      <path d="M12.04 2C6.6 2 2.2 6.4 2.2 11.84c0 1.94.55 3.75 1.5 5.28L2 22l5.03-1.64a9.9 9.9 0 0 0 5.01 1.36c5.44 0 9.84-4.4 9.84-9.84S17.48 2 12.04 2Zm5.72 13.9c-.24.68-1.4 1.3-1.93 1.35-.53.05-1.02.24-3.46-.72-2.95-1.16-4.8-4.23-4.94-4.43-.14-.2-1.16-1.55-1.16-2.95 0-1.4.73-2.09 1-2.38.26-.29.57-.36.76-.36l.55.01c.17 0 .41-.07.63.48.24.58.8 2 .87 2.14.07.15.12.32.02.51-.1.2-.15.32-.29.49l-.44.5c-.14.15-.29.31-.13.6.17.29.74 1.22 1.58 1.98 1.09.97 2 1.28 2.29 1.42.29.15.46.12.63-.07.17-.2.73-.85.93-1.14.2-.29.39-.24.66-.15.27.1 1.7.8 1.99.95.29.14.48.22.55.34.07.13.07.72-.17 1.4Z" />
    </svg>
  );
}
