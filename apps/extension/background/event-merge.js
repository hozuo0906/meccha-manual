import { normalizeCaptureEvent } from "../capture/privacy.js";

export function mergeCaptureEvents(session, events) {
  const nextEvents = [...session.events];
  const eventIds = new Set(nextEvents.map((event) => event.eventId).filter(Boolean));
  for (const event of events || []) {
    if (!event) continue;
    const normalized = normalizeCaptureEvent(event);
    if (normalized.eventId && eventIds.has(normalized.eventId)) continue;
    nextEvents.push(normalized);
    if (normalized.eventId) eventIds.add(normalized.eventId);
  }
  if (nextEvents.length === session.events.length) return session;
  nextEvents.sort((left, right) => (Number(left.at) || 0) - (Number(right.at) || 0));
  return { ...session, events: nextEvents };
}
