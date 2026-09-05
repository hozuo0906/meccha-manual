# コーディングガイドライン

Status: Accepted

## 依存方向

```text
apps/web, apps/worker -> application -> domains -> shared/contracts
infrastructure -> application/domainへのadapter
```

`domains` から Cloudflare、Supabase、Stripeをimportしてはいけません。

## 推奨コード構造

```text
apps/
  web/
  worker/
domains/
  workspace/
  manual/
  capture/
  billing/
  analytics/
application/
  commands/
  queries/
infrastructure/
  cloudflare/
  supabase/ # Issue #176 M6までのlegacy adapter
  stripe/
shared/
  contracts/
  observability/
```

## 定数と設定

- ドメイン定数、UI定数、インフラ定数を分ける。
- 数値定数には単位を名前に含める。例: `captureIdleTimeoutSeconds`。
- 環境変数は型付き設定モジュールで起動時に検証する。
- 暗黙のデフォルトは禁止。未設定なら明示的に失敗させる。
- secret、server、public設定を分類する。

## 状態遷移

booleanの組み合わせではなく、列挙型と遷移表を使います。

必須項目:

- 状態名
- 遷移元
- 遷移先
- 実行主体
- 前提条件
- 副作用
- 再試行可否
- 終端状態

## Feature flag

Feature flagには次を必須にします。

- 名前
- 所有者
- 対象範囲
- 既定値
- 追加理由
- 有効期限
- 削除条件

Feature flagを権限管理の代用にしてはいけません。

## レビューで却下する例

- `utils.ts` に責務不明の関数を追加する。
- 同じステータス文字列を複数箇所へ直接書く。
- 環境変数を画面コンポーネントから読む。
- エラーをcatchしてログだけ出し、成功扱いする。
- SDK型をドメイン型として使い回す。
- Stripe webhookと画面リダイレクトの両方で課金確定する。
- Durable ObjectsとD1の両方を同じ状態の正本にする。
