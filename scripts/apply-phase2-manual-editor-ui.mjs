import { readFile, writeFile } from "node:fs/promises";

function replaceOnce(source, find, replacement, label) {
  const index = source.indexOf(find);
  if (index < 0) throw new Error(`Missing replacement target: ${label}`);
  if (source.indexOf(find, index + find.length) >= 0) {
    throw new Error(`Replacement target is not unique: ${label}`);
  }
  return `${source.slice(0, index)}${replacement}${source.slice(index + find.length)}`;
}

let source = await readFile("apps/worker/src/app-assets.ts", "utf8");
source = source.replace(/APP_ASSET_VERSION = "[^"]+"/, 'APP_ASSET_VERSION = "sha256-phase2-manual-editor-v1"');
source = replaceOnce(
  source,
  "button,\ninput,\nselect {",
  "button,\ninput,\nselect,\ntextarea {",
  "textarea font inheritance"
);

const manualCss = String.raw`
.nav-button {
  width: 100%;
  justify-content: flex-start;
  background: transparent;
  text-align: left;
}

.manual-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(300px, 380px);
  gap: 20px;
}

.manual-layout > .section,
.manual-layout > .workspace-form {
  min-width: 0;
}

.manual-list {
  display: grid;
  gap: 10px;
  padding: 16px;
}

.manual-list-item {
  width: 100%;
  min-height: 64px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  padding: 14px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: #fff;
  color: var(--text);
  text-align: left;
}

.manual-list-item:hover {
  border-color: var(--primary);
  background: #f0fdfa;
}

.manual-list-item-title {
  display: block;
  margin-bottom: 4px;
  font-weight: 800;
  overflow-wrap: anywhere;
}

.manual-form,
.manual-detail-form,
.manual-step-form {
  display: grid;
  gap: 14px;
}

.manual-form,
.manual-detail-form {
  padding: 20px;
}

.manual-form textarea,
.manual-detail-form textarea,
.manual-step-form textarea {
  min-height: 112px;
  resize: vertical;
}

.manual-detail-grid {
  display: grid;
  gap: 20px;
}

.manual-step-list {
  display: grid;
  gap: 14px;
  padding: 16px;
}

.manual-step-card {
  border: 1px solid var(--border);
  border-radius: 8px;
  background: #fff;
  overflow: hidden;
}

.manual-step-card-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--border);
  background: var(--surface-strong);
}

.manual-step-card-header h3 {
  margin-bottom: 0;
  font-size: 16px;
  overflow-wrap: anywhere;
}

.manual-step-form,
.manual-step-view {
  padding: 16px;
}

.manual-step-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.manual-step-actions,
.manual-page-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.manual-step-view dl {
  display: grid;
  grid-template-columns: minmax(110px, auto) minmax(0, 1fr);
  gap: 8px 14px;
  margin: 0;
}

.manual-step-view dt {
  color: var(--muted);
  font-weight: 800;
}

.manual-step-view dd {
  margin: 0;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.manual-back-button {
  margin-bottom: 14px;
}

.manual-warning {
  margin: 16px 20px;
}

@media (max-width: 900px) {
  .manual-layout,
  .manual-step-grid {
    grid-template-columns: 1fr;
  }
}
`;
source = replaceOnce(source, "\n@media (max-width: 900px) {", `\n${manualCss}\n@media (max-width: 900px) {`, "manual CSS");

