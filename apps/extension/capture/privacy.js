const SENSITIVE_AUTOCOMPLETE = /(?:password|cc-|one-time-code)/i;
const SENSITIVE_NAME = /(?:pass(?:word)?|token|secret|auth(?:orization)?|cookie|card|credit|cvv|cvc|pin|個人番号|マイナンバー|カード|クレジット|暗証|認証コード|ワンタイム)/i;
const CONTROL_NAME_MAX_LENGTH = 40;
// The domain may be a single intranet label (for example, `alice@localhost`).
// Keep the match deliberately email-shaped so an `@` in an ordinary caption is
// not enough to make it sensitive.
const CONTROL_NAME_EMAIL = /[^\s@<>()\[\]\\,;:"]+@[\p{L}\p{N}](?:[\p{L}\p{N}\p{M}-]{0,61}[\p{L}\p{N}\p{M}])?/u;
const CONTROL_NAME_EMAIL_MAILBOX_CHAR = /[\p{L}\p{N}\p{M}]/u;
const CONTROL_NAME_SCHEME = /^[A-Za-z][A-Za-z0-9+.-]*:/u;
const CONTROL_NAME_HOST_LABEL = /^(?=.{1,63}$)[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/u;
const CONTROL_NAME_INTERNATIONAL_HOST_LABEL = /^(?=.{1,63}$)[\p{L}\p{N}](?:[\p{L}\p{N}\p{M}-]*[\p{L}\p{N}\p{M}])?$/u;
const CONTROL_NAME_IPV4 = /^\d{1,3}(?:\.\d{1,3}){3}(?::\d{1,5})?(?:[/?#]|$)/u;
const CONTROL_NAME_IPV6 = /^\[[0-9A-Fa-f:.]+\](?::\d{1,5})?(?:[/?#]|$)/u;
const CONTROL_NAME_PHONE = /(?:\+|00)[\s().-]*\d(?:[\s().-]*\d){7,14}|(?:\+?81[\s().-]*|0)\d(?:[\s().-]*\d){8,10}/u;
const CONTROL_NAME_POSTAL = /(?:〒?\d{3}[- ]?\d{4})/;
const CONTROL_NAME_SENSITIVE = /(?:password|passcode|token|secret|authorization|cookie|カード|クレジット|cvv|cvc|暗証|認証コード|ワンタイム|個人番号|マイナンバー)/i;
const SECRET_LIKE_LABEL = /(?:eyJ[A-Za-z0-9_-]{10,}\.|\b(?:\d[ -]?){13,19}\b|\b[A-Fa-f0-9]{24,}\b|\b[A-Za-z0-9_-]{32,}\b)/;
// JavaScript's digit shorthand is ASCII-only even with the Unicode flag.
// Unicode Nd sets are encoded as consecutive groups of ten code points. A
// bounded lookback finds the current group's start without a frozen list that
// can miss a later Unicode block (for example Adlam digits).
const DECIMAL_DIGIT = /\p{Nd}/u;
const DECIMAL_DIGIT_RUN_LOOKBACK = 64;

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
  if (/(?:[\p{L}\p{N}\p{M}](?:[\p{L}\p{N}\p{M}-]*[\p{L}\p{N}\p{M}])?\.)+[\p{L}\p{N}\p{M}](?:[\p{L}\p{N}\p{M}-]*[\p{L}\p{N}\p{M}])?/u.test(compact)) return true;
  if (CONTROL_NAME_SCHEME.test(compact) || compact.startsWith("//")) return true;
  if (/(?:^|[^\p{L}\p{N}\p{M}])(?:\d{1,3}\.){3}\d{1,3}(?::\d{1,5})?(?:[/?#]|$)/u.test(compact)) return true;
  if (/(?:^|[^\p{L}\p{N}\p{M}])\[[0-9A-Fa-f:.]+\](?::\d{1,5})?(?:[/?#]|$)/u.test(compact)) return true;
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
  const raw = String(value ?? "");
  const normalized = raw.replace(/\p{Cc}/gu, " ").replace(/\s+/gu, " ").trim();
  if (!normalized) return null;
  // Format characters such as zero-width space are invisible in a caption
  // but can split every detector below. Remove them from both the privacy view
  // and the returned caption so the storage boundary covers actual output.
  const caption = normalized.replace(/\p{Cf}/gu, "");
  // Keep source-control spacing in the returned caption, but derive separate
  // privacy views for the different detectors. Cc controls are whitespace for
  // email layout (so `保存\n@\n次へ` remains an ordinary caption), while the
  // value view removes them so a C1 control cannot split `to\u0080ken` or a phone
  // number. Format characters are removed from both views so invisible marks
  // cannot hide a value. Combining marks stay in the email view to preserve
  // Unicode mailbox detection; the value view removes them for phone/secret
  // detection (including U+034F COMBINING GRAPHEME JOINER).
  // ECMAScript `\s` Cc controls (TAB/LF/VT/FF/CR) are layout whitespace;
  // non-`\s` Cc controls such as C1 are removed from this email source.
  const emailSource = raw.replace(/\p{Cc}/gu, (character) => /\s/u.test(character) ? " " : "").replace(/\p{Cf}/gu, "");
  const emailValue = emailSource.normalize("NFKC");
  // Keep Cc whitespace semantics for email layout, but remove combining marks
  // from the address candidate so a mark cannot hide the first domain letter.
  const emailLayoutValue = emailValue.replace(/\p{M}/gu, "");
  const emailCandidate = emailLayoutValue.replace(/@\s+/gu, "@");
  const privacySource = raw.replace(/[\p{Cc}\p{Cf}\p{M}]/gu, "");
  const privacyValue = normalizePrivacyDigits(privacySource.normalize("NFKC"));
  if (privacyValue === null) return null;
  if (Array.from(caption).length > CONTROL_NAME_MAX_LENGTH) return null;
  const hasEmail = CONTROL_NAME_EMAIL.test(emailCandidate) || hasEmailLayout(emailLayoutValue);
  if (hasEmail || looksLikeUrl(privacyValue) || CONTROL_NAME_PHONE.test(privacyValue) || CONTROL_NAME_POSTAL.test(privacyValue)) return null;
  if (SENSITIVE_NAME.test(privacyValue) || CONTROL_NAME_SENSITIVE.test(privacyValue) || SECRET_LIKE_LABEL.test(privacyValue)) return null;
  return caption;
}

function hasEmailLayout(value) {
  for (let atIndex = value.indexOf("@"); atIndex >= 0; atIndex = value.indexOf("@", atIndex + 1)) {
    const before = value.slice(0, atIndex);
    const after = value.slice(atIndex + 1);
    const beforeLayout = /\s$/u.test(before);
    const afterLayout = /^\s/u.test(after);
    // Both sides spaced around @ are ordinary prose (for example,
    // `保存 @ 次へ`). A single layout gap is sensitive only when the other
    // side starts or ends with a mailbox character. Continue to later @
    // candidates so ordinary prose cannot hide a separated address.
    if (beforeLayout === afterLayout) continue;
    const adjacent = beforeLayout ? Array.from(after)[0] : Array.from(before).at(-1);
    if (adjacent && CONTROL_NAME_EMAIL_MAILBOX_CHAR.test(adjacent)) return true;
  }
  return false;
}

function normalizePrivacyDigits(value) {
  let failed = false;
  const normalized = Array.from(value, (character) => {
    const codePoint = character.codePointAt(0);
    if (!DECIMAL_DIGIT.test(character)) return character;
    let runStart = codePoint;
    let lookback = 0;
    while (runStart > 0 && lookback < DECIMAL_DIGIT_RUN_LOOKBACK
      && DECIMAL_DIGIT.test(String.fromCodePoint(runStart - 1))) {
      runStart -= 1;
      lookback += 1;
    }
    // A run that cannot be bounded is outside the Unicode Nd shape this
    // detector understands; fail closed instead of preserving an unknown
    // decimal digit in the privacy view.
    if (lookback === DECIMAL_DIGIT_RUN_LOOKBACK && runStart > 0
      && DECIMAL_DIGIT.test(String.fromCodePoint(runStart - 1))) {
      failed = true;
      return character;
    }
    return String((codePoint - runStart) % 10);
  });
  return failed ? null : normalized.join("");
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
