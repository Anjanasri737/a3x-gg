// WhatsApp auto-ingestion bridge.
// Every inbound WhatsApp message becomes one customer state: matched by phone
// (+ WhatsApp business account) when the CRM already knows the number, or a
// shadow lead created on the spot when it does not. Chats we cannot identify at
// all land in the unmatched queue, which the desk drives to zero.
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useMovement } from "@/movement/store";
import type { MovementState } from "@/movement/types";

export const WA_ACCOUNTS = ["WA-Gharpayy-1", "WA-Gharpayy-2", "WA-Gharpayy-Sales"] as const;
export type WaAccount = (typeof WA_ACCOUNTS)[number];

export type IngestStatus = "matched" | "shadow" | "unmatched";

export interface WaIncoming {
  id: string;
  ts: string;
  phoneRaw: string;
  digits: string;
  waAccount: string;
  name?: string;
  zone?: string;
  text: string;
  ulid?: string;
  status: IngestStatus;
}

export const digitsOf = (p?: string) => (p ?? "").replace(/\D/g, "");
export const last4of = (p?: string) => digitsOf(p).slice(-4);
export const shadowUlid = (phone: string, account: string) =>
  `wa-${account.replace(/\W+/g, "").toLowerCase()}-${digitsOf(phone).slice(-10)}`;

const ZONES: Array<[string, string]> = [
  ["Koramangala", "KOR"], ["HSR Layout", "HSR"], ["BTM Layout", "BTM"], ["Indiranagar", "IDR"],
  ["Whitefield", "WFD"], ["Marathahalli", "MRT"], ["Bellandur", "BLD"], ["Electronic City", "ECT"],
  ["JP Nagar", "JPN"], ["Sarjapur Road", "SJR"],
];

const TEXTS = [
  "Hi, is any single room available?",
  "Bhai rent kitna hai?",
  "Can I visit today evening?",
  "Sharing room available for girls?",
  "Need PG near office, budget 12k",
  "Is food included?",
  "Any room from 1st?",
  "Please share photos",
  "Still available?",
  "I need immediate move in",
];

const FIRST = ["Aman", "Riya", "Sanjay", "Neha", "Vivek", "Anjali", "Rakesh", "Shreya", "Imran", "Pallavi"];
const LAST = ["Sharma", "Nair", "Reddy", "Khan", "Iyer", "Ghosh", "Patil", "Menon"];

const rnd = <T,>(a: readonly T[]) => a[Math.floor(Math.random() * a.length)];
const now = () => new Date().toISOString();
const uid = (p: string) => `${p}-${Math.random().toString(36).slice(2, 9)}`;

export interface IngestInput {
  phoneRaw: string;
  waAccount?: string;
  name?: string;
  zone?: string;
  location?: string;
  text?: string;
  /** minutes ago the message arrived — used when seeding real stuck chats */
  agoMins?: number;
  /** when true a chat with no name goes to the unmatched queue instead of a shadow lead */
  strictIdentity?: boolean;
}

/** Find the movement state that owns this phone number, if any. */
export function findByPhone(phone: string): MovementState | null {
  const d = digitsOf(phone).slice(-10);
  if (!d) return null;
  const states = Object.values(useMovement.getState().states);
  return states.find((s) => digitsOf(s.phone).slice(-10) === d) ?? null;
}

/** All CRM states whose number ends with these 4 digits. */
export function findByLast4(l4: string): MovementState[] {
  if (l4.length < 4) return [];
  return Object.values(useMovement.getState().states).filter((s) => last4of(s.phone) === l4);
}

/**
 * One inbound WhatsApp message -> one event -> one customer state.
 * Returns the feed row it produced.
 */
export function ingestMessage(input: IngestInput): WaIncoming {
  const mv = useMovement.getState();
  const account = input.waAccount ?? WA_ACCOUNTS[0];
  const text = input.text ?? rnd(TEXTS);
  const ts = new Date(Date.now() - (input.agoMins ?? 0) * 60_000).toISOString();
  const digits = digitsOf(input.phoneRaw);

  const row: WaIncoming = {
    id: uid("wa"),
    ts,
    phoneRaw: input.phoneRaw,
    digits,
    waAccount: account,
    name: input.name,
    zone: input.zone,
    text,
    status: "matched",
  };

  const existing = findByPhone(input.phoneRaw);
  if (existing) {
    mv.customerReplied(existing.ulid, text);
    row.ulid = existing.ulid;
    row.status = "matched";
    row.name = row.name ?? existing.name;
    row.zone = row.zone ?? existing.zone;
    useBridge.getState().push(row, "matched");
    return row;
  }

  if (input.strictIdentity && !input.name) {
    mv.addUnmatched({
      phoneRaw: input.phoneRaw,
      waAccount: account,
      lastMessage: text,
      reason: "No CRM identity for this number",
    });
    row.status = "unmatched";
    useBridge.getState().push(row, "unmatched");
    return row;
  }

  const [loc, zone] = rnd(ZONES);
  const ulid = shadowUlid(input.phoneRaw, account);
  mv.ensureShadow({
    ulid,
    name: input.name ?? `WA ···${digits.slice(-4)}`,
    phone: input.phoneRaw,
    waAccount: account,
    zone: input.zone ?? zone,
    location: input.location ?? loc,
    ownerId: "u-self",
    ownerName: "You",
    unread: 1,
    lastCustomerMsgAt: ts,
    lastCustomerMsg: text,
  });
  mv.customerReplied(ulid, text);
  row.ulid = ulid;
  row.status = "shadow";
  row.zone = row.zone ?? zone;
  useBridge.getState().push(row, "shadow");
  return row;
}

