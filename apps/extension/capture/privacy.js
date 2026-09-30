const SENSITIVE_AUTOCOMPLETE = /(?:password|cc-|one-time-code)/i;
const SENSITIVE_NAME = /(?:pass(?:word)?|token|secret|auth(?:orization)?|cookie|card|credit|cvv|cvc|pin|個人番号|マイナンバー|カード|クレジット|暗証|認証コード|ワンタイム)/i;
const CONTROL_NAME_MAX_LENGTH = 40;
// The domain may be a single intranet label (for example, `alice@localhost`).
// Keep the match deliberately email-shaped so an `@` in an ordinary caption is
// not enough to make it sensitive.
const CONTROL_NAME_EMAIL = /[^\s@<>()\[\]\\,;:"]+@[\p{L}\p{N}](?:[\p{L}\p{N}-]{0,61}[\p{L}\p{N}])?/u;
const CONTROL_NAME_EMAIL_LAYOUT = /[A-Za-z0-9][A-Za-z0-9._%+-]*\s*@\s*[A-Za-z0-9]/u;
const CONTROL_NAME_SCHEME = /^[A-Za-z][A-Za-z0-9+.-]*:/u;
const CONTROL_NAME_HOST_LABEL = /^(?=.{1,63}$)[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/u;
const CONTROL_NAME_INTERNATIONAL_HOST_LABEL = /^(?=.{1,63}$)[\p{L}\p{N}](?:[\p{L}\p{N}-]*[\p{L}\p{N}])?$/u;
const CONTROL_NAME_IPV4 = /^\d{1,3}(?:\.\d{1,3}){3}(?::\d{1,5})?(?:[/?#]|$)/u;
const CONTROL_NAME_IPV6 = /^\[[0-9A-Fa-f:.]+\](?::\d{1,5})?(?:[/?#]|$)/u;
const CONTROL_NAME_PHONE = /(?:\+|00)[\s().-]*\d(?:[\s().-]*\d){7,14}|(?:\+?81[\s().-]*|0)\d(?:[\s().-]*\d){8,10}/u;
const CONTROL_NAME_POSTAL = /(?:〒?\d{3}[- ]?\d{4})/;
const CONTROL_NAME_SENSITIVE = /(?:password|passcode|token|secret|authorization|cookie|カード|クレジット|cvv|cvc|暗証|認証コード|ワンタイム|個人番号|マイナンバー)/i;
const SECRET_LIKE_LABEL = /(?:eyJ[A-Za-z0-9_-]{10,}\.|\b(?:\d[ -]?){13,19}\b|\b[A-Fa-f0-9]{24,}\b|\b[A-Za-z0-9_-]{32,}\b)/;
// JavaScript's digit shorthand is ASCII-only even with the Unicode flag.
// Keep this map in the privacy view so every Unicode Nd digit participates in
// phone, postal, and card detection without changing the returned caption.
const DECIMAL_DIGIT_ZEROES = [
  0x30, 0x660, 0x6f0, 0x7c0, 0x966, 0x9e6, 0xa66, 0xae6, 0xb66, 0xbe6,
  0xc66, 0xce6, 0xd66, 0xde6, 0xe50, 0xed0, 0xf20, 0x1040, 0x1090, 0x17e0, 0x1810,
  0x1946, 0x19d0, 0x1a80, 0x1a90, 0x1b50, 0x1bb0, 0x1c40, 0x1c50, 0xa620,
  0xa8d0, 0xa900, 0xa9d0, 0xa9f0, 0xaa50, 0xabf0, 0xff10, 0x104a0,
  0x11066, 0x110f0, 0x11136, 0x111d0, 0x112f0, 0x114d0, 0x11650, 0x116c0,
  0x11730, 0x118e0, 0x16a60, 0x16b50, 0x1d7ce, 0x1d7d8, 0x1d7e2, 0x1d7ec,
  0x1d7f6
];

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

function looksLikeUrl(value) {
  // Remove whitespace only for URL detection so a line break cannot hide a URL.
  const compact = value.replace(/\s+/gu, "");
  if (!compact) return false;
  // A caption may decorate a URL with Japanese text or punctuation.
  if (/[A-Za-z][A-Za-z0-9+.-]*:\/\/|\/\/|www\./iu.test(compact)) return true;
  // Schemes and authorities may be embedded after a caption or punctuation.
  if (/(?:^|[^\p{L}\p{N}])[A-Za-z][A-Za-z0-9+.-]*:/u.test(compact)) return true;
  if (/(?:[\p{L}\p{N}](?:[\p{L}\p{N}-]*[\p{L}\p{N}])?\.)+[\p{L}\p{N}](?:[\p{L}\p{N}-]*[\p{L}\p{N}])?/u.test(compact)) return true;
  if (CONTROL_NAME_SCHEME.test(compact) || compact.startsWith("//")) return true;
  if (/(?:^|[^\p{L}\p{N}])(?:\d{1,3}\.){3}\d{1,3}(?::\d{1,5})?(?:[/?#]|$)/u.test(compact)) return true;
  if (/(?:^|[^\p{L}\p{N}])\[[0-9A-Fa-f:.]+\](?::\d{1,5})?(?:[/?#]|$)/u.test(compact)) return true;
  if (CONTROL_NAME_IPV4.test(compact) || CONTROL_NAME_IPV6.test(compact)) return true;

  const authority = compact.match(/^([^/?#\\]+)(?:[/?#]|$)/u)?.[1];
  if (!authority) return false;
  const hostPort = authority.slice(authority.lastIndexOf("@") + 1);
  const host = hostPort.replace(/:\d+$/u, "");
  if (!host.includes(".")) return false;
  const labels = host.split(".");
  // Require every label to be a valid ASCII or internationalized hostname
  // label. This keeps ordinary punctuation such as `詳細.` out while still
  // rejecting an internationalized hostname such as `例え.テスト`.
  return labels.length >= 2 && labels.every((label) => CONTROL_NAME_HOST_LABEL.test(label) || CONTROL_NAME_INTERNATIONAL_HOST_LABEL.test(label));
}

function normalizeControlName(value) {
  const normalized = String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/gu, " ").trim();
  if (!normalized) return null;
  // Format characters such as zero-width space are invisible in a caption
  // but can split every detector below. Remove them from both the privacy view
  // and the returned caption so the storage boundary covers actual output.
  const caption = normalized.replace(/\p{Cf}/gu, "");
  const privacyValue = normalizePrivacyDigits(caption.normalize("NFKC"));
  const compactPrivacyValue = privacyValue.replace(/\s+/gu, "");
  const hasEmail = CONTROL_NAME_EMAIL.test(privacyValue)
    || (CONTROL_NAME_EMAIL_LAYOUT.test(privacyValue) && CONTROL_NAME_EMAIL.test(compactPrivacyValue));
  if (Array.from(caption).length > CONTROL_NAME_MAX_LENGTH) return null;
  if (hasEmail || looksLikeUrl(privacyValue) || CONTROL_NAME_PHONE.test(privacyValue) || CONTROL_NAME_POSTAL.test(privacyValue)) return null;
  if (SENSITIVE_NAME.test(privacyValue) || CONTROL_NAME_SENSITIVE.test(privacyValue) || SECRET_LIKE_LABEL.test(privacyValue)) return null;
  return caption;
}

function normalizePrivacyDigits(value) {
  return Array.from(value, (character) => {
    const codePoint = character.codePointAt(0);
    const zero = DECIMAL_DIGIT_ZEROES.find((candidate) => codePoint >= candidate && codePoint <= candidate + 9);
    return zero === undefined ? character : String(codePoint - zero);
  }).join("");
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
