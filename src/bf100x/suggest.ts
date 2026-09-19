// Label suggestions read straight off the journey answers, so the label console
// is never a blank form.
import type { FlowLead } from "@/bookingflow/types";

export function suggestedLabels(lead: FlowLead): string[] {
  const f = lead.f ?? {};
  const out: string[] = [];
  if (f["call"] === "NO_ANSWER") out.push("No answer");
  if (f["call"] === "CALLBACK") out.push("Callback requested");
  if (f["call"] === "CONNECTED") out.push("Connected");
  if (f["reply"] === "SENT_NO_REPLY") out.push("Waiting for reply");
  if (f["reply"] === "DRAFT_ONLY") out.push("Draft only — not sent");
  if (f["where"] === "DUPLICATE") out.push("Duplicate");
  if (f["feasible"] === "NO") out.push("Not serviceable");
  if (f["intent"] === "VERY_HIGH") out.push("Ready to book");
  if (f["intent"] === "LOW") out.push("Just asking");
  if (f["tourReady"] === "READY") out.push("Tour ready");
  if (f["tourVisit"] === "NO_SHOW") out.push("Tour no show");
  if (f["decision"] === "NEGOTIATING") out.push("Negotiating");
  if (f["payment"] === "PENDING") out.push("Payment pending");
  if (f["approval"] && f["approval"] !== "APPROVED") out.push("Property rejected");
  if (f["checkinDay"] === "CHECKED_IN") out.push("Checked in");
  if (!lead.owner) out.push("No owner");
  return out.filter((x, i, a) => a.indexOf(x) === i);
}

export const QUICK_LABELS = [
  "Hot", "Cold", "Ready to book", "Tour ready", "Tour no show", "Negotiating",
  "Waiting for reply", "No answer", "Callback requested", "Connected",
  "Payment pending", "Property rejected", "Duplicate", "Not serviceable",
  "Budget mismatch", "Area mismatch", "Just asking", "Checked in",
];
