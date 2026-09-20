export const ONBOARDING_CSS = `:root{color-scheme:light;font-family:system-ui,-apple-system,sans-serif;color:#17202a;background:#f7f8fa}body{margin:0;min-height:100vh;display:grid;place-items:center}main{width:min(620px,calc(100% - 32px));padding:28px;background:#fff;border:1px solid #d0d5dd;border-radius:16px;box-shadow:0 16px 38px #1018281a}h1{margin:0 0 12px;font-size:1.65rem}p{line-height:1.7}.notice{padding:14px 16px;border-radius:10px;background:#fffaeb;border:1px solid #fedf89}.success{background:#ecfdf3;border-color:#abefc6}.error{background:#fef3f2;border-color:#fecdca}button{min-height:44px;padding:10px 18px;border:0;border-radius:8px;background:#175cd3;color:#fff;font-weight:700;cursor:pointer}button:disabled{opacity:.55;cursor:not-allowed}:focus-visible{outline:3px solid #fff;outline-offset:2px;box-shadow:0 0 0 5px #1d4ed8}.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}`;

export const ONBOARDING_JS = `(() => {
  const root = document.querySelector("#onboarding");
  const status = document.querySelector("#status");
  const button = document.querySelector("#bootstrap");
  const operationKey = "meccha-manual:onboarding-operation";
  const configured = root?.dataset.bootstrapEnabled === "true";
  const fragmentHandoff = new URLSearchParams(location.hash.slice(1)).get("handoff");
  history.replaceState(null, "", location.pathname + location.search);
  function message(text, kind = "") { status.textContent = text; status.className = ("notice " + kind).trim(); }
  function randomId() { const bytes = new Uint8Array(32); crypto.getRandomValues(bytes); let binary = ""; for (const byte of bytes) binary += String.fromCharCode(byte); return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", ""); }
  function validHandoff(value) { return /^[A-Za-z0-9_-]{43}$/.test(value || ""); }
  const HANDOFF_TTL_MS = 15 * 60 * 1000;
  function isFresh(value) { const createdAt = Date.parse(value?.createdAt || ""); return Number.isFinite(createdAt) && Date.now() - createdAt >= 0 && Date.now() - createdAt <= HANDOFF_TTL_MS; }
  function getHandoff() { if (validHandoff(fragmentHandoff)) return fragmentHandoff; try { const saved = JSON.parse(sessionStorage.getItem(operationKey) || "null"); return validHandoff(saved?.handoffId) && isFresh(saved) ? saved.handoffId : null; } catch { return null; } }
  function operationId() { const handoff = getHandoff(); if (!handoff) return null; try { const saved = JSON.parse(sessionStorage.getItem(operationKey) || "null"); if (saved?.handoffId === handoff && /^[A-Za-z0-9_-]{43}$/.test(saved.operationId) && isFresh(saved)) return saved.operationId; const value = { handoffId: handoff, operationId: randomId(), createdAt: new Date().toISOString() }; sessionStorage.setItem(operationKey, JSON.stringify(value)); return value.operationId; } catch { return null; } }
  function setButton(label, disabled = false) { button.textContent = label; button.disabled = disabled; }
  async function bootstrap() {
    const id = operationId();
    if (!id) { message("登録を続けるための識別情報が確認できません。拡張機能の編集画面からもう一度進んでください。", "error"); setButton("登録を続ける", true); return; }
    setButton("準備中…", true); message("認証済みのWebアプリから保存先を準備しています。手順書本文はまだ送信していません。");
    try {
      const response = await fetch("/api/onboarding/bootstrap", { method: "POST", credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ operationId: id }) });
      let payload = null; try { payload = await response.json(); } catch {}
      if (response.ok && payload?.status === "ready") { message("保存先の準備が完了しました。手順書本文はまだ保存されていません。元の下書きは拡張機能に残っています。", "success"); setButton("同じ操作を確認する"); return; }
      if (response.status === 401) message("認証が確認できません。メールで認証してから、もう一度お試しください。", "error");
      else if (response.status === 403) message("このアカウントでは保存先を準備できません。", "error");
      else if (response.status === 429) message("試行回数の上限に達しました。少し時間をおいて、同じ操作でお試しください。", "error");
      else message("保存先の準備に失敗しました。元の下書きは拡張機能に残っています。同じ操作で再試行できます。", "error");
    } catch { message("応答を確認できませんでした。元の下書きは拡張機能に残っています。同じ操作で再試行してください。", "error"); }
    setButton("同じ操作で再試行");
  }
  if (!configured) { message("登録画面は現在準備中です。元の手順書は拡張機能のこの端末に残っています。"); setButton("登録画面は準備中", true); }
  else if (!getHandoff()) { message("登録を続けるための識別情報が確認できません。拡張機能の編集画面から進んでください。", "error"); setButton("登録を続ける", true); }
  else { message("メールで認証済みの場合は、保存先の準備を開始できます。手順書本文は送信されません。"); button.addEventListener("click", bootstrap); }
})();`;

export function renderOnboardingContinuePage({ bootstrapEnabled = false, assetVersion = "" } = {}) {
  const version = assetVersion ? `?v=${encodeURIComponent(assetVersion)}` : "";
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>登録を続ける | めっちゃマニュアル</title><link rel="stylesheet" href="/assets/onboarding.css${version}"></head><body><main id="onboarding" data-bootstrap-enabled="${bootstrapEnabled ? "true" : "false"}"><p aria-hidden="true">MECCHA MANUAL</p><h1>登録を続ける</h1><p>メールで認証したあと、手順書の保存先を準備します。</p><p class="notice" id="status" role="status" aria-live="polite"></p><button id="bootstrap" type="button">保存先を準備する</button><p class="sr-only" aria-live="polite"></p></main><script src="/assets/onboarding.js${version}" defer></script></body></html>`;
}
