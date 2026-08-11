import { pathToFileURL } from "node:url";

import { parse } from "parse5";

import { APP_CSS, APP_HTML, APP_JS } from "../apps/worker/src/app-assets.ts";

function attributes(node) {
  return Object.fromEntries((node.attrs ?? []).map(({ name, value }) => [name, value]));
}

function visit(node, callback) {
  callback(node);
  for (const child of node.childNodes ?? []) visit(child, callback);
}

function selectorCanAffectTarget(candidate, target) {
  if (target === ".field input") return /\.field\b[^,{]*\binput\b/.test(candidate);
  if (target === ".field select") return /\.field\b[^,{]*\bselect\b/.test(candidate);
  return candidate.includes(target);
}

function declaredMinHeights(css, selector) {
  const values = [];
  for (const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectors = match[1].split(",").map((item) => item.trim());
    if (!selectors.some((candidate) => selectorCanAffectTarget(candidate, selector))) continue;
    for (const declaration of match[2].matchAll(/(?:^|;)\s*min-height\s*:\s*([0-9.]+)px(?:\s*!important)?\s*(?=;|$)/g)) {
      values.push(Number(declaration[1]));
    }
  }
  return values;
}

export function validatePhase1Accessibility({ html = APP_HTML, css = APP_CSS, js = APP_JS } = {}) {
  const errors = [];
  const document = parse(html);
  const nodes = [];
  visit(document, (node) => nodes.push(node));

  const htmlNode = nodes.find((node) => node.nodeName === "html");
  if (attributes(htmlNode).lang !== "ja") errors.push("HTMLの言語をjaで指定してください。");

  const viewport = nodes.find((node) => node.nodeName === "meta" && attributes(node).name === "viewport");
  if (!viewport || !attributes(viewport).content?.includes("width=device-width")) {
    errors.push("200%ズーム時の再配置に必要なviewportを指定してください。");
  }

  const screenContent = nodes.find((node) => attributes(node).id === "screen-content");
  if (!screenContent || attributes(screenContent).tabindex !== "-1") {
    errors.push("反復ナビを飛ばすscreen-contentをプログラムフォーカス可能にしてください。");
  }

  const skipLink = nodes.find((node) => {
    const attrs = attributes(node);
    return node.nodeName === "a" && attrs.class?.split(/\s+/).includes("skip-link");
  });
  if (!skipLink || attributes(skipLink).href !== "#screen-content") {
    errors.push("本文へ移動するスキップリンクを提供してください。");
  }

  const cssContracts = [
    [/:focus-visible\s*\{[^}]*outline:\s*3px solid #ffffff;[^}]*box-shadow:\s*0 0 0 5px #1d4ed8;/, "明暗どちらの背景でも識別できる二重のフォーカス表示を指定してください。"],
    [/#workspace-join-code\s*\{[^}]*overflow-wrap:\s*anywhere;[^}]*user-select:\s*all;[^}]*white-space:\s*normal;/, "参加コードを狭い画面でも折り返して選択できるようにしてください。"],
    [/@media \(max-width:\s*900px\)[\s\S]*?\.login-screen,[\s\S]*?\.dashboard-grid\s*\{\s*grid-template-columns:\s*1fr;/, "狭い画面と200%ズーム向けの主要レイアウト再配置を指定してください。"],
    [/@media \(max-width:\s*520px\)[\s\S]*?\.nav\s*\{\s*grid-template-columns:\s*1fr;/, "小さい表示領域でナビを1列へ再配置してください。"],
    [/@media \(forced-colors:\s*active\)[\s\S]*?\.nav-item\.active[\s\S]*?border:\s*1px solid CanvasText;/, "強制カラーモードでも境界を識別可能にしてください。"]
  ];
  for (const [pattern, message] of cssContracts) {
    if (!pattern.test(css)) errors.push(message);
  }
  for (const selector of [
    ".primary-button",
    ".secondary-button",
    ".danger-button",
    ".nav-item",
    ".field input",
    ".field select",
    ".inline-select"
  ]) {
    const minHeights = declaredMinHeights(css, selector);
    if (minHeights.length === 0 || minHeights.some((value) => value < 44)) {
      errors.push(`${selector}の操作領域を44px以上にしてください。`);
    }
  }

  const jsContracts = [
    ['id="screen-content" class="login-screen"', "ログイン画面に本文スキップ先を維持してください。"],
    ['id="screen-content" class="boot" role="alert" aria-live="assertive" tabindex="-1"', "障害画面に本文スキップ先を維持してください。"],
    ['id="screen-content" class="boot" tabindex="-1" role="status" aria-live="polite"', "認証更新画面に本文スキップ先を維持してください。"],
    ['id="screen-content" class="main"', "共通シェルに反復ナビ後の本文スキップ先を置いてください。"],
    ['<nav class="nav" aria-label="主要メニュー">', "主要ナビゲーションに名前を付けてください。"],
    ['href="#members-heading">メンバー管理</a>', "メンバー管理へキーボード移動できる導線を提供してください。"],
    ['<span class="nav-item" aria-disabled="true">', "未提供機能は操作不能な準備中表示にしてください。"],
    ['role="region" tabindex="0" aria-label="所属ワークスペース一覧"', "横スクロールするワークスペース表へ名前を付けてください。"],
    ['role="region" tabindex="0" aria-label="ワークスペースメンバー一覧"', "横スクロールするメンバー表へ名前を付けてください。"],
    ['aria-live="polite" aria-atomic="true"', "状態通知を支援技術へまとまりとして通知してください。"],
    ['id="members-loading-status"', "メンバー読込開始時のフォーカス先を維持してください。"],
    ['さんの</span>権限を保存</button>', "権限保存の読み上げ名に対象者を含めてください。"],
    ['さんの</span>利用を停止</button>', "利用停止の読み上げ名に対象者を含めてください。"],
    ['data-max-code-points="64" required placeholder="例：営業部"', "ワークスペース名の入力上限を画面でも強制してください。"],
    ['limitWorkspaceNameCodePoints(workspaceNameField);', "ワークスペース名をUnicode code point単位で制限してください。"],
    ['data-max-normalized-length="63" inputmode="url"', "URL用IDの入力上限を正規化後の長さで強制してください。"],
    ['limitWorkspaceSlugLength(workspaceSlugField);', "URL用IDをtrim後の長さで制限してください。"],
    ['maxlength="47" required value="', "参加コードの入力上限を画面でも強制してください。"],
    ['現在の権限：', "現在ユーザーの権限を画面で確認できるようにしてください。"]
  ];
  for (const [fragment, message] of jsContracts) {
    if (!js.includes(fragment)) errors.push(message);
  }

  return errors;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const errors = validatePhase1Accessibility();
  if (errors.length) {
    console.error(errors.map((error) => `- ${error}`).join("\n"));
    process.exitCode = 1;
  } else {
    console.log("Phase 1 accessibility contract: ok");
  }
}
