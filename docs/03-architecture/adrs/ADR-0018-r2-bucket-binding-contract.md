# ADR-0018: R2 bucketとbinding契約

Status: Accepted

ADR-0028により、R2の認証・metadata境界をSupabase Auth/Postgres/RLSからAccess/D1/Worker認可へ置換する。bucket/binding名、private、環境分離、production未作成の契約は維持する。

## 背景

ファイル本体はCloudflare R2を第一候補にする方針は決定済み。ただしR2 bucketを作る前に `wrangler.jsonc` へbindingを書くと、存在しないbucket参照でdeployが失敗する可能性がある。

## 決定

- staging 4 bucketはユーザーの作成完了申告あり。production 4 bucketはまだ作成しない。
- bucket作成までは `wrangler.jsonc` に `r2_buckets` を追加しない。
- bucket自体はpublicにしない。
- ファイル配信はWorker経由、またはWorkerが発行する短期署名URL経由にする。
- Cloudflare Accessを認証前段、D1をファイル権限とメタデータの正本とし、Workerで認可する。
- R2はファイル本体だけを保存する。

## binding名

| binding | 用途 |
|---|---|
| `CAPTURE_ASSETS` | 操作記録スクリーンショット |
| `MANUAL_ASSETS` | 手順書画像、注釈済み画像 |
| `EXPORTS` | PDF、HTML、Markdown出力 |
| `AVATARS` | ユーザー、ワークスペース画像 |

## bucket名

| 環境 | bucket |
|---|---|
| staging | `meccha-manual-capture-assets-staging` |
| staging | `meccha-manual-manual-assets-staging` |
| staging | `meccha-manual-exports-staging` |
| staging | `meccha-manual-avatars-staging` |
| production | `meccha-manual-capture-assets-prod` |
| production | `meccha-manual-manual-assets-prod` |
| production | `meccha-manual-exports-prod` |
| production | `meccha-manual-avatars-prod` |

`wrangler.jsonc` では環境ごとの `r2_buckets` に同じbinding名を置き、参照先bucketだけを分ける。staging bucketは作成済み申告があるが、接続確認と変更PRを分離するため現段階ではbindingを追加しない。production bucket/bindingも追加しない。bucket名を環境変数へ重複保持しない。

## アクセスとURL

- bucketはprivateとし、公開カスタムドメインを直接割り当てない。
- Workerは検証済みAccess user identityとD1メタデータの `workspace_id`、削除状態、active membership/roleを検証する。
- 検証後にWorker proxyまたは短命URLを発行する。URLの有効期限、対象object、用途を限定し、URLそのものをDB・監査ログへ保存しない。
- 共有リンクが将来有効でも、共有トークンの検証と失効確認をWorkerで行い、R2 objectを直接公開しない。

## 削除・保持・機密情報

- 削除はD1メタデータをsoft deleteし、URL発行を即時停止してから非同期削除jobでR2 objectと派生物を削除する。
- 削除失敗は再試行対象とし、object keyではなくasset IDを監査ログへ残す。
- 保持期間はデータ種別ごとに決定し、未決期間は `open-questions.md` で管理する。期間未決のまま自動削除を有効にしない。
- スクリーンショットはPII・社内機密を含み得る。入力値、Cookie、Authorization、共有生トークン、Live View URLをobject metadataやobject keyへ入れない。
- object keyは `workspace_id` を含む推測困難なIDで構成し、元ファイル名や画面タイトルを含めない。

## 影響

- Phase 1/2ではR2 bucket作成なしでもdeployできる。
- Phase 2以降でファイル保存を実装する前に、staging bucketを作成してから `wrangler.jsonc` にbindingを追加する。
- production bucketはproduction反映の明示承認後に作成する。
