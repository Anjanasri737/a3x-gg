// One canonical customer id shared by Draft Vision, Movement OS, Booking Flow
// Split and Admin. Phone wins (it is the WhatsApp identity); a cleaned name is
// the fallback so name-only screenshot rows still resolve to one customer.
import { normalizeName } from "@/lib/lead-identity/normalize";

export interface CanonicalInput {
  phone?: string | null;
  name?: string | null;
}

/** Last 10 digits of any Indian-style number, or "" when there is no number. */
export function phoneKey(phone?: string | null): string {
  const d = (phone ?? "").replace(/\D/g, "");
  return d.length >= 10 ? d.slice(-10) : "";
}

export function nameKey(name?: string | null): string {
  return normalizeName(name ?? "").replace(/\s+/g, "-");
}

/**
 * Canonical id for a customer. Stable across surfaces and across reloads:
 * "p:9876543210" when a number is known, otherwise "n:rahul-sharma".
 */
export function canonicalCustomerId(input: CanonicalInput): string {
  const p = phoneKey(input.phone);
  if (p) return `p:${p}`;
  const n = nameKey(input.name);
  return n ? `n:${n}` : "";
}

/** True when two records describe the same customer. */
export function sameCustomer(a: CanonicalInput, b: CanonicalInput): boolean {
  const ca = canonicalCustomerId(a);
  return ca !== "" && ca === canonicalCustomerId(b);
}