const manualState = String.raw`
let currentScreen = "workspace";
let manualsState = { workspaceId: "", status: "idle", items: [], message: "", messageKind: "notice" };
let manualDetailState = { workspaceId: "", manualId: "", status: "idle", value: null, message: "", messageKind: "notice" };
let manualRequestSequence = 0;
let manualMutationInFlight = false;
const manualStatusLabels = {
  draft: "下書き",
  reviewing: "確認中",
  published: "公開済み",
  stale: "要更新",
  archived: "アーカイブ"
};
const manualStepTypeLabels = {
  action: "操作",
  note: "補足",
  decision: "判断",
  warning: "注意"
};
const manualActionTypeLabels = {
  click: "クリック",
  input: "入力",
  select: "選択",
  navigate: "移動",
  wait: "待機",
  other: "その他"
};

function resetManualUiState() {
  currentScreen = "workspace";
  manualsState = { workspaceId: "", status: "idle", items: [], message: "", messageKind: "notice" };
  manualDetailState = { workspaceId: "", manualId: "", status: "idle", value: null, message: "", messageKind: "notice" };
  manualRequestSequence += 1;
  manualMutationInFlight = false;
}
`;
source = replaceOnce(
  source,
  'let workspaceJoinCodeState = { status: "idle", joinCode: "", expiresAt: "", message: "" };',
  'let workspaceJoinCodeState = { status: "idle", joinCode: "", expiresAt: "", message: "" };\n' + manualState,
  "manual UI state"
);
source = replaceOnce(
  source,
  "    workspaceMembersState = null;\n    workspaceMemberRequestSequence += 1;",
  "    workspaceMembersState = null;\n    workspaceMemberRequestSequence += 1;\n    resetManualUiState();",
  "manual state reset on identity change"
);
source = replaceOnce(
  source,
  "  workspaceMembersState = null;\n  workspaceMemberRequestSequence += 1;\n  try {\n    sessionStorage.setItem(currentWorkspaceStorageKey",
  "  workspaceMembersState = null;\n  workspaceMemberRequestSequence += 1;\n  manualsState = { workspaceId: selected.id, status: \"idle\", items: [], message: \"\", messageKind: \"notice\" };\n  manualDetailState = { workspaceId: selected.id, manualId: \"\", status: \"idle\", value: null, message: \"\", messageKind: \"notice\" };\n  manualRequestSequence += 1;\n  try {\n    sessionStorage.setItem(currentWorkspaceStorageKey",
  "manual state reset on workspace selection"
);