/** Promote an unmatched chat into a real shadow lead. */
export function claimUnmatched(id: string, name?: string) {
  const mv = useMovement.getState();
  const u = mv.unmatched.find((x) => x.id === id);
  if (!u) return null;
  const row = ingestMessage({
    phoneRaw: u.phoneRaw,
    waAccount: u.waAccount,
    name: name || u.name || `WA ···${digitsOf(u.phoneRaw).slice(-4)}`,
    text: u.lastMessage,
  });
  mv.resolveUnmatched(id);
  return row;
}

/**
 * Seed real stuck chats: numbers that messaged hours ago and never got a reply.
 * These are exactly what the D1–D4 drafts are supposed to clear.
 */
export function seedStuckChats(count = 40): number {
  let made = 0;
  for (let i = 0; i < count; i++) {
    const phone = `9${String(700000000 + i * 91733).slice(0, 9)}`;
    if (findByPhone(phone)) continue;
    const [loc, zone] = ZONES[i % ZONES.length];
    ingestMessage({
      phoneRaw: phone,
      waAccount: WA_ACCOUNTS[i % WA_ACCOUNTS.length],
      name: `${FIRST[i % FIRST.length]} ${LAST[(i * 3) % LAST.length]}`,
      zone,
      location: loc,
      text: TEXTS[i % TEXTS.length],
      agoMins: 90 + i * 37,
    });
    made++;
  }
  // a handful of genuinely unidentifiable chats so the unmatched queue is real
  for (let i = 0; i < 3; i++) {
    ingestMessage({
      phoneRaw: `8${String(100000000 + i * 777771).slice(0, 9)}`,
      waAccount: WA_ACCOUNTS[i % WA_ACCOUNTS.length],
      text: TEXTS[(i + 4) % TEXTS.length],
      strictIdentity: true,
      agoMins: 40 + i * 25,
    });
  }
  return made;
}

/** One random inbound message: half from numbers we know, half brand new. */
export function simulateInbound(): WaIncoming {
  const states = Object.values(useMovement.getState().states).filter((s) => s.phone);
  const reuse = states.length > 0 && Math.random() < 0.55;
  if (reuse) {
    const s = rnd(states);
    return ingestMessage({ phoneRaw: s.phone!, waAccount: s.waAccount, name: s.name, text: rnd(TEXTS) });
  }
  const phone = `9${Math.floor(100000000 + Math.random() * 899999999)}`;
  const named = Math.random() < 0.7;
  return ingestMessage({
    phoneRaw: phone,
    waAccount: rnd(WA_ACCOUNTS),
    name: named ? `${rnd(FIRST)} ${rnd(LAST)}` : undefined,
    strictIdentity: !named,
  });
}

interface BridgeState {
  live: boolean;
  feed: WaIncoming[];
  matched: number;
  shadows: number;
  unmatched: number;
  seededAt: string | null;
  setLive: (v: boolean) => void;
  push: (row: WaIncoming, status: IngestStatus) => void;
  clear: () => void;
  markSeeded: () => void;
}

export const useBridge = create<BridgeState>()(
  persist(
    (set) => ({
      live: false,
      feed: [],
      matched: 0,
      shadows: 0,
      unmatched: 0,
      seededAt: null,
      setLive: (v) => set({ live: v }),
      push: (row, status) =>
        set((s) => ({
          feed: [row, ...s.feed].slice(0, 120),
          matched: s.matched + (status === "matched" ? 1 : 0),
          shadows: s.shadows + (status === "shadow" ? 1 : 0),
          unmatched: s.unmatched + (status === "unmatched" ? 1 : 0),
        })),
      clear: () => set({ feed: [], matched: 0, shadows: 0, unmatched: 0 }),
      markSeeded: () => set({ seededAt: now() }),
    }),
    { name: "gharpayy.wabridge.v1" },
  ),
);

/** Run once on Final Moment mount: make sure the drafts have real stuck chats. */
export function ensureStuckChats(min = 40) {
  if (typeof window === "undefined") return 0;
  if (useBridge.getState().seededAt) return 0;
  const made = seedStuckChats(min);
  useBridge.getState().markSeeded();
  return made;
}

/** Chats waiting on us: customer spoke last, long enough ago to be "stuck". */
export function stuckChats(states: MovementState[], minMins = 60) {
  const cut = Date.now() - minMins * 60_000;
  return states
    .filter((s) => {
      if (s.stage === "booked" || s.stage === "check-in" || s.stage === "lost") return false;
      const last = s.lastCustomerMsgAt ? +new Date(s.lastCustomerMsgAt) : 0;
      if (!last || last > cut) return false;
      const out = s.lastOutboundAt ? +new Date(s.lastOutboundAt) : 0;
      return out < last;
    })
    .sort((a, b) => +new Date(a.lastCustomerMsgAt!) - +new Date(b.lastCustomerMsgAt!));
}
