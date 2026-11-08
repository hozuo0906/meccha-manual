# 初回導線のワークスペース説明（Issue #232／232-4）

Status: Accepted

検証確認日時: 2026-11-08T16:10:56+09:00（Asia/Tokyo）。branch `codex/workspace-gloss-20261108`、着手HEAD `f7b756eda7d072112d4598ed0ac09a9b46bc06d3`。検証対象は本報告書と同じcommitに含める製品・テスト差分。今回の保存範囲はcommit・push・base `main`のDraft PR作成までで、レビュー依頼・merge・deployは行わない。

## 決定事項と事前確認

- 2026-11-08のユーザー承認済み決定を実装する。「ワークスペース」の用語を隠さず、全画面のリネームも行わない。初回導線で初めて現れる保存準備ページのintroだけに一言説明を添える。
- Issue #232本文とコメント、Issue #70、session-handoff、FR-001／FR-002／FR-011／FR-022、NFR-004／NFR-007、ADR-0032、既存UX・受入・テスト戦略を確認した。Issue本文の「workspace等を隠す」という一般方針のうち、この用語の扱いは今回のユーザー承認を正とし、decision-logに記録した。
- 既存の `docs/02-ux/onboarding.md` を含むdocs内に、変更前introの逐語引用はなかった。引用の置換は不要。今回の表示契約をonboarding UXへ追記し、要件トレーサビリティも同期した。

## 変更箇所と最終文言

`apps/worker/src/onboarding-assets.ts` の次の2箇所だけに説明を挿入した。

| 表示 | 変更前 | 変更後 |
|---|---|---|
| 静的HTML、保存／共有の既定intro | ログインを確認したあと、手順書をワークスペースに保存します。 | ログインを確認したあと、手順書をワークスペース（手順書を保存する場所です）に保存します。 |
| Office出力、JSによるintro差し替え | ログインを確認したあと、ワークスペースを準備してから編集画面へ戻ります。 | ログインを確認したあと、ワークスペース（手順書を保存する場所です）を準備してから編集画面へ戻ります。 |

説明は括弧内だけで完結させ、既存の操作・目的・文の構造を維持した。Officeでは既存の `replaceChildren` が静的introを置き換えるため、同じページ内で説明が重複しない。

## 対象外と付随更新の確認

- 保存確認サマリーと手順ステップは変更していない。onboarding sourceから上記2つの括弧書きを取り除くと、着手HEADのsourceに完全一致することを確認した。サマリーに文言を追加する必要はなかった。
- `apps/worker/src/app-assets.ts` は既存の共通資産hashに `ONBOARDING_JS` も含まれるため、`APP_ASSET_VERSION` だけを `sha256-0eb68303cff76742` から `sha256-daea9b8e6d875f8a` へ更新した。通常画面のHTML／CSS／JSは着手HEADとbyte一致し、ワークスペース切替・メンバー管理・一覧等の文言を変更していない。既存のWorker runtime回帰で実内容から算出したhashとの一致を確認した。
- `index.ts`、`cloud-manual-assets.ts`、`product-auth.ts`、`apps/brand-site`、`apps/extension` に差分はない。API・イベント・DB・依存・環境変数・認証の挙動も変更していない。revision／entitlement等の表示追加もない。
- 既存の未追跡 `.artifacts/editor-image-workspace/` は今回の成果物に含めず、そのまま保持した。

## 回帰テストと結果

Node `v24.22.1`／npm `10.9.4`、ローカルの合成fixtureを使用した。

| 検証 | 追加・変更した確認 | 結果 |
|---|---|---|
| `tests/onboarding-ui.test.mjs` | unit 3件追加。bootstrap有効／無効の既定HTMLに説明付き全文があり説明は1回、Office差し替え文の説明も1回、通常画面の全export assetに説明がない | `npm run test:onboarding-ui:unit` 実行 `13598`: 2ファイル24/24、fail 0／skip 0／exit 0 |
| `tests/onboarding-ui-browser.test.mjs` | 既存の保存確認回帰へ、保存・共有への復旧・Word・PowerPointのintro全文、表示ページ内の説明1回、サマリー非露出を追加 | `npm run test:onboarding-ui:browser` 実行 `27977`: 2ファイル16/16、fail 0／skip 0／exit 0 |
| 全体 `npm run check` | Workerの資産hash／認証／D1等を含む既存パイプラインを省略せず実行 | 実行 `86991`: 全体exit 0。Node test summary 24組の集計776/776、fail 0／skip 0。最終secret／encoding checkまで完走 |
| 自己レビュー・差分確認 | introの挿入2箇所、通常assetのbyte一致、対象外ファイルの差分なしを確認 | `git diff --check` 成功。報告書・handoffをstageした後の実行 `87270` もexit 0（docs 154／secret 462／encoding 396、cached diff確認成功） |

browser回帰では既存launcherの `MECCHA_TEST_CHROME_PATH` で既設のテスト専用Chromium（`chromium-1248`）を指定した。実利用者のChrome profileや実操作データは使用していない。

先行実行の結果も区別する。制限内の全体check `73564` はD1 bindingのfile単位失敗でexit 1となり、子テストの詳細は出力されなかった。制限内unitはfile単位の2件表示で、24件の成功証跡には使用していない。先行browser `78945` はfile単位失敗、制限外の `51964` は既定Chromium `chromium-1234` の欠落で起動前に失敗した。テスト・assertionを弱めず、子プロセスを実行できる環境と既設Chromiumで上表の全検証をやり直して成功した。先行失敗を成功へ書き換えず、実行単位ごとの結果として残す。

文書追加後の制限内検査もsecret checkerの `spawnSync git EPERM` で停止したため、stage後に制限外で文書・secret・encoding・diffの一式を再実行した。成功証跡は上表の `87270` とする。browser回帰が生成した合成画面の `.artifacts/uiux-20261001/` もcommit対象外とした。

## 未実施事項と引き継ぎ

- `npm ci` は今回未実行。既存依存で全体checkとbrowser回帰を行い、依存・lockfileを変更していない。
- 最新commitのGitHub CI・正式Codex Review・レビューthread照合・利用者受入は次の1マイルストーンとしてMuseへ引き継ぐ。レビュー依頼コメントとmergeはユーザー指定により実施しない。Draft PRのレビュー依存チェックは未チェックにする。
- 実SSO、remote D1／R2、実Officeアプリ描画、screen readerによる人手確認、staging／production配信は今回の文言修正の範囲外で未実施。自律監視と終了後の継続実行は登録しない。
- push後にlocal／origin／PR head SHAとDraft状態を照合し、PR本文とIssue #70へ結果を保存する。