const manualFunctions = String.raw`
function manualCanEdit(currentWorkspace) {
  if (!currentWorkspace || workspaceMembersState?.workspaceId !== currentWorkspace.id) return false;
  return ["owner", "admin", "editor"].includes(workspaceMembersState.currentUserRole);
}

function manualSidebarHtml(session, activeScreen) {
  return '<aside class="sidebar" aria-label="アプリメニュー">' +
    '<div class="brand"><div class="logo-mark" aria-hidden="true"><span>め</span></div><span>めっちゃマニュアル</span></div>' +
    '<nav class="nav" aria-label="主要メニュー">' +
      '<button id="workspace-nav-button" class="nav-item nav-button' + (activeScreen === "workspace" ? ' active' : '') + '" type="button"' + (activeScreen === "workspace" ? ' aria-current="page"' : '') + '>ワークスペース</button>' +
      '<button id="members-nav-button" class="nav-item nav-button" type="button">メンバー管理</button>' +
      '<button id="manual-nav-button" class="nav-item nav-button' + (activeScreen !== "workspace" ? ' active' : '') + '" type="button"' + (activeScreen !== "workspace" ? ' aria-current="page"' : '') + '>手順書</button>' +
      '<span class="nav-item" aria-disabled="true"><span>操作を記録</span><span class="nav-status">準備中</span></span>' +
    '</nav>' +
    '<div class="user-box">' +
      '<span>ログイン中：' + escapeHtml(session.user.email || "メールアドレス未設定") + '</span>' +
      '<button id="logout-button" class="secondary-button" type="button">ログアウト</button>' +
    '</div>' +
  '</aside>';
}

function wireManualNavigation(currentWorkspace) {
  document.getElementById("workspace-nav-button")?.addEventListener("click", () => {
    currentScreen = "workspace";
    renderShell(currentSession, "", "notice", "workspace-heading");
  });
  document.getElementById("members-nav-button")?.addEventListener("click", () => {
    currentScreen = "workspace";
    renderShell(currentSession, "", "notice", "members-heading");
    document.getElementById("members-heading")?.scrollIntoView({ block: "start" });
  });
  document.getElementById("manual-nav-button")?.addEventListener("click", () => openManualList(currentWorkspace));
}

function openManualList(currentWorkspace, message = "", messageKind = "notice") {
  if (!currentWorkspace) {
    currentScreen = "workspace";
    renderShell(currentSession, "利用中のワークスペースを選択してください。", "error", "shell-message");
    return;
  }
  currentScreen = "manuals";
  manualDetailState = { workspaceId: currentWorkspace.id, manualId: "", status: "idle", value: null, message: "", messageKind: "notice" };
  if (message) {
    manualsState = { ...manualsState, workspaceId: currentWorkspace.id, message, messageKind };
  }
  renderShell(currentSession, "", "notice", "manuals-heading");
  if (workspaceMembersState?.status === "idle") {
    loadWorkspaceMembers(currentWorkspace.id, { alreadyRendered: true });
  }
  if (manualsState.workspaceId !== currentWorkspace.id || manualsState.status === "idle") {
    loadManuals(currentWorkspace.id);
  }
}

function manualMessageHtml(state, id) {
  const kind = state.messageKind || "notice";
  const className = state.message
    ? kind === "error" ? "error-box show" : kind === "warning" ? "warning-box show" : "notice-box show"
    : "notice-box";
  return '<div id="' + id + '" class="' + className + '" role="' + (kind === "error" ? 'alert' : 'status') + '" aria-live="' + (kind === "error" ? 'assertive' : 'polite') + '" aria-atomic="true" tabindex="-1">' + escapeHtml(state.message || "") + '</div>';
}

function manualListHtml(currentWorkspace) {
  const state = manualsState;
  const canEdit = manualCanEdit(currentWorkspace);
  const roleKnown = workspaceMembersState?.workspaceId === currentWorkspace.id && Boolean(workspaceMembersState.currentUserRole);
  let body = "";
  if (state.status === "idle" || state.status === "loading") {
    body = '<div class="empty" role="status" aria-live="polite" aria-busy="true">手順書を読み込んでいます。</div>';
  } else if (state.status === "error") {
    body = '<div class="empty"><p>手順書一覧を表示できませんでした。</p><button id="manuals-retry-button" class="secondary-button" type="button">もう一度読み込む</button></div>';
  } else if (state.items.length === 0) {
    body = '<div class="empty" role="status"><strong>手順書はまだありません。</strong><br>' + (canEdit ? '右側のフォームから最初の手順書を作成できます。' : '編集者以上の権限を持つメンバーが作成できます。') + '</div>';
  } else {
    body = '<div class="manual-list" role="list">' + state.items.map((manual) =>
      '<button class="manual-list-item" type="button" role="listitem" data-manual-id="' + escapeHtml(manual.id) + '">' +
        '<span><span class="manual-list-item-title">' + escapeHtml(manual.title) + '</span><span class="muted">更新：' + escapeHtml(new Date(manual.updatedAt).toLocaleString("ja-JP")) + '</span></span>' +
        '<span class="badge">' + escapeHtml(manualStatusLabels[manual.status] || manual.status) + '</span>' +
      '</button>'
    ).join("") + '</div>';
  }
  const createPanel = canEdit
    ? '<form id="manual-create-form" class="workspace-form manual-form" novalidate>' +
        '<h2>新しい手順書</h2><p>タイトルだけでも作成できます。説明は後から変更できます。</p>' +
        '<div class="field"><label for="manual-create-title">タイトル</label><input id="manual-create-title" name="title" maxlength="64" required></div>' +
        '<div class="field"><label for="manual-create-description">説明</label><textarea id="manual-create-description" name="description" maxlength="10000"></textarea></div>' +
        '<button class="primary-button" type="submit"' + (manualMutationInFlight ? ' disabled' : '') + '>' + (manualMutationInFlight ? '作成中' : '手順書を作成') + '</button>' +
      '</form>'
    : '<section class="workspace-form" aria-labelledby="manual-permission-heading"><h2 id="manual-permission-heading">作成権限</h2><p>' + (roleKnown ? '現在の権限では手順書を作成・編集できません。閲覧はできます。' : 'メンバー権限を確認しています。') + '</p></section>';
  return '<div class="manual-layout">' +
    '<section class="section" aria-labelledby="manual-list-heading">' +
      '<div class="section-header"><h2 id="manual-list-heading">手順書一覧</h2><span class="badge">' + (state.status === "loaded" ? state.items.length : "-") + '件</span></div>' +
      body +
    '</section>' + createPanel +
  '</div>';
}

function stepTypeOptions(value) {
  return Object.entries(manualStepTypeLabels).map(([key, label]) => '<option value="' + key + '"' + (value === key ? ' selected' : '') + '>' + label + '</option>').join("");
}

function actionTypeOptions(value) {
  return '<option value="">操作なし</option>' + Object.entries(manualActionTypeLabels).map(([key, label]) => '<option value="' + key + '"' + (value === key ? ' selected' : '') + '>' + label + '</option>').join("");
}

function manualStepHtml(step, index, count, canEdit) {
  const heading = '手順 ' + (index + 1) + '：' + step.title;
  const header = '<div class="manual-step-card-header"><h3 id="step-heading-' + escapeHtml(step.id) + '">' + escapeHtml(heading) + '</h3><span class="badge">' + escapeHtml(manualStepTypeLabels[step.type] || step.type) + '</span></div>';
  if (!canEdit) {
    return '<article class="manual-step-card" aria-labelledby="step-heading-' + escapeHtml(step.id) + '">' + header +
      '<div class="manual-step-view"><dl>' +
        '<dt>手順文</dt><dd>' + escapeHtml(step.instruction || "未入力") + '</dd>' +
        '<dt>操作対象</dt><dd>' + escapeHtml(step.targetText || "-") + '</dd>' +
        '<dt>URL</dt><dd>' + escapeHtml(step.url || "-") + '</dd>' +
      '</dl></div></article>';
  }
  return '<article class="manual-step-card" aria-labelledby="step-heading-' + escapeHtml(step.id) + '">' + header +
    '<form class="manual-step-form" data-step-id="' + escapeHtml(step.id) + '">' +
      '<div class="manual-step-grid">' +
        '<div class="field"><label for="step-type-' + escapeHtml(step.id) + '">種類</label><select id="step-type-' + escapeHtml(step.id) + '" name="type">' + stepTypeOptions(step.type) + '</select></div>' +
        '<div class="field"><label for="step-action-' + escapeHtml(step.id) + '">操作</label><select id="step-action-' + escapeHtml(step.id) + '" name="actionType">' + actionTypeOptions(step.actionType) + '</select></div>' +
      '</div>' +
      '<div class="field"><label for="step-title-' + escapeHtml(step.id) + '">見出し</label><input id="step-title-' + escapeHtml(step.id) + '" name="title" maxlength="128" required value="' + escapeHtml(step.title) + '"></div>' +
      '<div class="field"><label for="step-target-' + escapeHtml(step.id) + '">操作対象</label><input id="step-target-' + escapeHtml(step.id) + '" name="targetText" maxlength="256" value="' + escapeHtml(step.targetText || "") + '"></div>' +
      '<div class="field"><label for="step-instruction-' + escapeHtml(step.id) + '">手順文</label><textarea id="step-instruction-' + escapeHtml(step.id) + '" name="instruction" maxlength="4000">' + escapeHtml(step.instruction || "") + '</textarea><span class="muted">保存済みの手順文は、操作対象を変えても自動で上書きしません。</span></div>' +
      '<div class="field"><label for="step-url-' + escapeHtml(step.id) + '">URL</label><input id="step-url-' + escapeHtml(step.id) + '" name="url" maxlength="2048" inputmode="url" value="' + escapeHtml(step.url || "") + '"></div>' +
      '<div class="manual-step-actions">' +
        '<button class="secondary-button" type="submit"' + (manualMutationInFlight ? ' disabled' : '') + '>手順を保存</button>' +
        '<button class="secondary-button compact-button manual-step-up" type="button" data-step-id="' + escapeHtml(step.id) + '"' + (index === 0 || manualMutationInFlight ? ' disabled' : '') + '><span class="visually-hidden">' + escapeHtml(step.title) + 'を</span>上へ</button>' +
        '<button class="secondary-button compact-button manual-step-down" type="button" data-step-id="' + escapeHtml(step.id) + '"' + (index === count - 1 || manualMutationInFlight ? ' disabled' : '') + '><span class="visually-hidden">' + escapeHtml(step.title) + 'を</span>下へ</button>' +
        '<button class="danger-button compact-button manual-step-delete" type="button" data-step-id="' + escapeHtml(step.id) + '" data-step-title="' + escapeHtml(step.title) + '"' + (manualMutationInFlight ? ' disabled' : '') + '>手順を削除</button>' +
      '</div>' +
    '</form></article>';
}

function manualDetailHtml(currentWorkspace) {
  const state = manualDetailState;
  if (state.status === "idle" || state.status === "loading") {
    return '<section class="section"><div class="empty" role="status" aria-live="polite" aria-busy="true">手順書を読み込んでいます。</div></section>';
  }
  if (state.status === "error" || !state.value) {
    return '<section class="section"><div class="empty"><p>手順書を表示できませんでした。</p><button id="manual-detail-retry-button" class="secondary-button" type="button">もう一度読み込む</button></div></section>';
  }
  const value = state.value;
  const canEdit = Boolean(value.permissions?.canEdit);
  const draft = value.draft;
  const steps = value.steps || [];
  const metadata = draft
    ? canEdit
      ? '<form id="manual-draft-form" class="manual-detail-form" novalidate>' +
          '<div class="field"><label for="manual-draft-title">タイトル</label><input id="manual-draft-title" name="title" maxlength="64" required value="' + escapeHtml(draft.title) + '"></div>' +
          '<div class="field"><label for="manual-draft-description">説明</label><textarea id="manual-draft-description" name="description" maxlength="10000">' + escapeHtml(draft.description || "") + '</textarea></div>' +
          '<button class="primary-button" type="submit"' + (manualMutationInFlight ? ' disabled' : '') + '>基本情報を保存</button>' +
        '</form>'
      : '<div class="manual-step-view"><dl><dt>説明</dt><dd>' + escapeHtml(draft.description || "未入力") + '</dd><dt>権限</dt><dd>閲覧のみ</dd></dl></div>'
    : '<div class="empty"><strong>編集できる下書きがありません。</strong><br>公開済み手順書の下書き作成機能は後続で追加します。</div>';
  const stepsHtml = steps.length
    ? '<div class="manual-step-list">' + steps.map((step, index) => manualStepHtml(step, index, steps.length, canEdit)).join("") + '</div>'
    : '<div class="empty" role="status">手順はまだありません。</div>';
  const addForm = canEdit && draft
    ? '<form id="manual-step-add-form" class="workspace-form manual-form" novalidate>' +
        '<h2>手順を追加</h2><p>入力した値やパスワードは記録せず、操作対象名だけを入力してください。</p>' +
        '<div class="manual-step-grid"><div class="field"><label for="new-step-type">種類</label><select id="new-step-type" name="type">' + stepTypeOptions("action") + '</select></div><div class="field"><label for="new-step-action">操作</label><select id="new-step-action" name="actionType">' + actionTypeOptions("click") + '</select></div></div>' +
        '<div class="field"><label for="new-step-title">見出し</label><input id="new-step-title" name="title" maxlength="128" required></div>' +
        '<div class="field"><label for="new-step-target">操作対象</label><input id="new-step-target" name="targetText" maxlength="256" placeholder="例：保存ボタン"></div>' +
        '<div class="field"><label for="new-step-instruction">手順文（任意）</label><textarea id="new-step-instruction" name="instruction" maxlength="4000"></textarea><span class="muted">空欄の場合は操作対象からローカルで候補を作成します。外部AIは使用しません。</span></div>' +
        '<div class="field"><label for="new-step-url">URL（任意）</label><input id="new-step-url" name="url" maxlength="2048" inputmode="url"></div>' +
        '<button class="primary-button" type="submit"' + (manualMutationInFlight || steps.length >= 200 ? ' disabled' : '') + '>' + (steps.length >= 200 ? '手順は200件までです' : '手順を追加') + '</button>' +
      '</form>'
    : '<section class="workspace-form"><h2>編集権限</h2><p>' + (canEdit ? '編集できる下書きがありません。' : '現在の権限では閲覧のみ利用できます。') + '</p></section>';
  return '<div class="manual-detail-grid">' +
    '<section class="section" aria-labelledby="manual-metadata-heading"><div class="section-header"><div><h2 id="manual-metadata-heading">基本情報</h2><p class="muted">状態：' + escapeHtml(manualStatusLabels[value.manual.status] || value.manual.status) + '</p></div></div>' + metadata + '</section>' +
    '<div class="manual-layout"><section class="section" aria-labelledby="manual-steps-heading"><div class="section-header"><h2 id="manual-steps-heading">手順</h2><span class="badge">' + steps.length + '件</span></div>' + stepsHtml + '</section>' + addForm + '</div>' +
  '</div>';
}

function renderManualShell(session, notice = "", noticeKind = "notice", focusId = null) {
  const currentWorkspace = resolveCurrentWorkspace(session);
  prepareWorkspaceMembersState(session, currentWorkspace);
  if (!currentWorkspace) {
    currentScreen = "workspace";
    renderShell(session, "利用中のワークスペースを選択してください。", "error", "shell-message");
    return;
  }
  const isDetail = currentScreen === "manual-detail";
  const heading = isDetail && manualDetailState.value?.manual?.title ? manualDetailState.value.manual.title : "手順書";
  const subheading = isDetail ? "下書きと手順を編集します。" : "ワークスペース内の手順書を確認・作成します。";
  const state = isDetail ? manualDetailState : manualsState;
  if (notice) {
    state.message = notice;
    state.messageKind = noticeKind;
  }
  app.innerHTML = '<section class="shell">' + manualSidebarHtml(session, isDetail ? "manual-detail" : "manuals") +
    '<div id="screen-content" class="main" tabindex="-1">' +
      '<header class="topbar"><div>' +
        (isDetail ? '<button id="manual-back-button" class="secondary-button compact-button manual-back-button" type="button">手順書一覧へ戻る</button>' : '') +
        '<h1 id="' + (isDetail ? 'manual-detail-heading' : 'manuals-heading') + '" tabindex="-1">' + escapeHtml(heading) + '</h1><p>' + escapeHtml(subheading) + '</p>' +
        '<div class="context-summary"><span class="badge">' + escapeHtml(currentWorkspace.name) + '</span>' +
          (workspaceMembersState?.currentUserRole ? '<span class="badge">' + escapeHtml(workspaceRoleLabels[workspaceMembersState.currentUserRole]) + '</span>' : '') + '</div>' +
      '</div><div class="manual-page-actions"><button id="manual-reload-button" class="secondary-button" type="button">再読み込み</button></div></header>' +
      manualMessageHtml(state, isDetail ? "manual-detail-message" : "manuals-message") +
      (isDetail ? manualDetailHtml(currentWorkspace) : manualListHtml(currentWorkspace)) +
    '</div></section>';
  document.getElementById("logout-button")?.addEventListener("click", logout);
  wireManualNavigation(currentWorkspace);
  document.getElementById("manual-back-button")?.addEventListener("click", () => openManualList(currentWorkspace));
  document.getElementById("manual-reload-button")?.addEventListener("click", () => {
    if (isDetail) loadManualDetail(currentWorkspace.id, manualDetailState.manualId, { focusId: "manual-detail-message" });
    else loadManuals(currentWorkspace.id, { focusId: "manuals-message" });
  });
  document.getElementById("manuals-retry-button")?.addEventListener("click", () => loadManuals(currentWorkspace.id));
  document.getElementById("manual-detail-retry-button")?.addEventListener("click", () => loadManualDetail(currentWorkspace.id, manualDetailState.manualId));
  for (const button of document.querySelectorAll("[data-manual-id]")) {
    button.addEventListener("click", () => openManualDetail(currentWorkspace.id, button.dataset.manualId));
  }
  document.getElementById("manual-create-form")?.addEventListener("submit", createManualFromUi);
  document.getElementById("manual-draft-form")?.addEventListener("submit", updateManualDraftFromUi);
  document.getElementById("manual-step-add-form")?.addEventListener("submit", addManualStepFromUi);
  for (const form of document.querySelectorAll(".manual-step-form")) form.addEventListener("submit", updateManualStepFromUi);
  for (const button of document.querySelectorAll(".manual-step-delete")) button.addEventListener("click", deleteManualStepFromUi);
  for (const button of document.querySelectorAll(".manual-step-up, .manual-step-down")) button.addEventListener("click", reorderManualStepFromUi);
  if (focusId) document.getElementById(focusId)?.focus();
  else document.getElementById(isDetail ? "manual-detail-heading" : "manuals-heading")?.focus();
}

async function loadManuals(workspaceId, options = {}) {
  const sequence = ++manualRequestSequence;
  manualsState = { workspaceId, status: "loading", items: manualsState.workspaceId === workspaceId ? manualsState.items : [], message: "", messageKind: "notice" };
  renderShell(currentSession, "", "notice", options.focusId || null);
  try {
    const payload = await requestJson("/api/workspaces/" + encodeURIComponent(workspaceId) + "/manuals");
    if (sequence !== manualRequestSequence || currentWorkspaceSelection?.workspaceId !== workspaceId) return;
    if (!Array.isArray(payload.manuals)) throw new AppRequestError("手順書一覧を確認できませんでした。", 502, "MANUALS_RESPONSE_INVALID");
    manualsState = { workspaceId, status: "loaded", items: payload.manuals, message: options.message || "", messageKind: options.messageKind || "notice" };
    renderShell(currentSession, "", "notice", options.focusId || null);
  } catch (error) {
    if (sequence !== manualRequestSequence) return;
    if (isTerminalSessionError(error)) return loadSession();
    manualsState = { workspaceId, status: "error", items: [], message: error.message, messageKind: "error" };
    renderShell(currentSession, "", "notice", "manuals-message");
  }
}

function openManualDetail(workspaceId, manualId) {
  currentScreen = "manual-detail";
  manualDetailState = { workspaceId, manualId, status: "loading", value: null, message: "", messageKind: "notice" };
  renderShell(currentSession, "", "notice", "manual-detail-heading");
  loadManualDetail(workspaceId, manualId);
}

async function loadManualDetail(workspaceId, manualId, options = {}) {
  const sequence = ++manualRequestSequence;
  manualDetailState = { ...manualDetailState, workspaceId, manualId, status: "loading", message: "", messageKind: "notice" };
  renderShell(currentSession, "", "notice", options.focusId || null);
  try {
    const payload = await requestJson("/api/workspaces/" + encodeURIComponent(workspaceId) + "/manuals/" + encodeURIComponent(manualId));
    if (sequence !== manualRequestSequence || currentWorkspaceSelection?.workspaceId !== workspaceId) return;
    manualDetailState = { workspaceId, manualId, status: "loaded", value: payload, message: options.message || "", messageKind: options.messageKind || "notice" };
    renderShell(currentSession, "", "notice", options.focusId || null);
  } catch (error) {
    if (sequence !== manualRequestSequence) return;
    if (isTerminalSessionError(error)) return loadSession();
    manualDetailState = { workspaceId, manualId, status: "error", value: null, message: error.message, messageKind: "error" };
    renderShell(currentSession, "", "notice", "manual-detail-message");
  }
}

function manualMutationUnknown(error) {
  return error.code === "NETWORK_ERROR" || error.code === "INVALID_RESPONSE" || String(error.code || "").endsWith("_RESULT_UNKNOWN");
}

async function createManualFromUi(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const workspaceId = currentWorkspaceSelection?.workspaceId;
  const title = String(form.elements.title.value || "").trim();
  const description = String(form.elements.description.value || "");
  if (!workspaceId || !title || Array.from(title).length > 64 || Array.from(description).length > 10000) {
    manualsState.message = "タイトルは1〜64文字、説明は10,000文字以内で入力してください。";
    manualsState.messageKind = "error";
    renderShell(currentSession, "", "notice", "manuals-message");
    return;
  }
  manualMutationInFlight = true;
  renderShell(currentSession);
  try {
    const payload = await requestJson("/api/workspaces/" + encodeURIComponent(workspaceId) + "/manuals", { method: "POST", body: JSON.stringify({ title, description, folderId: null }) });
    manualMutationInFlight = false;
    openManualDetail(workspaceId, payload.manualId);
  } catch (error) {
    manualMutationInFlight = false;
    if (isTerminalSessionError(error)) return loadSession();
    if (manualMutationUnknown(error)) {
      await loadManuals(workspaceId, { message: "作成結果を一覧で確認してください。重ねて作成しないでください。", messageKind: "warning", focusId: "manuals-message" });
      return;
    }
    manualsState = { ...manualsState, message: error.message, messageKind: "error" };
    renderShell(currentSession, "", "notice", "manuals-message");
  }
}

async function runDetailMutation(operation, successMessage) {
  const workspaceId = manualDetailState.workspaceId;
  const manualId = manualDetailState.manualId;
  manualMutationInFlight = true;
  renderShell(currentSession);
  try {
    await operation(workspaceId, manualId);
    manualMutationInFlight = false;
    await loadManualDetail(workspaceId, manualId, { message: successMessage, messageKind: "notice", focusId: "manual-detail-message" });
  } catch (error) {
    manualMutationInFlight = false;
    if (isTerminalSessionError(error)) return loadSession();
    if (manualMutationUnknown(error)) {
      await loadManualDetail(workspaceId, manualId, { message: "処理結果を詳細で確認してください。重ねて操作しないでください。", messageKind: "warning", focusId: "manual-detail-message" });
      return;
    }
    manualDetailState = { ...manualDetailState, message: error.message, messageKind: "error" };
    renderShell(currentSession, "", "notice", "manual-detail-message");
  }
}

function updateManualDraftFromUi(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const title = String(form.elements.title.value || "").trim();
  const description = String(form.elements.description.value || "");
  return runDetailMutation((workspaceId, manualId) => requestJson("/api/workspaces/" + encodeURIComponent(workspaceId) + "/manuals/" + encodeURIComponent(manualId) + "/draft", { method: "PATCH", body: JSON.stringify({ title, description }) }), "基本情報を保存しました。");
}

function stepPayloadFromForm(form, isNew) {
  const payload = {
    type: form.elements.type.value,
    title: String(form.elements.title.value || "").trim(),
    actionType: form.elements.actionType.value || null,
    targetText: String(form.elements.targetText.value || "").trim() || null,
    url: String(form.elements.url.value || "").trim() || null
  };
  const instruction = String(form.elements.instruction.value || "");
  if (!isNew || instruction) payload.instruction = instruction;
  return payload;
}

function addManualStepFromUi(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = stepPayloadFromForm(form, true);
  return runDetailMutation((workspaceId, manualId) => requestJson("/api/workspaces/" + encodeURIComponent(workspaceId) + "/manuals/" + encodeURIComponent(manualId) + "/steps", { method: "POST", body: JSON.stringify(payload) }), "手順を追加しました。");
}

function updateManualStepFromUi(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const stepId = form.dataset.stepId;
  const payload = stepPayloadFromForm(form, false);
  return runDetailMutation((workspaceId, manualId) => requestJson("/api/workspaces/" + encodeURIComponent(workspaceId) + "/manuals/" + encodeURIComponent(manualId) + "/steps/" + encodeURIComponent(stepId), { method: "PATCH", body: JSON.stringify(payload) }), "手順を保存しました。");
}

function deleteManualStepFromUi(event) {
  const button = event.currentTarget;
  const stepId = button.dataset.stepId;
  const title = button.dataset.stepTitle || "この手順";
  if (!window.confirm("「" + title + "」を削除しますか？")) return;
  return runDetailMutation((workspaceId, manualId) => requestJson("/api/workspaces/" + encodeURIComponent(workspaceId) + "/manuals/" + encodeURIComponent(manualId) + "/steps/" + encodeURIComponent(stepId), { method: "DELETE" }), "手順を削除しました。");
}

function reorderManualStepFromUi(event) {
  const button = event.currentTarget;
  const stepId = button.dataset.stepId;
  const steps = [...(manualDetailState.value?.steps || [])];
  const index = steps.findIndex((step) => step.id === stepId);
  const direction = button.classList.contains("manual-step-up") ? -1 : 1;
  const targetIndex = index + direction;
  if (index < 0 || targetIndex < 0 || targetIndex >= steps.length) return;
  [steps[index], steps[targetIndex]] = [steps[targetIndex], steps[index]];
  return runDetailMutation((workspaceId, manualId) => requestJson("/api/workspaces/" + encodeURIComponent(workspaceId) + "/manuals/" + encodeURIComponent(manualId) + "/steps/reorder", { method: "POST", body: JSON.stringify({ orderedStepIds: steps.map((step) => step.id) }) }), "手順の順番を変更しました。");
}
`;
source = replaceOnce(source, "\nfunction renderShell(session, notice = \"\", noticeKind = \"notice\", focusId = null) {", `\n${manualFunctions}\nfunction renderShell(session, notice = "", noticeKind = "notice", focusId = null) {\n  if (currentScreen === "manuals" || currentScreen === "manual-detail") {\n    renderManualShell(session, notice, noticeKind, focusId);\n    return;\n  }`, "manual UI functions and render dispatch");

source = replaceOnce(
  source,
  `'<a class="nav-item active" href="#workspace-heading" aria-current="page">ワークスペース</a>' +
          '<a class="nav-item" href="#members-heading">メンバー管理</a>' +
          '<span class="nav-item" aria-disabled="true"><span>手順書</span><span class="nav-status">準備中</span></span>' +`,
  `'<button id="workspace-nav-button" class="nav-item nav-button active" type="button" aria-current="page">ワークスペース</button>' +
          '<button id="members-nav-button" class="nav-item nav-button" type="button">メンバー管理</button>' +
          '<button id="manual-nav-button" class="nav-item nav-button" type="button">手順書</button>' +`,
  "enabled manual navigation"
);
source = replaceOnce(
  source,
  `  document.getElementById("logout-button").addEventListener("click", logout);
  document.getElementById("reload-button").addEventListener("click", reloadWorkspaces);`,
  `  document.getElementById("logout-button").addEventListener("click", logout);
  wireManualNavigation(currentWorkspace);
  document.getElementById("reload-button").addEventListener("click", reloadWorkspaces);`,
  "workspace navigation wiring"
);

await writeFile("apps/worker/src/app-assets.ts", source, "utf8");
