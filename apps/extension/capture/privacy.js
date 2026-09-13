const SENSITIVE_AUTOCOMPLETE = /(?:password|cc-|one-time-code)/i;
const SENSITIVE_NAME = /(?:pass(?:word)?|token|secret|auth(?:orization)?|cookie|card|credit|cvv|cvc|pin|個人番号|マイナンバー|カード|クレジット|暗証|認証コード|ワンタイム)/i;
const SECRET_LIKE_LABEL = /(?:eyJ[A-Za-z0-9_-]{10,}\.|\b(?:\d[ -]?){13,19}\b|\b[A-Fa-f0-9]{24,}\b|\b[A-Za-z0-9_-]{32,}\b)/;

export function isSensitiveInput(input) {
  const type = String(input?.type ?? "").toLowerCase();
  const metadata = [input?.name, input?.id, input?.autocomplete, input?.ariaLabel, input?.associatedLabel, input?.placeholder]
    .filter(Boolean)
    .join(" ");
  return type === "password" || SENSITIVE_AUTOCOMPLETE.test(String(input?.autocomplete ?? "")) || SENSITIVE_NAME.test(metadata) || SECRET_LIKE_LABEL.test(metadata);
}

export function safeLabel(input) {
  if (isSensitiveInput(input)) return "保護された入力欄";
  const candidate = [input?.ariaLabel, input?.associatedLabel, input?.placeholder, input?.name]
    .find((value) => typeof value === "string" && value.trim());
  return candidate ? candidate.trim().replace(/\s+/g, " ").slice(0, 80) : "入力欄";
}

export function safeTargetLabel(target) {
  if (isSensitiveInput(target)) return "保護された入力欄";
  const candidate = [target?.ariaLabel, target?.associatedLabel, target?.placeholder]
    .find((value) => typeof value === "string" && value.trim());
  if (candidate) return candidate.trim().replace(/\s+/g, " ").slice(0, 80);
  const semantic = String(target?.role || target?.tagName || target?.type || "操作対象").toLowerCase();
  return ({ button: "ボタン", a: "リンク", select: "選択欄", textarea: "入力欄", input: "入力欄" })[semantic] || "操作対象";
}

export function normalizeCaptureEvent(event) {
  const at = Number.isFinite(event.at) ? event.at : Date.now();
  if (event.kind === "input") {
    return { kind: "input", at, label: safeLabel(event.target) };
  }
  if (event.kind === "click") {
    return { kind: "click", at, label: safeTargetLabel(event.target) };
  }
  if (event.kind === "scroll") {
    return { kind: "scroll", at, direction: event.direction === "up" ? "up" : "down" };
  }
  if (event.kind === "navigation") return { kind: "navigation", at };
  throw new TypeError("未対応の操作です");
}
