# Phase 1 ワークスペース導線 品質loop記録

日付: 2026-08-10

対象: GitHub Issue #34 / FR-002 / AC-002 / AC-006 / AC-012

## Scope

- 所属workspace一覧、現在workspace選択、未所属onboarding
- `create_workspace` RPCによる作成
- 読込、空、作成中、成功、結果不明、権限不足、接続失敗
- production deploy、外部DB migration適用、secret変更は対象外

## 独立レビューと反映

| 観点 | 主な指摘 | 対応 |
|---|---|---|
| セキュリティ | 選択IDを認可へ流用しない、RPC応答消失を確定失敗にしない | 最新active所属との照合、`WORKSPACE_CREATE_RESULT_UNKNOWN`を追加 |
| UI/UX | 選択、空状態、入力エラー関連付け、busy、更新失敗時の既存表示保持 | 日本語状態、`aria-busy`、`aria-invalid`、タブ内選択、stale一覧案内を追加 |
| テスト | workspace API実動、上流401/body異常、storage破損、二重submitが未検証 | Worker/UIの決定的回帰テストを追加 |
| 最終レビュー | 同一ユーザー通知で結果不明ロック消失、ブラウザ側応答消失、一覧更新競合、DB入力境界、無上限一覧 | user照合後破棄、曖昧応答の安全側ロック、競合順序修正、forward migration、上限付き取得を追加 |

## 採用した境界

- 選択値は`sessionStorage`とタブ内メモリだけに保持し、DB・Cookieへ追加しない。
- 保存値は`userId`と`workspaceId`だけとし、最新sessionのactive所属にない値は破棄する。
- 選択値は表示用であり、将来の業務APIでもWorker認可とRLSを省略しない。
- 作成RPC成功応答はUUIDだけを返し、一覧は現在sessionから再取得する。
- RPC送信後の通信切断・上流5xx・不正成功本文は作成済みの可能性があるため、user IDとslugだけをタブ内保存して、ページ再読込後も作成フォームをロックし一覧確認を案内する。
- Workerからブラウザまでの応答切断・本文破損・非JSON応答も結果不明として扱い、一覧更新との競合時もロック保存を優先する。
- 同一ユーザーの別タブログインでは現在選択と結果不明ロックを維持し、user ID変更または未認証確定時だけ破棄する。
- workspace入力契約はforward migrationでDB/RPCにも固定し、所属一覧は1000件で技術的に上限を設ける。

## 未実施

- 外部Supabaseへの既存migrationおよび`202608100001_phase1_workspace_input_hardening.sql`の適用と動的RLS testは、明示承認が必要なためこの変更では実行しない。
- production deploy、課金、AI、共有リンク、secretは変更しない。
