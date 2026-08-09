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
| 最新Codex Review | 旧データ未補正で制約検証失敗、一覧確認後の遅延POST再ロック、遅延失敗／成功による後続POSTロック誤消去、予期しない上流4xxの入力不正表示、正本テーブル定義不整合、slug空白正規化差 | 制約前backfill、操作単位の確認済み遷移、全終端経路のuser ID＋slug一致解除、上流error code allowlist、正本同期、拡張空白正規化を追加 |

## 採用した境界

- 選択値は`sessionStorage`とタブ内メモリだけに保持し、DB・Cookieへ追加しない。
- 保存値は`userId`と`workspaceId`だけとし、最新sessionのactive所属にない値は破棄する。
- 選択値は表示用であり、将来の業務APIでもWorker認可とRLSを省略しない。
- 作成RPC成功応答はUUIDだけを返し、一覧は現在sessionから再取得する。
- RPC送信後の通信切断・上流5xx・不正成功本文は作成済みの可能性があるため、user IDとslugだけをタブ内保存して、ページ再読込後も作成フォームをロックし一覧確認を案内する。
- Workerからブラウザまでの応答切断・本文破損・非JSON応答も結果不明として扱い、一覧更新との競合時もロック保存を優先する。
- 同一ユーザーの別タブログインでは現在選択と結果不明ロックを維持し、user ID変更または未認証確定時だけ破棄する。
- workspace入力契約はforward migrationでDB/RPCにも固定し、所属一覧は1000件で技術的に上限を設ける。
- forward migrationは新制約の検証前に旧仕様の既存名を正規化・64文字へ補正し、拡張空白だけの値を「名称未設定」へ置換する。
- 一覧が保留中POSTと同じslugを確認した場合は、遅れて結果不明応答が到着してもロックを復活させない。予期しない上流4xxは入力不正ではなくサービス障害として案内する。

## 未実施

- 外部Supabaseへの既存migrationおよび`202608100001_phase1_workspace_input_hardening.sql`の適用と動的RLS testは、明示承認が必要なためこの変更では実行しない。
- production deploy、課金、AI、共有リンク、secretは変更しない。
