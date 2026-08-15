# Phase 2 手順書一覧・エディタUI

Status: Accepted

対象: Issue #65 / FR-004 / FR-005 / FR-006

## 画面

### 手順書一覧

- 選択中のワークスペース名と現在の権限を表示する。
- 読込中、空、取得失敗、取得済みを区別する。
- owner/admin/editorは新規作成フォームを利用できる。
- viewerは一覧と詳細を閲覧できるが、作成フォームを表示しない。
- 作成結果不明時は自動再送せず、一覧を再取得して「重ねて作成しない」案内を表示する。

### 手順書詳細・エディタ

- manual状態、current draft、active steps、編集可否を表示する。
- draftが無い場合は閲覧可能な空状態とし、存在しない編集フォームを表示しない。
- owner/admin/editorは基本情報、step追加・更新・soft delete・並べ替えを利用できる。
- viewerは手順文、操作対象、URLを閲覧できるが、編集フォームや削除・並べ替え操作を表示しない。
- stepは上へ/下へボタンでキーボード操作でき、全active step IDをreorder APIへ送る。
- mutation結果不明時は自動再送せず、詳細を再取得して確認を案内する。
- 1フォームの保存中も他フォームの未保存変更は現在タブのメモリで保持し、確定エラーでは送信フォームの入力も残す。
- 未保存stepを詳細再取得後へ復元するときは、その入力値が基にしていたstepの`updatedAt`も同じメモリdraftで保持・復元する。再取得後の新しいversionへ付け替えず、競合時は409で停止する。
- 編集mutationが403または所属喪失を示す404になった場合は編集UIを安全側で閉じ、詳細を再取得して最新の閲覧可否・権限を反映する。

## 個人情報・秘密情報

- input actionでも入力した値を受け取る欄を設けない。
- password、カード番号、token、個人番号を手順書UIからAPIへ送らない。
- `targetText`には「メールアドレス欄」「保存ボタン」など対象名だけを入力する。
- manual、step、instruction、targetText、URLをlocalStorage/sessionStorageへ保存しない。
- 編集中の値は現在タブのDOM・JavaScriptメモリだけに置き、ログアウト・ユーザー変更・ワークスペース変更で破棄する。

## FR-006

- instruction未入力でaction stepを追加した場合だけ、既存のローカル決定的テンプレートを利用する。
- 保存済みinstructionはtargetText/actionType変更時にも自動上書きしない。
- 外部AI APIは使用しない。

## アクセシビリティ

- 画面遷移後は画面見出しへフォーカスする。メンバー管理見出しも`tabindex="-1"`でプログラムフォーカス可能にする。
- 読込・成功・警告・失敗は`aria-live`で通知する。
- 主要操作は実ボタンとlabel付きフォームで提供する。
- step並べ替えボタンは対象step名をaccessible nameへ含める。
- 200%相当・幅640pxでも横スクロールを発生させず、主要ナビゲーションを2列以下へ再配置する。
- Phase 1の本文スキップ、可視フォーカス、44px操作領域を維持する。

## 上限と状態

- title 64、description 10,000、step title 128、instruction 4,000、targetText 256、URL 2,048文字をHTML属性とAPI/DBで一致させる。
- active stepsが200件の場合は追加ボタンを無効化する。
- operation recordingはこの画面から起動せず、ナビゲーションも「準備中」のまま維持する。

## テスト

- 静的UI安全契約: `tests/manual-editor-ui.test.mjs`
- editor作成・追加・手修正文保持、確定エラー時の入力保持、別フォーム未保存変更と元step versionの保持: `tests/e2e/phase2-manual-editor.spec.mjs`
- 403権限失効・所属喪失404時の編集UI閉鎖と詳細再取得
- viewer閲覧専用
- 幅640px・キーボード・aria-live
- Phase 1ログイン・workspace・メンバーE2E回帰
- `npm run check`
- `git diff --check`
