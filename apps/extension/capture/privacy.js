const SENSITIVE_AUTOCOMPLETE = /(?:password|cc-|one-time-code)/i;
const SENSITIVE_NAME = /(?:pass(?:word)?|token|secret|auth(?:orization)?|cookie|card|credit|cvv|cvc|pin|個人番号|マイナンバー|カード|クレジット|暗証|認証コード|ワンタイム)/i;
const CONTROL_NAME_MAX_LENGTH = 40;
const CONTROL_NAME_EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const CONTROL_NAME_URL = /(?:https?:\/\/|www\.)|\b[A-Z0-9.-]+\.(?:com|net|org|jp|co\.jp)\b/i;
const CONTROL_NAME_PHONE = /(?:\+?81[- ]?|0)\d{1,4}[- ]?\d{1,4}[- ]?\d{3,4}/;
const CONTROL_NAME_POSTAL = /(?:〒?\d{3}[- ]?\d{4})/;
const CONTROL_NAME_SENSITIVE = /(?:password|passcode|token|secret|authorization|cookie|カード|クレジット|cvv|cvc|暗証|認証コード|ワンタイム|個人番号|マイナンバー)/i;
const SECRET_LIKE_LABEL = /(?:eyJ[A-Za-z0-9_-]{10,}\.|\b(?:\d[ -]?){13,19}\b|\b[A-Fa-f0-9]{24,}\b|\b[A-Za-z0-9_-]{32,}\b)/;

export function isSensitiveInput(input) {
  const type = String(input?.type ?? "").toLowerCase();
  const metadata = [input?.name, input?.id, input?.autocomplete, input?.ariaLabel, input?.associatedLabel, input?.placeholder]
    .filter(Boolean)
    .join(" ");
  return type === "password" || SENSITIVE_AUTOCOMPLETE.test(String(input?.autocomplete ?? "")) || SENSITIVE_NAME.test(metadata) || SECRET_LIKE_LABEL.test(metadata);
}

function inputSemanticLabel(input) {
  const tagName = String(input?.tagName ?? "").toLowerCase();
  const role = String(input?.role ?? "").toLowerCase();
  const type = String(input?.type ?? "").toLowerCase();
  if (isSensitiveInput(input)) return "保護された入力欄";
  if (tagName === "select" || role === "combobox") return "選択欄";
  if (tagName === "input" && ["button", "submit", "reset", "image"].includes(type)) return "ボタン";
  if (tagName === "input" && ["checkbox", "radio"].includes(type)) return "選択欄";
  if (tagName === "input" && type === "file") return "ファイル選択";
  return "入力欄";
}

function isValueBearingTarget(target) {
  const tagName = String(target?.tagName ?? "").toLowerCase();
  const role = String(target?.role ?? "").toLowerCase();
  const type = String(target?.type ?? "").toLowerCase();
  if (tagName === "textarea" || tagName === "select") return true;
  if (["textbox", "combobox", "spinbutton"].includes(role)) return true;
  return tagName === "input" && !["button", "submit", "reset", "image", "checkbox", "radio", "file", "hidden"].includes(type);
}

function eventIdentity(event) {
  return typeof event?.eventId === "string" && event.eventId.length <= 160 ? { eventId: event.eventId } : {};
}

export function safeLabel(input) {
  return inputSemanticLabel(input);
}

function isNamedControl(target) {
  const tagName = String(target?.tagName ?? "").toLowerCase();
  const role = String(target?.role ?? "").toLowerCase();
  const type = String(target?.type ?? "").toLowerCase();
  return tagName === "button" || tagName === "a" || role === "button" || role === "link" || role === "menuitem"
    || (tagName === "input" && ["button", "submit", "reset", "image"].includes(type));
}

function normalizeControlName(value) {
  const normalized = String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/gu, " ").trim();
  if (!normalized || Array.from(normalized).length > CONTROL_NAME_MAX_LENGTH) return null;
  if (CONTROL_NAME_EMAIL.test(normalized) || CONTROL_NAME_URL.test(normalized) || CONTROL_NAME_PHONE.test(normalized) || CONTROL_NAME_POSTAL.test(normalized)) return null;
  if (CONTROL_NAME_SENSITIVE.test(normalized) || SECRET_LIKE_LABEL.test(normalized)) return null;
  return normalized;
}

/** Returns a short, non-value-bearing control name for a local click step. */
export function safeControlName(target) {
  if (!isNamedControl(target) || isSensitiveInput(target) || isValueBearingTarget(target)) return null;
  const candidates = [target?.ariaLabel, target?.associatedLabel, target?.title, target?.visibleText, target?.controlCaption, target?.imageAlt];
  for (const candidate of candidates) {
    const normalized = normalizeControlName(candidate);
    if (normalized) return normalized;
  }
  return null;
}

export function safeTargetLabel(target) {
  if (isSensitiveInput(target) && !isNamedControl(target)) return "保護された入力欄";
  if (isValueBearingTarget(target)) return inputSemanticLabel(target);
  const controlName = safeControlName(target);
  if (controlName) return controlName;
  const role = String(target?.role ?? "").toLowerCase();
  const tagName = String(target?.tagName ?? "").toLowerCase();
  const type = String(target?.type ?? "").toLowerCase();
  if (role === "button" || tagName === "button" || ["button", "submit", "reset", "image"].includes(type)) return "ボタン";
  if (role === "link" || tagName === "a") return "リンク";
  if (role === "menuitem") return "メニュー";
  if (tagName === "select" || role === "combobox") return "選択欄";
  return "操作対象";
}

export function normalizeCaptureEvent(event) {
  const at = Number.isFinite(event.at) ? event.at : Date.now();
  const identity = eventIdentity(event);
  if (event.kind === "input") {
    return { kind: "input", at, label: safeLabel(event.target), ...identity };
  }
  if (event.kind === "click") {
    return { kind: "click", at, label: safeTargetLabel(event.target), ...identity };
  }
  if (event.kind === "scroll") {
    return { kind: "scroll", at, direction: ["up", "down", "left", "right"].includes(event.direction) ? event.direction : "down", ...identity };
  }
  if (event.kind === "navigation") return { kind: "navigation", at, ...identity };
  throw new TypeError("未対応の操作です");
}
