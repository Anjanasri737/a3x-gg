import { Check } from "lucide-react";
import type { JourneyStep } from "@/lib/lead-os/library";

export const FALLBACK_STEPS: JourneyStep[] = [
  { code: "S1", ordinal: 1, name: "Captured", purpose: "", done_when: "", owner_role: "" },
  { code: "S2", ordinal: 2, name: "Qualified", purpose: "", done_when: "", owner_role: "" },
  { code: "S3", ordinal: 3, name: "Matched", purpose: "", done_when: "", owner_role: "" },
  { code: "S4", ordinal: 4, name: "Property reviewed", purpose: "", done_when: "", owner_role: "" },
  { code: "S5", ordinal: 5, name: "Visit fixed", purpose: "", done_when: "", owner_role: "" },
  { code: "S6", ordinal: 6, name: "Tour done", purpose: "", done_when: "", owner_role: "" },
  { code: "S7", ordinal: 7, name: "Negotiation", purpose: "", done_when: "", owner_role: "" },
  { code: "S8", ordinal: 8, name: "Booked", purpose: "", done_when: "", owner_role: "" },
  { code: "S9", ordinal: 9, name: "Checked in", purpose: "", done_when: "", owner_role: "" },
];

export function LeadJourneyStrip({
  steps = FALLBACK_STEPS,
  currentIndex,
  compact = false,
}: {
  steps?: JourneyStep[];
  currentIndex: number;
  compact?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {steps.map((step) => {
        const done = step.ordinal < currentIndex;
        const current = step.ordinal === currentIndex;
        return (
          <span
            key={step.code}
            title={`${step.code} · ${step.name}${step.done_when ? ` — done when: ${step.done_when}` : ""}`}
            className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${
              current
                ? "border-primary bg-primary text-primary-foreground"
                : done
                  ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                  : "border-border text-muted-foreground"
            }`}
          >
            {done && <Check className="h-3 w-3" />}
            {step.code}
            {!compact && <span className="hidden sm:inline">· {step.name}</span>}
          </span>
        );
      })}
    </div>
  );
}
