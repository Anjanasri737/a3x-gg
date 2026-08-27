// Lead ↔ PG assignment with auto-injected verified copy-paste messages.
// Stored locally so every CRM surface (tower lead detail, workflow actions,
// guardrails) reads the same assignment without a schema change.
import { useCallback, useEffect, useState } from "react";
import type { PG } from "../data/types";
import { messageKit, type MsgKind } from "./messages-kit";

const KEY = "gharpayy.lead-pg-assignment.v1";

export interface AssignedPG {
  leadId: string;
  pgName: string;
  pgId: string;
  assignedAt: string;
  /** Verified verbatim messages, injected at assignment time. */
  messages: Record<MsgKind, string>;
  pitch: string;
}

type Map_ = Record<string, AssignedPG>;

function read(): Map_ {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(KEY) ?? "{}") as Map_;
  } catch {
    return {};
  }
}

function write(m: Map_) {
  window.localStorage.setItem(KEY, JSON.stringify(m));
  window.dispatchEvent(new Event("gharpayy:lead-pg-assignment"));
}

export function buildMessages(pg: PG): { messages: Record<MsgKind, string>; pitch: string } {
  const kit = messageKit(pg);
  const messages = kit.reduce<Record<MsgKind, string>>(
    (acc, m) => ({ ...acc, [m.kind]: m.text }),
    { location: "", pricing: "", amenities: "", food: "" },
  );
  const pitch = [messages.location, messages.pricing, messages.amenities].filter(Boolean).join("\n\n———\n\n");
  return { messages, pitch };
}

export function assignPGToLead(leadId: string, pg: PG): AssignedPG {
  const { messages, pitch } = buildMessages(pg);
  const rec: AssignedPG = {
    leadId,
    pgName: pg.name,
    pgId: pg.id,
    assignedAt: new Date().toISOString(),
    messages,
    pitch,
  };
  const m = read();
  m[leadId] = rec;
  write(m);
  return rec;
}

export function clearAssignment(leadId: string) {
  const m = read();
  delete m[leadId];
  write(m);
}

export function assignmentFor(leadId: string): AssignedPG | null {
  return read()[leadId] ?? null;
}

export function useAssignedPG(leadId: string | null | undefined) {
  const [rec, setRec] = useState<AssignedPG | null>(null);

  const sync = useCallback(() => {
    setRec(leadId ? (read()[leadId] ?? null) : null);
  }, [leadId]);

  useEffect(() => {
    sync();
    window.addEventListener("gharpayy:lead-pg-assignment", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("gharpayy:lead-pg-assignment", sync);
      window.removeEventListener("storage", sync);
    };
  }, [sync]);

  return {
    assigned: rec,
    assign: (pg: PG) => (leadId ? assignPGToLead(leadId, pg) : null),
    clear: () => leadId && clearAssignment(leadId),
  };
}
