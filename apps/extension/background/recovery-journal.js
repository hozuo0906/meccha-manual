import { normalizeCaptureEvent } from "../capture/privacy.js";

export const MAX_RECOVERY_EVENTS = 1000;

export function mergeRecoveryEvents(existing = [], incoming = []) {
  const byId = new Map();
  const anonymous = [];
  for (const event of [...existing, ...incoming]) {
    if (!event) continue;
    const normalized = normalizeCaptureEvent(event);
    if (normalized.eventId) {
      if (!byId.has(normalized.eventId)) byId.set(normalized.eventId, normalized);
    } else {
      anonymous.push(normalized);
    }
  }
  return [...byId.values(), ...anonymous]
    .sort((left, right) => (Number(left.at) || 0) - (Number(right.at) || 0))
    .slice(-MAX_RECOVERY_EVENTS);
}

export function nextRecoveryJournal(current, { sessionId, events = [], phase } = {}) {
  const sameSession = current?.sessionId === sessionId;
  return {
    sessionId,
    events: mergeRecoveryEvents(sameSession ? current.events : [], events),
    ...(phase ? { phase } : sameSession && current?.phase ? { phase: current.phase } : {})
  };
}
