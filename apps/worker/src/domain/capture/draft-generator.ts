export type CaptureEventType = "click" | "input_complete" | "navigation" | "scroll";

export type CaptureEvent = {
  sequence: number;
  type: CaptureEventType;
  occurredAt: string;
  targetText?: string;
  location?: string;
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
const SENSITIVE_TARGET_PATTERN = /password|passcode|secret|token|authorization|cookie|card|cvv|cvc|個人番号|暗証|パスワード|カード|トークン/iu;
const CONTROL_PATTERN = /[\u0000-\u001f\u007f]/u;
const MAX_EVENTS = 200;
const MAX_TARGET_LENGTH = 128;
const MAX_LOCATION_LENGTH = 2048;

function normalizedTarget(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const target = value.trim().replace(/\s+/gu, " ");
  if (!target || CONTROL_PATTERN.test(target)) return undefined;
  if (SENSITIVE_TARGET_PATTERN.test(target)) return "入力欄";
  return Array.from(target).slice(0, MAX_TARGET_LENGTH).join("");
}

function safeLocation(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length > MAX_LOCATION_LENGTH || CONTROL_PATTERN.test(value)) return undefined;
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return undefined;
    return `${url.origin}${url.pathname}`;
  } catch {
    return undefined;
  }
}

export function normalizeCaptureEvents(input: unknown): CaptureEvent[] {
  if (!Array.isArray(input) || input.length > MAX_EVENTS) return [];
  const events: CaptureEvent[] = [];
  const sequenceCounts = new Map<number, number>();
  for (const candidate of input) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) continue;
    const sequence = Number((candidate as Record<string, unknown>).sequence);
    if (!Number.isSafeInteger(sequence) || sequence < 1) continue;
    sequenceCounts.set(sequence, (sequenceCounts.get(sequence) ?? 0) + 1);
  }
  for (const candidate of input) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) continue;
    const row = candidate as Record<string, unknown>;
    if (!Number.isSafeInteger(row.sequence) || Number(row.sequence) < 1 || sequenceCounts.get(Number(row.sequence)) !== 1) continue;
    if (typeof row.type !== "string" || !EVENT_TYPES.has(row.type as CaptureEventType)) continue;
    if (typeof row.occurredAt !== "string" || Number.isNaN(Date.parse(row.occurredAt))) continue;

    const event: CaptureEvent = {
      sequence: Number(row.sequence),
      type: row.type as CaptureEventType,
      occurredAt: new Date(row.occurredAt).toISOString()
    };
    if (event.type === "input_complete") {
      // The capture side cannot prove whether an accessible label was derived
      // from the entered value. Never copy it across the persistence boundary.
      event.targetText = "入力欄";
    } else if (event.type === "click") {
      const targetText = normalizedTarget(row.targetText);
      if (targetText) event.targetText = targetText;
    }
    const location = safeLocation(row.url);
    if (location && event.type === "navigation") event.location = location;
    if (event.type === "scroll" && (row.direction === "up" || row.direction === "down")) event.direction = row.direction;
    events.push(event);
  }
  return events.sort((left, right) => left.sequence - right.sequence);
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
      steps.push({ type: "action", title: "ページを移動", instruction: event.location ? `${event.location}へ移動します。` : "次のページへ移動します。", actionType: "navigate", targetText: null, url: event.location ?? null });
      previousScrollDirection = undefined;
    } else if (event.type === "scroll" && event.direction !== previousScrollDirection) {
      const label = event.direction === "up" ? "上" : "下";
      steps.push({ type: "note", title: `画面を${label}へスクロール`, instruction: `画面を${label}へスクロールします。`, actionType: null, targetText: null, url: null });
      previousScrollDirection = event.direction;
    }
  }
  return steps;
}
