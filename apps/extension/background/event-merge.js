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
  return nextEvents.length === session.events.length ? session : { ...session, events: nextEvents };
}
