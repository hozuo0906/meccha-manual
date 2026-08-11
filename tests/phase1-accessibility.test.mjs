import assert from "node:assert/strict";
import test from "node:test";

import { APP_CSS, APP_HTML, APP_JS } from "../apps/worker/src/app-assets.ts";
import { validatePhase1Accessibility } from "../scripts/check-phase1-accessibility.mjs";

test("Phase 1画面は日本語ランドマーク・キーボード・ズーム・状態通知契約を満たす", () => {
  assert.deepEqual(validatePhase1Accessibility(), []);
});

const contractMutations = [
  ["HTML言語", "言語", { html: APP_HTML.replace('lang="ja"', "") }],
  ["viewport", "viewport", { html: APP_HTML.replace("width=device-width", "width=1024") }],
  ["本文フォーカス先", "screen-content", { html: APP_HTML.replace('id="screen-content" class="boot"', 'id="removed-content" class="boot"') }],
  ["本文スキップ", "スキップリンク", { html: APP_HTML.replace('href="#screen-content"', 'href="#missing"') }],
  ["二重フォーカス表示", "フォーカス", { css: APP_CSS.replace("box-shadow: 0 0 0 5px #1d4ed8;", "box-shadow: none;") }],
  ["参加コード折り返し", "参加コード", { css: APP_CSS.replace("#workspace-join-code {\n  display: block;\n  max-width: 100%;\n  overflow-wrap: anywhere;", "#workspace-join-code {\n  display: block;\n  max-width: 100%;\n  overflow-wrap: normal;") }],
  ["900px再配置", "主要レイアウト", { css: APP_CSS.replace("@media (max-width: 900px)", "@media (min-width: 9999px)") }],
  ["520pxナビ再配置", "ナビを1列", { css: APP_CSS.replace("@media (max-width: 520px)", "@media (min-width: 9999px)") }],
  ["強制カラー", "強制カラーモード", { css: APP_CSS.replace("@media (forced-colors: active)", "@media (forced-colors: none)") }],
  ["ログイン画面のスキップ先", "ログイン画面", { js: APP_JS.replace('id="screen-content" class="login-screen"', 'id="removed-content" class="login-screen"') }],
  ["障害画面のスキップ先", "障害画面", { js: APP_JS.replace('id="screen-content" class="boot" role="alert" aria-live="assertive" tabindex="-1"', 'id="removed-content" class="boot" role="alert" aria-live="assertive" tabindex="-1"') }],
  ["認証更新画面のスキップ先", "認証更新画面", { js: APP_JS.replace('id="screen-content" class="boot" tabindex="-1" role="status" aria-live="polite"', 'class="boot" role="status" aria-live="polite"') }],
  ["共通シェルのスキップ先", "共通シェル", { js: APP_JS.replace('id="screen-content" class="main"', 'id="removed-content" class="main"') }],
  ["主要ナビの名前", "主要ナビゲーション", { js: APP_JS.replace('aria-label="主要メニュー"', "") }],
  ["メンバー導線", "メンバー管理", { js: APP_JS.replace('href="#members-heading">メンバー管理</a>', "メンバー管理") }],
  ["準備中", "準備中表示", { js: APP_JS.replaceAll('<span class="nav-item" aria-disabled="true">', '<a class="nav-item">') }],
  ["workspace表", "ワークスペース表", { js: APP_JS.replace('role="region" tabindex="0" aria-label="所属ワークスペース一覧"', "") }],
  ["member表", "メンバー表", { js: APP_JS.replace('role="region" tabindex="0" aria-label="ワークスペースメンバー一覧"', "") }],
  ["状態通知", "状態通知", { js: APP_JS.replaceAll('aria-live="polite" aria-atomic="true"', 'aria-live="off"') }],
  ["読込フォーカス", "メンバー読込", { js: APP_JS.replace('id="members-loading-status"', 'id="removed-loading-status"') }],
  ["権限保存の対象者", "権限保存", { js: APP_JS.replace('さんの</span>権限を保存</button>', '権限を保存</button>') }],
  ["利用停止の対象者", "利用停止", { js: APP_JS.replace('さんの</span>利用を停止</button>', '利用を停止</button>') }],
  ["workspace名上限", "ワークスペース名の入力上限", { js: APP_JS.replace('data-max-code-points="64" required placeholder="例：営業部"', 'required placeholder="例：営業部"') }],
  ["workspace名code point制限", "Unicode code point", { js: APP_JS.replace('limitWorkspaceNameCodePoints(workspaceNameField);', '') }],
  ["slug正規化後上限", "URL用IDの入力上限", { js: APP_JS.replace('data-max-normalized-length="63" inputmode="url"', 'inputmode="url"') }],
  ["slug trim後制限", "trim後", { js: APP_JS.replace('limitWorkspaceSlugLength(workspaceSlugField);', '') }],
  ["参加コード上限", "参加コードの入力上限", { js: APP_JS.replace('maxlength="47" required value="', 'required value="') }],
  ["権限表示", "現在ユーザーの権限", { js: APP_JS.replaceAll("現在の権限：", "権限表示なし：") }]
];

for (const [name, expectedMessage, mutation] of contractMutations) {
  test(`${name}を単独で壊すと対応する契約検査が失敗する`, () => {
    const errors = validatePhase1Accessibility(mutation);
    assert.ok(errors.some((error) => error.includes(expectedMessage)), errors.join("\n"));
  });
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
  test(`${selector}だけを44px未満へ上書きすると検査が失敗する`, () => {
    const errors = validatePhase1Accessibility({ css: `${APP_CSS}\n${selector} { min-height: 10px; }` });
    assert.ok(errors.some((error) => error.includes(`${selector}の操作領域`)), errors.join("\n"));
  });

  test(`${selector}を高詳細度!importantで44px未満へ上書きすると検査が失敗する`, () => {
    const errors = validatePhase1Accessibility({ css: `${APP_CSS}\n.shell ${selector} { min-height: 10px !important; }` });
    assert.ok(errors.some((error) => error.includes(`${selector}の操作領域`)), errors.join("\n"));
  });
}
