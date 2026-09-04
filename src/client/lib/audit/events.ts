import type { CapabilityRisk } from "../../types/capability";

export type AuditStage = "requested" | "completed" | "failed" | "granted" | "revoked";

export interface AuditEvent {
  id: string;
  timestamp: string;
  tool: string;
  source: string;
  stage: AuditStage;
  risk: CapabilityRisk;
  durationMs?: number;
  detail?: string;
}

type Listener = (events: AuditEvent[]) => void;

const events: AuditEvent[] = [];
const listeners = new Set<Listener>();

/** Every agent action passes through here, so nothing an agent does is silent. */
export function audit(event: Omit<AuditEvent, "id" | "timestamp">): AuditEvent {
  const full: AuditEvent = {
    ...event,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
  };
  events.unshift(full);
  if (events.length > 200) events.length = 200;
  listeners.forEach((l) => l(events));
  return full;
}

export function onAudit(listener: Listener): () => void {
  listeners.add(listener);
  listener(events);
  return () => listeners.delete(listener);
}

export function getAuditEvents(): AuditEvent[] {
  return events;
}

export function auditCounts() {
  return {
    total: events.filter((e) => e.stage === "completed" || e.stage === "failed").length,
    completed: events.filter((e) => e.stage === "completed").length,
    failed: events.filter((e) => e.stage === "failed").length,
  };
}
