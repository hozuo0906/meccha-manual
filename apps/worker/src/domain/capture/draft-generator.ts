export type CaptureEventType = "click" | "input_complete" | "navigation" | "scroll";

export type CaptureEvent = {
  sequence: number;
  type: CaptureEventType;
  occurredAt: string;
  targetText?: string;
  direction?: "up" | "down";
};

export type CaptureDraftStep = {
  type: "action" | "note";
  title: string;
  instruction: string;
  actionType: "click" | "input" | "navigate" | null;
  targetText: string | null;
  url: string | null;
};

const EVENT_TYPES = new Set<CaptureEventType>(["click", "input_complete", "navigation", "scroll"]);
const MAX_EVENTS = 200;
const ISO_UTC_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?Z$/u;

function normalizeOccurredAt(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = ISO_UTC_PATTERN.exec(value);
  if (!match) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const milliseconds = Number((match[7] ?? "").padEnd(3, "0"));
  if (
    date.getUTCFullYear() !== Number(match[1]) ||
    date.getUTCMonth() + 1 !== Number(match[2]) ||
    date.getUTCDate() !== Number(match[3]) ||
    date.getUTCHours() !== Number(match[4]) ||
    date.getUTCMinutes() !== Number(match[5]) ||
    date.getUTCSeconds() !== Number(match[6]) ||
    date.getUTCMilliseconds() !== milliseconds
  ) return null;
  return date.toISOString();
}

function normalizeCandidate(candidate: unknown): CaptureEvent | null {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return null;
  const row = candidate as Record<string, unknown>;
  if (typeof row.sequence !== "number" || !Number.isSafeInteger(row.sequence) || row.sequence < 1) return null;
  if (typeof row.type !== "string" || !EVENT_TYPES.has(row.type as CaptureEventType)) return null;
  const occurredAt = normalizeOccurredAt(row.occurredAt);
  if (!occurredAt) return null;
  if (row.type === "scroll" && row.direction !== "up" && row.direction !== "down") return null;

  const event: CaptureEvent = {
    sequence: row.sequence,
    type: row.type as CaptureEventType,
    occurredAt
  };
  // The capture side cannot prove whether an accessible label was derived
  // from a displayed or entered sensitive value. Never copy it across the
  // persistence boundary without a future provenance-safe extractor.
  if (event.type === "input_complete") event.targetText = "入力欄";
  if (event.type === "click") event.targetText = "対象";
  if (event.type === "scroll" && (row.direction === "up" || row.direction === "down")) event.direction = row.direction;
  return event;
}

export function normalizeCaptureEvents(input: unknown): CaptureEvent[] {
  if (!Array.isArray(input) || input.length > MAX_EVENTS) return [];
  const candidates = input.map(normalizeCandidate).filter((event): event is CaptureEvent => event !== null);
  const sequenceCounts = new Map<number, number>();
  for (const event of candidates) {
    sequenceCounts.set(event.sequence, (sequenceCounts.get(event.sequence) ?? 0) + 1);
  }
  return candidates
    .filter((event) => sequenceCounts.get(event.sequence) === 1)
    .sort((left, right) => left.sequence - right.sequence);
}

export function generateCaptureDraftSteps(events: readonly CaptureEvent[]): CaptureDraftStep[] {
  const steps: CaptureDraftStep[] = [];
  let previousScrollDirection: "up" | "down" | undefined;
  for (const event of [...events].sort((left, right) => left.sequence - right.sequence)) {
    if (event.type === "click") {
      const target = event.targetText ?? "対象";
      steps.push({ type: "action", title: `${target}をクリック`, instruction: `${target}をクリックします。`, actionType: "click", targetText: target, url: null });
      previousScrollDirection = undefined;
    } else if (event.type === "input_complete") {
      const target = event.targetText ?? "入力欄";
      steps.push({ type: "action", title: `${target}へ入力`, instruction: `${target}への入力を完了します。入力値は手順書に保存されません。`, actionType: "input", targetText: target, url: null });
      previousScrollDirection = undefined;
    } else if (event.type === "navigation") {
      steps.push({ type: "action", title: "ページを移動", instruction: "次のページへ移動します。", actionType: "navigate", targetText: null, url: null });
      previousScrollDirection = undefined;
    } else if (event.type === "scroll" && event.direction !== previousScrollDirection) {
      const label = event.direction === "up" ? "上" : "下";
      steps.push({ type: "note", title: `画面を${label}へスクロール`, instruction: `画面を${label}へスクロールします。`, actionType: null, targetText: null, url: null });
      previousScrollDirection = event.direction;
    }
  }
  return steps;
}
