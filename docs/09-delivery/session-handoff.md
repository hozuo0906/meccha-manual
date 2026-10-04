## Issue #281 / Draft PR #282 最新checkpoint

Status: Accepted

確認日時: 2026-10-03T22:07:44+09:00 (Asia/Tokyo)
- source baseは `92e37627bc699acd5886b6ff27ed90203baa8080`。最新Review5400080256の新P1（raw画像の利用者確認欠落、thread PRRT_kwDOTpNknc6omG6p）を修正した今回の差分はcommit前。写真のbytesを保持し、既存manual_image_review・確認ボタンを使って保存・出力前に確認を求める。自動PII検出・黒塗り・架空値への置換は再導入しない。確認済みと未確認を区別し、protected画像のbytes欠落はstorage_failedとして復旧を案内する。
- 親が今回のnpm ci、119/119 unit・skip 0、docs141・秘密値444・diffを確認。担当の公式CFTによる実記録1/1、実editor確認2/2、実sidepanel3/3と既存Worker/D1/R2記録連携（2手順・2画像、保存/共有画像bytes一致、共有失効拒否）の結果・対象差分を回収。外部Google/ChatGPT認証やremote D1/R2の成功証跡ではない。新commitのCI・Codex Reviewは未実行で、P1 threadは検証後に解決する。
- ユーザーの追加指示はGoogle・ChatGPTログインからworkspace・保存・Office出力までの一貫実装。別checkoutの認証branch `codex/manual-product-auth-283`、base `fb5dca7fcdd8c575f940548229526aead6cbc294` で共通session/OIDC/D1認可の実装差分を実確認した。製品ログインは未稼働。ChatGPT商用websiteは公式の限定trial/client登録が必要で、IAB申請フォームの本人必須表記を質問中、申請は未送信。identityとAI利用枠の許可は別で、AI初期OFF。remote migration/deploy/Access/billing変更なし。
- 対象source HEADは `dc119d18e6548f9fb05a3bb34ec55fcb686d2b17`、branchは `codex/manual-explicit-privacy-office-019`。Office要件（Word/PPTも出力前にログイン、guestは作成・編集可、認証済みworkspace claim後に端末生成、共有は別操作）へのユーザー回答済み。closed-editor復帰receiptの実装は `af6f107` + `0510bcd`、Office snapshot browser回帰は `dc119d1` に反映済み。release検証は未完了。
- 親が実MV3のclosed-editor復帰→Word/PPT両形式ダウンロード、別形式/別launch拒否・receipt未発行、二回目consume拒否・重複downloadなしを1/1、skip 0、exit 0で確認（source `dc119d1`、今回のruntimeテスト差分）。Office関連unit37/37 pass、component browserは `dc119d1` で1/1 pass、skip 0。npm ciは親で成功。Windows `npm run check` は docs/brand/worker/editor-tools/typecheck 通過後、既存 `wrangler.cmd` の `spawnSync ... EINVAL` で停止。一方、`dc119d1` のLinux Docs CI run37113055230/job111174537678でnpm ci/fullcheck成功をログ照合済み、Privacy run37113055312のOffice stepも成功。今回の新headのCIとCodex Reviewは別途必要で、旧SHAの成功を流用しない。
- Google clientは作成済み、資格情報はrepo外でDPAPI保護保存済み。製品Google authは未実装。auth docsのremoteは `fb5dca7`。実SSOとnative Office描画は未確認。
- P2 triage（今回ソース変更なし）: handoff期限後にclaim結果をGET回収できても、期限切れhandoffはterminalで旧Office出力を再開せず、編集画面から新しい認証・形式選択へ戻す。これは古い認証・操作を黙って再利用しない意図的な安全境界で、原本・新しい編集・既存cloudRefは保持される。最低限この境界を維持し、後続で「もう一度Word/PowerPointを書き出す」と明示する再選択案内を検討する（親PM担当、2026-10-08）。
- P2 triage（今回ソース変更なし）: 外部editor更新によるstale cloudRefの409は、対象版をlatestへ自動差替えせず、元のlocal draftとcloudRefを保持してfail-closedする契約。409で上書きを拒否する境界は維持するが、同じ古い参照で再試行を繰り返すしかない導線はUX上の欠陥として保留する（影響: 外部更新後の当該下書きではOffice出力とクラウド更新を継続できない。担当: 親PM、期限: 2026-10-08）。安全な最新版確認・差分確認・明示選択の設計が必要なため、今回の自動出力修正へ混在させない。後続修正では409後に利用者が最新版を確認して明示選択した場合だけ新しいoperation/claimを作り、同じ参照を自動再利用しない。期限後結果回収とstale参照のいずれも、このmilestoneでは自動再出力・silent revision substitutionを追加しない。
- P2修正（review4173032863 / thread `PRRT_kwDOTpNknc6onN7S`）: `persistCandidate` が `draft.steps` をcloneして置換した後も、画像編集・確認ボタンのclosureが古いstepを描画し、確認済み画像が選択中パネルで要確認のまま残る経路を修正した。保存後・確認後は現行`draft.steps`の対象stepを再取得して描画する。二回目の画像編集後に明示確認し、選択パネルが即時に確認済みへ切り替わる実browser回帰を追加し、editor browser suite 28/28、`node --check`、`git diff --check`を確認済み。対象commitは親回収・保存待ち、未release、最新headに対するCI／Codex Review／thread解決は未確認である。
- 次の1マイルストーンは、最新headでMV3 runtime、CI、Codex Reviewを照合し、上記P2の再選択・明示選択導線を別bounded unitで判断すること。

# セッション引き継ぎ運用

## Issue #281 / Draft PR #282 現在checkpoint

Status: Accepted

確認時点: 2026-10-03T13:28:38+09:00（Asia/Tokyo）／source head d19065cf7fbe4259f4160b25ebc5db6c0aa56dab、branch codex/manual-explicit-privacy-office-019。既存の引き継ぎ履歴は保持する。

- User 0.1.8 ZIP（全33ファイル）は a44dde8d21066f8657fa11b4143ccfdf87f2f0e2。base Draft PR #279を保持する。
- 実装方針は、自動PIIマスク／値置換を停止し、明示した画像個人情報modeだけを扱う。同一の架空人物について氏名とカナをそろえ、Word／PPTはローカル20画像exportとする。remote API writeは行わない。
- 親のcapture関連検証は865 native 1/20 operations、ccc188 unit、dd817 Office 2 browser／20 images／XML reader（実Office描画未実施）。f6 latest worker 74／Office 13／UI390はtestpassだが、親source修正直後の再検証中である。
- CI 865にはasset hash mismatchとOfficeDL 8s timeoutが残り、修正候補を進行中である。全体成功・完成とは扱わない。
- Cloudflare管理UIの読み取り確認（2026-10-03T13:26+09:00、Asia/Tokyo）では、対象owner stagingappはCloudflare IdPのみ、OTP未登録、owner emailのallowは1件だった。設定変更、production、DB migration、deployは実施していない。OTP設定追加／対象app切替案は停止・不採用とし、CF accountを用意させない普通メール登録／ログイン、Google／ChatGPTログインを新製品authの設計条件とする。
- OpenAI公式のSIWC資料（https://developers.openai.com/siwc/quickstart、https://developers.openai.com/siwc/token-sharing-open-source）に基づくidentity／利用枠scope、commercial remoteの限定trial／waitlist、OSS localの一般対象は、auth migrationの別bounded単位で設計する。AI利用枠は初期OFFとし、未登録client／未承認commercialを完成扱いにしない。 関連するAPI／DB／auth契約移行はIssue #283の別bounded単位とする。
- PR #279 migration 0006／0007は未承認・未適用、商用公開は未確認、main mergeの自動実行は禁止する。
- 次の1マイルストーンは、最新exact full SHAに対するCI／Codex Review／UI検証、限定0.1.9 ZIPの確認である。残る未確認環境を明記し、auth migrationは別Issueのbounded設計として切り出す。

Status: Accepted

## Issue #272 / PR #278 現時点snapshot

Status: Accepted

確認時点: 2026-10-01（Asia/Tokyo）／source修正commit `fa7d1ee31cd6a44a8dcea5de75711de7e9d7386f`、source branch remote head `dd19e89e2145f28dd3cf6d73773ba758d2d6a4c9`（docs同期後）、PR #278 head `f9c49bb7de9da1a6716478abe5e19f4c97e2b6db`（source回収前snapshot）

- `fa7`の画像差し替え競合修正は、遅延bitmap decodeと同一screenshot IDを使う実ブラウザ回帰を含め、追加ケースおよび既存editor browser 18/18で確認済み。差し替え成功時は旧画像editorを閉じ、bitmap identityが異なる旧dialog保存を拒否する。
- 親のintegration `f9c49bb7de9da1a6716478abe5e19f4c97e2b6db` はsource回収前snapshotである。現在のintegration head、CI／Codex Review、対象UXの実確認、限定配布状態はIssue #70とPR #278から再取得する。owner本人による実SSO確認も未確認である。
- 次の1マイルストーンは、最新integration headで全品質ゲート（CI・Review・対象UX・限定配布境界）を確認し、Issue #70とPR #278のlive stateを同期することである。

## Issue #262 / manifest 0.1.5 離脱警告回帰（作業中）

Status: Accepted

確認時点: 2026-09-27（Asia/Tokyo）／native・unit回帰実行後

- 対象: manifest `0.1.5`候補で、通常の送信pendingと送信失敗・保存成功未確認を分離し、通常リンク／フォーム遷移では離脱警告を出さず、失敗時の再試行保護とサイト自身のbeforeunload警告を維持する。retain中の未保存batchも保護する。
- 検証済み: `extension-sidepanel-browser.test.mjs` native MV3 2/2、extension unit 110/110、cloud claim unit 12/12、通常遷移前後のclick／input／navigation／form submit保持、世代違いACK、失敗後再送、retain警告。`npm ci`成功、docs／encoding／diff check成功。
- 未確認: `npm run check`は既存brand checkの`_headers` cache rule不足で停止した。最新CI・review・配布候補の状態はIssue #70のlive stateを参照する。今回Worker、DB、productionの変更はない。

次の1マイルストーンは、本人の拡張機能更新後にIssue #262の通常遷移・保存失敗・サイト自身警告を実Chromeで確認し、Issue #70へ最新CI／review／配布証跡を同期することである。

## Issue #260 / PR #261 実記録からWorker保存・共有までの回帰（未完）

Status: Accepted

確認時点: 2026-09-27（Asia/Tokyo）／source化した回帰試験のsnapshot

- 対象: native sidepanelがexportしたdraftの実画像bytesを、実Worker route・D1 migration／SQLite adapter・memory R2へ保存し、cloud viewerと共有viewerで復元・CSP・共有停止を確認する回帰試験。CIではsidepanel test直後に `scripts/verify-recorded-workflow.mjs` を実行し、draft pathが欠落した場合は失敗させる。
- 検証境界: 現在は合成JWT、local Worker、SQLite D1 adapter、memory R2の再現可能な証跡であり、実Access、remote D1／R2、staging deploy、owner限定本番相当データの成功を証明しない。metadata出力へ画像bytes、token、passcodeを残さず、PNG成果物はこの合成検証の画面証跡に限定する。
- 旧版の扱い: 旧拡張版は記録終了時に最後の操作へだけ画像を付けていた。保存されていない過去の画像は復元できず、必要な手順は新版で再記録する。過去の単独API smokeを実記録からの通し成功として流用しない。

次の1マイルストーンは、Issue #260／PR #261のlatest SHAへCI・review・品質ゲートを照合し、承認済み範囲で限定反映と引継ぎ記録更新を行うことである。本番成功や最終SHAはこのsnapshotでは判定しない。

## D1共有リンク引継ぎ（Issue #258 / PR #259）

Status: Accepted

確認時点: 2026-09-26（Asia/Tokyo）／PR準備時点のsnapshot

- 対象: D1 migration `0005_d1_share_links.sql`、共有linkのcrypto／router、`/s/` viewer、Access/D1 index dispatch、D契約、ADR-0034。管理APIはAccess認証済みowner/admin/editorだけが発行・停止し、匿名viewerはtokenのfragmentをWorker request headerへ移して短期grantで本文とprivate R2 assetを読む。snapshotはpublished revisionと新規step IDで固定し、draft編集は共有内容へ反映しない。
- PR準備時点の状態: Issue #258、PR #259を正本候補として扱い、`0005`はremote D1へ未適用、D Workerは未deploy、Access配下の`/s/*`は未公開だった。以降のPR head SHA、最新CI、最新Codex Review、merge、migration、deploy、公開、C owner本人による実Chrome拡張E2Eの現在値はIssue #70とPR #259のlive stateから再取得し、このsnapshotを現況の根拠にしない。
- 確認済みの範囲: localの共有backend／runtime、viewer browser（mock API）テスト、migration／契約／ADRの対応を確認する。mock APIのbrowserテストは実D1認可、実Access、実R2、remote migration、deployを証明しない。
- stagingの次の実行条件: 親PMがIssue #70とPR #259のlive stateで対象SHA、migration順序、CI／review、owner限定staging binding、Access policy、private R2、rollback条件を照合した後に限る。D1 migration適用、Worker deploy、Access `/s/*`公開、production反映、実データ操作はこの引継ぎから自動実行しない。
- 利用者確認では、実在のtoken、passcode、workspace ID、画像、Access credential、個人情報をログ、Markdown、スクリーンショットへ残さない。実行証跡は合成値または承認済みowner限定stagingの最小結果に限定し、live状態は毎回Issue #70とPR #259で再取得する。

次の1マイルストーンは、PR #259の最新headに対するCI／review／merge状態と`0005`のremote適用、D Worker deploy、owner限定stagingの`/s/` viewer通し確認を親PMが照合し、未確認項目を残したまま公開・完了判定へ進めないことである。

## 目的

### 2026-09-17 release作業の追加確認

- PR #245: 横方向scrollの保持、開始失敗直後の復旧UI、navigation時の二重保存失敗でもrecorder再注入、残存starting状態の復元を修正。拡張機能のローカル回帰テスト49件成功。最新SHAのCI/review/mergeはGitHubで再照合する。
- 二重保存障害時の再注入失敗表示は同一service worker生存中の補助状態でも保持する。保存領域の障害とworker強制終了が重なる場合の永続復旧は保証しない。
- PR #250はS2 bootstrapのみの積み上げPR。`601df7a`でoperation IDのASCII文字種・長さ・NUL拒否をDB制約へ追加し、直接DB書込みを含むHTTP/D1テスト30件成功。handoff/upload/claimと実環境検証は未完了。
- 読み取り専用Cloudflare監査run `35117878090`は失敗。CI用認証ではD1取得は認証無効、R2取得は権限不足、取得ページ内のAccess applicationは0件。専用staging Workerは未作成。既存Workerへ代替deployしない。
- 作業対象は専用開発checkout・対象GitHub repository・関連検証環境に限定する。業務フォルダ、通常の業務ブラウザ、実業務情報は検証に使わず、外部へ送信しない。

長期開発を特定のChatGPT/Codex会話へ依存させず、新しいセッションがGitHub上の正本と実状態・証跡を照合して安全に作業を再開できるようにする。

会話履歴は補助情報として扱い、正本の優先順位は `AGENTS.md` に従う。コード、migration、設定、commit、CI、review threadは、正本どおりに実装・検証されているかを確認するための実状態・証跡として扱う。

## 現在地の正本

プロジェクト全体のライブな現在地は、GitHub Issue #70 `META: 開発現在地・セッション引き継ぎ` に集約する。

正本の優先順位は `AGENTS.md` の文書運用に合わせ、次のとおりとする。

1. ADRと `docs/09-delivery/decision-log.md`
2. 要件、データ、API仕様
3. UX仕様
4. Issue分解・対象Issue・Pull Request
5. task reports、Issue #70の現在地サマリー、過去の会話や手作業の要約

実際のコード、migration、テスト、設定ファイル、commit、CI、review threadは、正本の内容が実装へ反映されているかを確認するための実状態・証跡として必ず照合する。正本と実状態が矛盾する場合は、実装側を自動的に正として扱わず作業を止め、`docs/09-delivery/open-questions.md` に登録して解消する。

Issue #70とGitHubの実状態が食い違う場合は、正本との整合を確認した上でIssue #70を更新する。古い記載を前提に実装を続けない。

## セッション開始手順

新しいセッションは、過去チャットの全文ではなく、次を順番に確認する。

1. `AGENTS.md`
2. この文書
3. GitHub Issue #70
4. 対象Epic、Issue、Pull Request
5. 対象branchの最新commit、base branch、`main`との差分
6. 最新head commitに対するCI、Codex Review、未解決review thread
7. 関連するFR、NFR、ADR、AC、API、データ、UX、テスト文書
8. `docs/09-delivery/open-questions.md` と `risk-register.md`

実装前に、次の形式で現在地を整理する。

- 完了済み
- 未完了
- 現在の問題または矛盾
- 対象Issue、branch、Pull Request、head SHA
- 次に行う1マイルストーン
- リスク
- owner承認が必要な操作

## セッション中のルール

- 原則として1セッションで1マイルストーンだけを進める。
- 日付が変わっても、未検証の変更を無理に区切って完成扱いにしない。
- 無関係な変更を同じbranchやPull Requestへ混ぜない。
- mainへ直接pushしない。
- 複数branchを並行する場合は、base/headと依存順を明記する。
- 同一head branchを異なるbaseへ向けたPull Requestがある場合は、正しいレビュー経路を先に確定する。
- 会話全文や生思考は保存せず、結論、根拠、採否、リスク、未決だけを記録する。

## 進捗報告と停止時の対応

Status: Accepted

適用日: 2026-09-09。`AGENTS.md` の「進捗報告と実行管理（恒久ルール）」を、通常作業・担当への委任・引き継ぎ・自動実行の報告に適用する。読み取り専用の実行は確認と報告に限定し、実装再開や設定変更の権限をこの手順から追加しない。

### 報告直前の確認

1. 対象の実行IDと現在の実行状態をツールで取得する。依頼成功は開始の証明ではない。過去の実行中表示や担当の発言だけでは現在の稼働を断定しない。
2. 担当checkoutの未commit差分・ローカルHEADと、GitHubのPR head SHAを照合する。差分がある場合は内容を確認する。リモートSHA不変とローカル作業なしを同一視しない。
3. テスト結果、CI、レビューの対象SHAを照合する。CI待ち・レビュー待ちは、その実行／依頼が存在し、どの状態にあるか確認する。古いSHAの成功を最新SHAの成功として報告しない。
4. 指摘をID／URLで整理し、新規・持越し・修正確認済み・解決確認待ちを区別する。未解決thread数と現存欠陥数は別々に数える。現行コードとの照合前は欠陥数を確定しない。
5. 前回から検証できた利用者の操作・機能、解消した欠陥、残る障害を示す。成果が増えていなければ、その事実と現在行っている処理を記載する。

取得できない項目は「未確認（理由）」、対象が存在しない項目は「該当なし」とする。毎回すべてのログを貼らず、以下の項目を現在地の記録へ簡潔に残す。

| 項目 | 必須の内容 |
| --- | --- |
| 確認日時・対象 | ISO 8601（Asia/Tokyo）、Issue、PR、branch、担当checkout |
| 実行状態 | 未着手／依頼済み・開始未確認／実行中／待機／停止／終了／未確認、実行IDと確認根拠 |
| 成果物状態 | 修正未確認／ローカル修正済み・未push／PR反映済み／検証済み／完了、差分の有無とローカルHEAD／PR head SHA |
| 検証・レビュー | 対象SHA、テスト／CIの結果、レビュー依頼・実行・結果、未実行と理由 |
| 指摘 | 新規数、持越し数、未解決thread数、現存確認済みの欠陥と未照合事項 |
| 利用者にとっての進展 | 検証した操作・機能、解消した欠陥、残る障害 |
| 次の行動 | 次の1マイルストーン、担当、次の確認条件、必要な承認 |
| 継続・引き継ぎ | 継続を担う確認済み実行／監視、または停止理由と再開条件、Issue #70／PRの未同期箇所 |

「検証済み」は明示した検証範囲だけを意味し、「完了」は既存の全品質ゲートと対象マイルストーンの受入条件を満たした場合に限る。実行が終了しても成果物が未push・未検証なら未完了である。

### 担当停止・停滞時の対応

1. 親セッションは担当の開始を確認し、稼働中は利用可能な完了待ち・状態確認を使って結果を回収する。依頼しただけで責任を終了しない。
2. 停止・中断・失敗を検知したら、最後の成果物、未commit差分、未push commit、実行中の処理、ロックの有無を確認する。担当の「テスト成功」は結果を照合するまで自己申告として扱う。
3. 既存差分を保全し、同じcheckoutへの重複編集やGit操作を避けて、承認済み範囲で新しい独立タスクを指示する。親による直接修正はユーザーが明示した場合に限る。状態不明のロックを推測で削除しない。
4. 再開した場合は開始を確認する。再開不能なら、確認した失敗、残作業、必要な入力・環境を通知する。「進行中」と言い換えたり、次のユーザー問い合わせまで放置したりしない。
5. 同じ原因の手戻りが繰り返されたら、次の再依頼前に原因・採用する修正方法・検証方法・担当範囲を見直し、結論を既存のPRまたは引き継ぎ記録へ残す。品質ゲートを緩めて進捗を作らない。

### 指摘を解決するまでの記録

各指摘は、既存PRで次の対応関係を維持する。別の重複管理台帳を必須にしない。

`指摘ID／URL → 妥当性と現行コードの確認 → 修正commit → 回帰テスト結果 → 最新SHAのレビュー結果 → 根拠返信と解決確認`

妥当な既知指摘を未修正のまま再レビューへ送り直さない。P2を保留する場合は既存品質ゲートの理由・影響・担当・期限を残す。outdatedや表示上の消滅だけで解決とせず、修正根拠とcommit SHAを返信してから解決する。最新レビューの新規指摘と過去からの持越しを合算して「今回の追加指摘」と呼ばない。

### 自律監視の登録・稼働確認

- 設定の提案、登録確認、稼働確認を区別する。保存された設定ID、有効状態、対象タスク／PR、スケジュール、次回実行予定を取得して登録を確認する。既存監視を調べ、重複登録を避ける。
- 初回実行のID・日時・結果を照合し、対象状態の取得と必要な対応が実行されたことを確認する。初回結果がまだなければ「登録確認済み・初回実行未確認」と報告する。
- 監視の指示には、各実行で何を確認し、停止時にどう復旧し、いつ通知・終了するかを保存する。担当停止・失敗・未完了の再開不能を、通知不要の「変化なし」に分類しない。
- 実行環境や権限の制約があれば明記する。セッション終了後の継続は確認できた実行・監視に基づいて報告し、端末・アプリの停止など未検証の条件下で常時稼働を保証しない。
- 文書更新だけで監視設定が変更されたとは扱わない。既存監視の保存済みプロンプトへ未反映の場合は、その未同期を明記する。
- 日次read-only監視は復旧操作義務の明示的な例外とする。停止・失敗・再開不能を報告するが、書込み・再開・設定変更は行わず、必要な復旧条件だけを示す。書込み・復旧権限を委任された別の監視に限り、保存された手順と承認範囲に従って復旧を試みる。

## 独立タスクの作成と引き継ぎ

Status: Accepted

適用日: 2026-09-09。親PMは`gpt-6-astra`（既定reasoning `high`）、作業担当は`gpt-5.6-luna`（既定reasoning `high`）とする。task作成前に親・担当のmodel／reasoningを選択・記録し、作成後に実行設定を取得して確認する。プロンプト本文への記載だけでmodel／reasoningの切替済みとは扱わず、確認できない場合は未確認として記録する。

- 親PMは範囲、受入条件、依存判断、証拠検証、品質ゲート、次指示を担当する。作業担当は明示された1作業単位だけを扱い、サブエージェントを使わず、次の作業タスクを自己増殖させない。
- 親は既存の担当稼働とファイル範囲を確認してから、限定作業ごとに新しい独立タスクを1つ作成する。通常は同時1タスクとし、競合しない範囲の並行だけを明示的に許可する。
- 作業担当は、目的・範囲・受入条件・検証・GitHub参照を含む短い作業契約を受け、受入条件が閉じるまとまりで通常の実装、テスト、文書編集を行う。会話全文や1行修正ごとの報告を引き継がず、成果物をGitHubへ保存した後、対象branch／PR／head SHA、変更要約、検証結果・未検証、残存リスク、次の判断を短く報告する。無変更の全テストや同一SHAレビューを反復しない。親が停止中なら、GitHubに再開点を残して作業を終了し、継続稼働を主張しない。
- 親は報告を待ってSHA、成果物、検証結果を実取得・照合する。必要な修正や次単位は新しい独立タスクへ指示し、親の直接修正はユーザーが明示した場合に限る。
- GitHubを別PCから復元できる作業正本とする。引き継ぎ・終了前に、必要なコード・MD・再開情報を秘密値除外で専用branchへcommit・pushし、remote SHAと保存先を確認する。未検証の途中作業は安全なbranchへWIPとして保存し、完了扱いにしない。
- 通常の引き継ぎでは、PR本文またはコメントとIssue #70の両方へ、リポジトリ、branch、PR、head SHA、未完了事項、次の1マイルストーン、再現コマンドを絶対ローカルパスや会話全文なしで記録する。PR未作成などの例外は、理由と作成条件をIssue #70へ明記する。push失敗は実エラーと代替試行を記録して未完了通知とする。
- 保存前の差分、未push commit、stash、worktreeを唯一の再開元にせず、remote保存確認後に今回作成した一時ファイルや不要checkoutだけを安全に整理する。cache、認証情報、秘密値はGitHubへ入れない。
- 保存前の差分・未push commitを破棄せず、他作業のファイル、commit、stash、worktreeを削除しない。終了・引き継ぎ前に必要成果物をcommit・pushし、remote SHA一致を確認できない場合は未完了とする。

## セッション終了手順

作業を別セッションへ渡す前に、可能な範囲で次を実施する。

1. 差分を自己レビューする。
2. `npm ci`、`npm run check`、必要な個別テスト、`git diff --check` を実行する。
3. 未実行テストと理由を記録する。
4. 変更を意図の分かるcommitへまとめ、branchへpushする。
5. Pull Requestの本文またはコメントへ、変更内容、検証結果、既知リスクを記録する。
6. 最新head SHAと、CI・Codex Review・review threadの状態を確認する。
7. Issue #70を更新する。
8. 次の1マイルストーンを1つに絞る。

Issue #70には最低限、次を残す。

- 最終確認日時（Asia/Tokyo）
- 現在のPhase
- 完了済み
- 未完了
- 対象Issue、branch、Pull Request、head SHA
- テスト結果
- P0/P1/P2と未解決review thread
- ブロッカー
- 次の1マイルストーン
- owner承認が必要な操作

## 商用リリース前後の開発操作承認

Status: Accepted

適用日: 2026-09-09。対象は開発継続とGitHub上のpush／Pull Request作成・更新／mergeであり、production反映、課金、機密情報保存、破壊的操作などの既存の別承認境界は変更しない。

- 商用リリース前は、Astra highの親PMが変更の正当性、依存順、必要な品質ゲートを実SHAで確認すれば、ユーザーへの都度確認なしに作業継続、commit、push、Pull Request作成・更新、mergeを行ってよい。保護ブランチ、必須CI、review thread、既存の安全条件は迂回しない。
- 商用リリース後は、push、Pull Request作成・更新、mergeなどの外部反映ごとにユーザーの事前承認を得る。承認待ちでは可逆的な差分・テストによる具体案の準備は可とするが、外部反映前に対象SHA／差分を提示し、未push成果物だけを残して終了しない。承認待ちが必要なら明示する。終了前push必須の規則は、作業開始前に得た具体的な承認範囲がある場合に限り適用する。
- 商用リリースの実施時は、日時、リリース識別子、根拠をIssue #70へ記録して承認境界を切り替える。記録が不在または曖昧な場合は商用リリース状態を未確認とし、未リリースと決めつけた自動mergeを行わず、read-only確認と提案を先に行う。
- 最初の商用公開そのもの、production反映、課金、機密情報保存、破壊的操作などの既存の別承認境界は、この開発操作承認によって拡張しない。
- 古い一般的な「owner承認待ち」だけを理由に、商用リリース前の通常のpush、Pull Request作成・更新、mergeを停止しない。商用リリース前はAstra high親PMの実SHA確認と品質ゲートを適用し、商用リリース後は操作ごとにユーザーの事前承認を得る。

## Product / Development current state (2026-09-13)

### 最新差分（2026-09-16）

追記（2026-09-17）: 追加reviewの終了時journal失敗・window close競合・closed-shadow top-layer・canvas秘匿へ対応。入力／scrollはpagehide前からcheckpoint送信し、未ACKで離脱する際はbeforeunload警告を要求する。ブラウザ強制終了や警告を無視した離脱の永続化まで保証するものではない。拡張テスト43件と、実Chromeのclosed-shadow modal／canvasマスク・復元テスト1件が成功。S2 bootstrapは専用branch `codex/s2-onboarding-bootstrap` の `2a19ffb` へ保全し、HTTP／D1回帰29件成功（まだmain未統合・staging未適用）。

最新のowner指示はChrome Extension／guest-first方針でPR #245のS1統合からS2保存・ログイン連携へ進めること。旧PR #223はmainへmerge済みであり、旧M4を先行させない。

- PR #245の基準head `a9eccc88661bb171590708f3a733b4c65228f4bf` に対するreview 5205315585の3件を修正。入力欄切替とscroll container切替の未ACKイベントをfinishまで保持し、closed shadow hostのマスクをsubtree全体に効くopacityへ変更した。
- 追加review 4028320592の指摘に対し、navigation時の再注入失敗markerを保存領域の失敗時にも同一service worker内のfallbackとして保持し、finish_failedなど後続phaseの永続化に成功した時点で解除する回帰修正を行う。再注入失敗後の終了失敗からsmartphone/tablet再試行までのservice worker VM回帰を追加した。
- 追加したservice workerのVM回帰テストを含め `npm run extension:test` は52件成功。今回の `npm run check` は `docs:check` 成功後、既存のbrand `_headers` cache rule不足で停止したため、brand以降は未実施で全体成功とは扱わない。
- この記録を含む最新SHAのCI、review、unresolved thread、merge状態はPR #245で確認する。S2、staging deploy、公開URL smokeはまだ完了していない。
- 次はS1のexact-head品質ゲートを満たして統合し、Issue #228のsecure handoff／bootstrap／claimを実装する。S1を保存・共有・PDFまで完成したMVPとは扱わない。

### 2026-09-20 A: guest editor mask gesture

- PR #245の先行修正 `73b3f0655e92a89b6ad0fac4e79ed472f160072d` をbaseに、`editor.js` で画像のネイティブドラッグを無効化し、`pointercancel` 時にドラッグ開始点を破棄した。統合用commitは `9870313`。
- `tests/extension-editor-browser.test.mjs` を追加し、合成local draftをHTTP fixtureへ保存して、実ブラウザのmouse gestureによるマスク追加、IndexedDB再読込後の保持、削除後の再読込を確認する。`node --test tests/extension-editor-browser.test.mjs tests/extension-mvp.test.mjs` は23件成功した。これは旧来のextension test／mask testの証跡とは分けて扱う。
- マスク操作の実装修正・ローカル回帰は完了。A全体は最新SHAのCI、Codex Review、merge確認待ち。このセッションではB以降未着手で、次の候補はB。PR #245の最新CI、review、unresolved thread、merge状態はIssue #70とPRのライブ状態を正本として確認する。この記録だけではそれらを完了扱いにしない。

### 2026-09-20 A: capture metadata／記録完全性 review修正

- PR #245の追加review 4056043437／4056043441／4056043444に対し、clickの表示由来metadataを固定semantic labelへ正規化し、storage二重障害時のnavigationを同一session ID限定のfallbackから後続session／draftへ重複なくmergeし、記録開始時に既存scroll要素の現在位置をseedする修正を追加した。
- 動的に追加された未知scroll要素は初回位置を0と推測せずseedだけ行い、次の差分から方向を記録する。この制約とservice worker終了中の一時fallback非durabilityはADR-0031／DEC-071／requirements-traceabilityへ反映した。
- `node --test tests/extension-mvp.test.mjs tests/extension-pending-events.test.mjs tests/extension-finish-recovery.test.mjs` は40件成功。全体の`npm ci`／`npm run check`／CI／Codex Review／push後SHA一致は親PMが最新headで確認する。

### 2026-09-13のpivot基準（Historical）

以下はpivot時点の記録である。後続の個別PR節および末尾のPR #240 review節はHistoricalであり、現在地や次マイルストーンの正本として使用しない。

- PR #242はmerge済み。確認済みmainは `5697d1969bdbac629084671fe708181c55dd514f`。
- MVP capture runtimeはChrome Extension Manifest V3だけとし、Cloudflare Browser Run／Browser Session／Live ViewはLegacy／Historicalで、fallbackしない。
- backendはCloudflare Access／Workers／D1／private R2を正本とする。Supabase Auth／Postgres／RLSはmigration baseline／historical implementationであり、新規Product機能の土台として拡張しない。
- development／staging Accessは明示Emails／Groups allowlistを維持する。production商用MVPの一般利用者はOne-time PINでself-service本人確認へ到達できるが、Access到達はbusiness authorizationを意味しない。
- Personal WorkspaceのD1 discriminator／一意制約、guest onboarding、authenticated staged asset upload、idempotent claim、KPI observability correctionの契約はPR #242でmainへ統合済み。

次の1マイルストーンは、PR #234 `fix(extension): persist capture session across Manifest V3 service worker suspension` をこのmainへ追従し、Product／security contractとの差分を閉じることである。最低限、次を確認する。

- original Chrome window boundsとstateのsession persistence、maximized／fullscreenからnormalへの遷移、completion／cancel／failure／target tab close時の復元
- MV3 service worker suspension後のcapture継続
- guest editorのstep削除／並べ替え／screenshot確認／masking
- sensitive DOM／input情報の最小化
- secure extension → authenticated web app handoffとoutput gate integration boundary
- PDF MVPへの依存

secure handoff／bootstrap／claim等がPR #234のreview可能なscopeを超える場合は、Issue #228等の後続S2 sliceへ明確に分け、PR #234をMVP全体完成と報告しない。

## PR #78 実行引き継ぎ（2026-08-17）

この節は、PR #78 `feature/phase2-manual-editor-ui` をowner承認後にmergeできる品質へ仕上げた実行の固定証跡である。最終head SHA、最終CI、最終Codex Review、未解決thread数は、この文書を含むcommit自身では確定できないため、PR #78とIssue #70のライブ状態を確認する。

### 確認済みの基準

- main: `807f3b240c5c476a4e01e8ad4979a12ab66ce468`
- PR: #78、base `main`、head `feature/phase2-manual-editor-ui`
- code-validation head: `f287db3f989a655715f14b01c0e8b7afcd06b1ba`
- mainからのbehind: 0（mainを2-parent merge済み）
- 一時workflow `.github/workflows/apply-pr78-final-three-fixes.yml`: 削除済み
- 一時適用script `scripts/apply-pr78-final-three-fixes.py`: 削除済み
- staging／production migration、deploy、課金、外部AI API、共有リンク、外部ユーザー招待: 未実行

### 恒久修正

- 結果不明のmanual作成状態をworkspace単位で保持し、workspace切替や遅着list GETで警告を失わない。
- 初回detail取得中の所属・権限失効を、一覧へ戻った後も含めfail closedで再描画・再取得する。
- manual、current draft、steps、編集可否を`get_manual_edit_detail`の単一SQL／MVCC snapshotから返す。
- direct step RPCとWorkerで、userinfo、authority、IPv4／IPv6、port、punycode、underscore host、空白・制御文字、backslash、入力・serial化後長さのURL境界を一致させる。
- 最終Codex Reviewで確認されたRFC 3986 ASCII delimiter（`'`、`;`、`=`）を、Worker・direct RPCの共通URL budgetでWHATWG同様に数え、apostropheはquery内の`%27`とpath／fragmentの1文字を区別する。
- 追加・更新RPCの不正URLを`400 MANUAL_STEP_URL_INVALID`へ決定的に変換する。
- FR-004／FR-005の参照をADR-0004／ADR-0005へ修正し、AC-010の公開URLはPR #78ではなくEpic #54の後続範囲として分離する。

### code-validation headの品質証跡

- Manual API: run `32036328711` success
- Manual Edit API: run `32036328713` success（Unit/API、使い捨てPostgreSQL、RLS、RPC、共有lock、migration safety）
- Manual Step Migration: run `32036328703` success（direct RPC正常・異常境界を含む）
- Manual Editor UI: run `32036328750` success（`npm ci`、`npm run check`相当repository checks、Phase 1／2 Playwright、`git diff --check`）
- Phase 1 Readiness Gate: run `32036328706` success
- Docs CI: run `32036328709` success
- Quality Loop Gate: run `32036328700` success
- R2 Storage Policy: run `32036328719` success
- Cloud Codex Readiness: run `32036328712` success
- Business OS Codex Runner: run `32036328701` success
- code-validation head時点の未解決review thread: 0件

ローカル環境では外部npm取得が制限され、Docker／PostgreSQL／Playwright実行環境もないため、`npm ci`、`npm run check`、DB、browser E2EはGitHub Actionsの同一head証跡を採用した。ローカルでは対象Unit/API、Worker runtime、migration・契約静的検査、機密値、encoding、`git diff --check`を実行した。失敗した検査をskipして成功扱いにはしていない。

### 依存関係と次の操作

- PR #67、#68、#73、#75はopen／未mergeのまま。PR #78への包含確認後も、owner承認なしにcloseしない。
- Issue #55はADR-0004／ADR-0005、Issue #72は未merge依存関係へ訂正済み。
- この文書を含む最終headで必須CI成功、Codex Review完了、P0／P1／P2未解決0、review thread 0を再確認する。
- 次の1マイルストーンはownerによるPR #78のmerge承認とmergeである。merge後のstaging migration／deploy、旧PR整理、公開機能は別マイルストーン・別承認とする。

## PR #81 実行引き継ぎ（2026-08-18）

- 対象: Issue #80、branch `agent/phase2-manual-publication`、PR #81、base `main`
- 起点main: `6c6a2511de5830d9003936942b58ef4561d5c878`
- 実装: 表示中revision IDを必須にする公開・次draft作成API、manual row lock内で期待IDを照合するRPC、確認付き編集UI、viewer拒否、結果不明後の詳細再照合。
- DB: `202608180001_phase2_manual_publication.sql`を追加。期待IDなしの旧公開RPCはauthenticated実行不可。公開版は不変のままmetadataとactive stepsだけを次draftへ複製する。
- 範囲外: 未ログイン公開URL・共有リンク、staging／production migration適用、deploy、課金、外部AI API。
- ローカル: `npm ci`、対象Unit/API/UI 74件、Worker runtime 59件、docs、typecheck、migration ordering／safety、bundle dry-run、`git diff --check`を確認。Playwrightは配布元証明書の時刻エラーでChromiumを取得できず、DBはローカルPostgreSQL／Docker不在のためGitHub Actionsで確認する。
- GitHub Actions: 使い捨てPostgreSQLの公開・draft作成・viewer・競合・lock検査を含むManual Edit APIが成功。Phase 1／2 PlaywrightとPhase 1 Readinessを含む最新headの最終状態はPR #81で確認する。
- 最新head SHA、Codex Review、未解決thread数は、この文書を含むcommitより後に確定するためPR #81とIssue #70のライブ状態を正とする。
- 次の1マイルストーン: 最新headで全必須CI、Codex Review、P0／P1／P2、未解決thread 0を確定し、owner承認後にPR #81をmergeする。merge、migration適用、deployは自動実行しない。

## PR #83 実行引き継ぎ（2026-08-18）

- 対象: Issue #82、branch `agent/phase2-manual-archive`、PR #83、base `main`
- 起点main: `f400c647d2da47c7df5e771cb4ff20a79b638bd3`
- code-validation head: `0bf19c91ee07a01ab6dd4ca53eaa30e7c9f7afdf`
- 実装: owner／admin／editor向けの確認付きアーカイブAPIとUI、manual row lock内でworkspace・role・期待`updated_at`を再照合する`archive_manual` RPC、結果不明時の自動再送防止、`manual.archived`監査ログ。全step mutation RPCもmanual→revision順でlockし、成功時にmanualのarchive versionを進める。
- 保持境界: `status = archived`と`archived_at`だけを更新し、draft／published revision pointer、revision、stepを保持する。通常の一覧・詳細・authenticated直接SELECTからarchived manualを除外する。
- 拒否境界: viewer、別workspace、既archived、古いversionを拒否する。未保存フォームがある状態ではアーカイブを開始しない。archived manualのrevision／step／step targetはauthenticated直接SELECTから除外し、専用lock/version経路が未実装のstep target直接DMLはrevokeする。
- 未決・範囲外: 復元、物理削除、関連資源の削除順序はOQ-028で未決。本PRでは実装しない。staging／production migration、deploy、共有リンク公開、課金、外部AI APIも未実行。
- ローカル: `npm ci`、対象Unit／API／UI 79件、Worker runtime 59件、Worker mutation 3件、App auth 87件、Phase 1 accessibility 45件、typecheck、bundle dry-run、docs、workflow、migration ordering／safety、機密値、encoding、`git diff --check`が成功。ローカルDB／Docker不在とChromium配布元の証明書時刻エラーにより、DBとPlaywrightはGitHub Actionsで確認した。
- code-validation headのGitHub Actions: Manual API、Manual Edit API（使い捨てPostgreSQLのRLS／RPC／監査／lock検査）、Manual Step Migration、Manual Editor UI（`npm ci`、repository checks、Phase 1／2 Playwright）、Phase 1 Readiness、Docs CI、Quality Loop、R2 Storage Policy、Cloud Codex Readiness、Business OS Codex Runnerが成功。
- code-validation head時点のreview thread: 0件。最終head SHA、最終Codex Review、Latest Review Gateは、この文書を含むcommitより後に確定するためPR #83とIssue #70のライブ状態を正とする。
- 次の1マイルストーン: この文書を含む最新headで全必須CI、Codex Review、P0／P1／P2、未解決thread 0を再確定し、承認済みのPR #83をmergeする。merge後は別branch／PRでIssue #57のBrowser Run操作記録とdraft生成へ進む。

## PR #85 実行引き継ぎ（2026-08-18）

- 前マイルストーン: PR #83はsquash merge済み。main merge commitは`331e89cb8f48a67917f1e67ab023c1158c00fb27`、Issue #82はclose済み。
- 対象: Issue #84、branch `agent/browser-run-draft`、PR #85、base `main`。親Issue #57は実Browser Run E2E未完了のためopenを維持する。
- 起点main: `331e89cb8f48a67917f1e67ab023c1158c00fb27`。
- 実装: capture start、Live View、command、mobile previewのworkspace付き`/api`／`/v1` APIを、認証・same-origin・owner／admin／editor確認後に`503 BROWSER_EGRESS_NOT_VERIFIED`でfail closedにする。Worker設定・型へBrowser Run／Durable Object bindingは追加せず、Cloudflare通信は開始しない。
- 正規化: click、input completion、navigation、方向付きscrollだけを最大200件受理し、正の一意な数値sequence順へ整列する。重複sequenceは先勝ちにせず、同じsequenceを持つ全eventを除外する。click／input completionのtargetは表示値・入力値由来でないことを証明できないため常に`対象`／`入力欄`へ置換し、navigation URLもpathへ秘密値が埋め込まれ得るため保存しない。未知field、入力値、Cookie、Authorizationは出力へ複製しない。
- draft: 外部AIを使わず、日本語manual step候補を決定的に生成する。同方向の連続scrollは1件へ集約する。DB／R2への保存、manual revision RPCとの接続は後続。
- 既存回帰: archive DB検査を固定draft UUIDではなくcurrent draft pointerへ追従させた。結果不明archiveのPlaywright fixtureはChromiumの透過再試行を誘発し得る`route.abort()`を使わず、不正JSON応答で決定的に再現し、archive API呼出1回を明示検証する。archive後の一覧遷移は選択キーをworkspace実体と誤認せず、現在sessionのactive workspaceを再解決して`undefined` workspace APIを防ぐ。
- Codex指摘: input／click labelとnavigation pathへの秘密値混入（P1）、workspaceなしの古い正規API契約、重複sequenceの入力順依存と型predicate不一致、方向なしscroll、navigation URL非保存の下流データ・運用契約反映漏れ（P2）をコード・仕様・回帰テストへ反映した。実際に解決したthreadだけをresolveした。
- ローカル: `npm ci --ignore-scripts --cache /tmp/meccha-npm-cache`、capture Unit/API/privacy 11件、manual editor UI Unit 5件、Worker runtime／mutation、App auth、Phase 1 accessibility、typecheck、bundle dry-run、docs、workflow、runtime boundary、機密値、encoding、`git diff --check`を確認。ローカルChromiumはnetwork approval制約により取得できないため、Phase 1／2 Playwrightは同一headのGitHub Actionsを証跡とする。DB変更はない。
- 安全境界: OQ-006／DEC-032が要求する全Browser通信のactual peer検証は未完了。承認済みhostも例外にせず、P0実証が完了するまで実Browser Run、Live View URL、navigate、mobile previewを有効化しない。staging／production deploy、migration、課金、外部公開も未実行。
- 最新head SHA、全必須CI、最新Codex Review、未解決thread数、merge結果は、この文書を含むcommitより後に確定するためPR #85とIssue #70のライブ状態を正とする。
- 次の1マイルストーン: PR #85を承認済み条件でmerge後、Issue #57のP0 egress検証を、navigation、subresource、WebSocket、Service Worker、download、WebTransport／QUIC、WebRTC ICE／STUN／TURNを含む外部fixtureで実証する。拘束不能な経路が1つでもあればfail closedを維持し、Browser bindingを有効化しない。

## Issue #86 実行引き継ぎ（2026-08-19）

- 前マイルストーン: PR #85はmerge済み。Issue #72はPR #78への包含とmerge済み証跡に合わせて更新し、完了closeした。
- 対象: Issue #86、PR #87、公開branch `agent/browser-run-draft`（GitHub連携の新規ref作成制約により、merge済みPR #85のbranchをmain起点へ更新して再利用）。親Issue #57とOQ-006はlive実証未完了のためopenを維持する。
- 起点main: `57a2cf6f14a290970c4ba66bc3c5c2ef80a19070`。
- 公式仕様確認: Browser Run session作成APIの`guardrails.allowedDomains`／`allowedDomainSets`はoutbound HTTP/S制限を提供する。一方、WebSocket、Service Worker、download、WebTransport/QUIC、WebRTC ICE/STUN/TURN、DNS rebinding後のactual peer送信前拒否までの保証は公式契約から確認できない。
- repo-side実装: guardrails付きsession作成、専用隔離fixtureの全10経路証跡評価、欠落・重複・未知経路・送信後拒否をfail closedにする契約テスト、明示確認とGitHub `staging` Environmentを要求する手動workflowを追加する。PR CIではBrowser Runを起動しない。
- 安全境界: live実証が全経路で合格し、後続ADRがAcceptedになるまで、製品WorkerへBrowser Run bindingを追加せず、`capture.browserRun.egressVerified.enabled=false`と`BROWSER_EGRESS_NOT_VERIFIED`を維持する。
- live実行に必要な未確認項目: 隔離fixture／受信sink、GitHub `staging` Environment、専用Cloudflare tokenとfixture secret。production、実顧客データ、deploy、migration、課金、外部公開は対象外。
- 次の1マイルストーン: repo-side契約をPRでレビュー・CI完了後、上記の隔離環境を用意して`RUN_ISOLATED_STAGING_P0`の手動実証を行う。1経路でも不明または拘束不能ならfail closedを維持する。
- PR #87 code-validation head `291cd0389303b89170305b6e410c456a9f44bb0d`ではBrowser Run Egress Proof、対象Unit／security 23件、DB、Phase 1／2 Playwrightを含む全必須CIが成功。既知P1×4／P2×10を恒久修正し、同headへのCodex Reviewで追加P0／P1／P2なし、未解決review thread 0件、PR Latest Review Gate成功を確認した。
- Codex対応では、remote session cleanupの独立実行と全hang境界、Cloudflare v4 envelope、probe相関、0 byte矛盾拒否、run／SHA固定artifact、CDP／fixture URL・未知channelのログ非露出をコード・仕様・回帰テストへ反映した。
- 本引き継ぎ更新commit後の最終head SHAと最終Review GateはPR #87のライブ状態を正とする。live実証は隔離fixture／GitHub `staging` Environment／専用Secrets未構成のため未実行であり、OQ-006と製品fail closedを維持する。

## 毎日0時の独立セッション

毎日0時に前日の会話文脈を継続しない実行を開始する場合は、`docs/09-delivery/daily-session-prompt.md` を使用する。

推奨設定は次のとおり。

- タイムゾーン: Asia/Tokyo
- 実行時刻: 毎日00:00
- 実行方式: ChatGPTのStandalone scheduled task
- コンテキスト: 各runを保存済みプロンプトから開始し、既存チャットの会話文脈を継続しない
- 情報源: GitHub連携を使用し、Issue #70とリポジトリを読み直す
- 既定権限: 読み取りと現在地整理を基本とする
- 許可する書き込み: 明示した場合のみIssue #70の更新
- 禁止: 自動merge、production反映、DB migration適用、課金変更、AI API有効化、共有リンク公開

ChatGPTでは、Standalone scheduled taskと、既存チャットへ戻るscheduled taskを使い分けられる。このプロジェクトでは会話上限とコンテキスト汚染を避けるため、既存チャット内ではなくStandaloneとして登録する。

ローカルcheckoutだけに存在してGitHubへpushされていない変更は、クラウド側の独立runから確認できない。セッションをまたいで必要な変更は、安全なbranchへcommit・pushしてから引き継ぐ。

## 日付で区切る際の注意

「毎日必ず新セッション」は分かりやすい運用だが、日付よりマイルストーンを優先する。

- 小さな作業: その日のセッションで完了、検証、記録まで行う。
- 大きな作業: 日付が変わる前に安全な中間commitと引き継ぎ記録を作る。
- 障害対応中: 未検証の修正を完成扱いにせず、再現条件、仮説、試したこと、次の検証を残す。

これにより、会話上限や端末停止が発生しても、次のセッションがGitHubから再開できる。


## Cloudflare Access / D1移行引き継ぎ（2026-08-30）

- Owner決定: 認証はCloudflare AccessのメールOTP・招待制、業務DBはD1、アプリ/APIはWorkers、ファイルはprivate R2へ統一する。
- 正本: ADR-0028、DEC-064、Issue #176、`cloudflare-migration-roadmap.md`。DEC-063のpreview Access保護は継続する。
- 旧Supabase Auth/Postgres/RLS実装、migration、RPC、テストは移行前baselineとして保持する。新規機能の土台、staging合格、production候補として拡張しない。
- PR #175でCloudflare Access保護とproduction自動promote停止をmainへ取り込み済み。Issue #92はcompleted closeされ、#92由来のblanket main merge holdは解除済みである。Access保護、non-production branch build停止、version upload-onlyは継続する。
- 現行live RLS gate workflow `.github/workflows/phase1-rls-live.yml` とrunbook `docs/08-operations/phase1-rls-live-gate.md` の `Status: Accepted` はpre-M5で維持する。現行gateはIssue #215の文書・checker整合PRとは別にownerが明示承認した場合だけ登録済みの既存staging/test入力で実行できる。ただし新規test user、資格情報、環境は追加せず、Issue #215のPRではworkflow dispatchとlive証跡生成、新規project、Environment、Secretの作成・登録を行わず、実行はowner承認済み既存staging/test契約に限定する。future M5 replacement PRでは、Issue #176 M5 replacement gateと対応docsがmainへ着地する同一commit/rollback unit内で、(1) replacement gateと対応docsの着地、(2) 旧 `.github/workflows/phase1-rls-live.yml` の削除、(3) runbookの `Status: Superseded` 化、(4) source-of-truth checkerとworkflow checkerのcanonical存在必須からcanonical/renamed旧identity再追加拒否への反転、(5) workflow本体、`scripts/check-workflows.mjs`、`scripts/check-cloudflare-source-of-truth.mjs`、`tests/cloudflare-access-fetch.test.mjs` の同一PR scope化を同時に完了する。着地後の別変更、M6への持越し、replacement未着地のまま先行退役を禁止する。
- 実immutable previewのstaging-only D1/R2・production backend非到達証明はIssue #176 M5の独立migration gateへ移管する。完了まではstaging合格、production資源作成・deploy、外部招待を禁止する。
- Issue #95のSupabase staging内部alphaはIssue #176 M5のAccess/D1/R2 staging実証へ置換し、旧経路を実行しない。
- production Access application、production D1、migration、deploy、実ユーザー招待、実データ移行は未実施。
- ローカルPC依存の作業は行わず、GitHub上のbranch/PR/CIを正本の実状態として照合する。

次の1マイルストーンはIssue #176 M0の文書PRを品質ゲートまで完了し、その後M1 Access identity spikeを別Issue・別PRで開始することである。

## Cloudflare Access / D1移行 M1 引き継ぎ（2026-09-05）

- M0: PR #180はmainへmerge済み。実main merge SHAは`d19ab714cfc09710eeb3dc624a0b7f0438bebfc5`。M1 branchはこのSHAを起点にする。
- M1実装: `apps/worker/src/access-identity.ts` に、jose v6.2.12によるRS256／issuer／audience／期限／iat／存在するnbfの検証、`access_user | service_token` actor分離、machine health allowlist、検証済みissuer+subjectのapplication identity DIを追加した。
- 設定: `ACCESS_ISSUER`、`ACCESS_AUDIENCE`、`ACCESS_JWKS_URL`は`server-config.ts`を唯一の読込窓口とし、env値の前後空白は除去する。issuer／JWKS URLのcredential・query・fragment・HTTPを拒否し、末尾slash等のURL正規化は行わない。署名済みJWTのissuer／subjectは原文字列で扱う。
- 検証: `tests/access-identity.test.mjs` はローカルRSA署名JWT／mock JWKS HTTPで正常系・negative・identity状態・service lookup 0回・秘密値非露出を確認する。`npm run worker:typecheck`と`npm run test:access-identity`は成功。
- 範囲外: 実HTTP request path／UI切替、D1 schema／migration、OTP／招待、production Access変更、旧Supabase経路の変更は行わない。
- 次の1マイルストーン: M2でD1 schema／migrationとworkspace固定repositoryを実装し、identity状態・membership・競合・途中失敗のnegative testを追加する。

## Cloudflare Access / D1移行 M2 実装（未staging）（2026-09-05）

- D1 migration／identity・workspace・member repositoryを実装中。manual coreはM4、Stripe/Discord callback本体はC1へ分離し、M2のexact POSTは503・副作用0、path別Access BypassはOFFとする。
- ローカルNode24 SQL suite、repository negative、Worker phase1/phase2 callback停止境界を確認済み。local SQL suiteはHosted Cloudflare D1 bindingやstaging資源の証明ではない。
- PR #221のmain統合後SHAは`46e7a406f2f61c72a0db509e94d4de941e88052d`。read-only Cloudflare診断run `33963225925` では対象Worker設定取得に成功したが、許可bindingはDiscord KVのみでD1 bindingなし、D1一覧401、R2一覧403、Access取得ページ0件、secret一覧はnetwork failure。資格値は記録しない。
- 2026-09-05のCloudflareブラウザ確認では対象プロジェクト用D1は未作成、staging用R2 4 bucketは存在し全て空だった。capture-assets bucketのpublic access無効を確認した。他bucketのprivate設定・binding分離はまだ個別検証していない。
- M2の実staging D1 binding、dynamic negative、backup/export/restore、production分離証跡は未実施。M3 HTTP接続と、これらのM2実staging証跡が残っている。
- 次の1マイルストーン（本節を最新の引き継ぎ正本とする）: M2実staging binding／migration・backup/restore証跡を別途完了判定し、その後M3 HTTP/UI接続へ進む。callbackのC1復帰条件は緩和しない。

## Product pivot／PR #240 review引き継ぎ（2026-09-13）

この節を現行Product開発の最新引き継ぎとする。上記M2／M3、invite-only production Access、Browser Run中心の「次のマイルストーン」は履歴であり、現行MVPの優先順位には使用しない。

- Product flow: `guest -> Chrome Extension MV3 -> PC／smartphone／tablet responsive capture -> local draft -> output gate -> signup/login -> self-service bootstrap -> Personal Workspace -> guest claim -> save/share/PDF`。
- Browser Run／Browser Session／Live ViewはLegacy／Historicalであり、現行MVP runtimeへfallbackしない。
- production商用MVPの一般利用者はOne-time PINでself-service本人確認まで到達可能とする。ただしAccess到達はbusiness authorizationではなく、unknown human actorはbootstrap以外のbusiness APIを403にする。
- Review lineage: sourceはPR #240、review対象HEADは`d9aa67b5fb2e994259608d831a02e8144c96d3f8`。本作業は同HEADへの最新Reviewで指摘されたPersonal Workspace識別、authenticated staged asset upload、Accepted API index、このsession handoffのP1／P2解消である。
- Review対応状況: Personal Workspace D1 discriminator／uniquenessはmigration・repository・local testへ反映済み、authenticated staged asset uploadはAccepted contract化済み、onboarding APIはAccepted indexへ登録済み。残作業はPRの最新HEADに対するreview／CI／merge確認である。
- 次の1マイルストーン: Product source-of-truth PRをmergeした後、PR #234 `Chrome Extension MVP implementation`を新mainへ追従させ、Product／security contractとの差分レビューを行う。PR #240とProduct正本のmerge前にPR #234を変更しない。

## C cloud save 統合 checkpoint (2026-09-23T01:20:28+09:00)

- 対象: Issue #255、PR #256、branch `codex/c-backend-completion`。owner限定stagingのC slice（guest claim、R2 staged asset、`/manuals` UI、draft編集）だけを扱う。D／E／F、production反映は対象外。remote migration／deployはC全体の承認済み親実行範囲だが、この担当では実施しない。
- 実装: PR #256へfrontendとbackendを統合し、`/manuals`はAccess user・active identity・active personal workspace・active owner membershipを必須化した。claim intent、asset status、finalizeの取得・再送経路も同じactive owner境界を再検証する。
- 契約同期: `docs/09-delivery/cloud-save-c-slice.md`、guest claim API、traceability、checkerを現行C契約へ同期する。PNG／JPEG／WebP、D1 claim/asset記録照合、`claimIntentId + operationId + asset slot`、CAS編集、結果不明時の照合を正本とする。旧B／M4の全面未実装記述はC範囲だけ失効させる。
- 検証: cloud manual C API 19件、extension claim unit 5件、Chromium UI／runtime／onboarding browser、worker runtime 71件、runtime mutation 3件、typecheck、encoding、source-of-truth、D1 boundary、diff checkを実行済み。Windowsのbrand checkerと`wrangler.cmd` EINVALはLinux CIで再確認する。
- 配布引継ぎ: manifest `0.1.2`のZIP展開・unpacked load・「操作を記録」から「保存した手順書を開く」までの利用者手順と、一覧・全手順編集・「変更を保存」の確認手順をC sliceへ追加した。Chromeの拡張機能管理画面は利用者本人が操作する範囲であり、実Chrome導入から実staging保存までの通し確認は未実施。isolated Chromium／実MV3 runtime回帰は別証跡である。
- 状態: staging実環境のmigration／deploy／最終SHA／完了判定は未確認・未実施。親によるwrangler dry-runはbinding反映なしで確認済み。最新の実状態はIssue #70とPR #256のlive stateを正本とする。
- 次の候補: Cの実staging適用と最終SHAの確認後に、親PMがDの着手を明示する。C完了後にDへ自動着手しない。D／E／Fはこのcheckpoint時点では未着手である。

### 2026-09-27 Issue #264: editor image workspace

- 対象branchは `codex/editor-image-workspace`、baseは `b125a0e5014ff7eed1a584c1b8a7de95763544ea`。ローカル統合検証時点では未commit・未pushでPR未作成だった。この時点の作業状態を成果物の最終状態とは扱わず、CI・最新Codex Review・remote保存状態はIssue #70とPRの記録で確定する。
- 全手順article、sticky目次・scrollspy、native画像編集dialog、local注釈と既存maskの共有asset焼き込み境界はADR-0036／DEC-081へ反映済み。
- ローカル統合検証はextension 114/114（`final-extension-test.log`）、annotation/cloud 17/17、MV3 runtime 4/4（`final-cloud-runtime.log`）、editor browser 11/11（`final-editor-browser.log`）、encoding 334、sensitive 369、docs 132をPASSした。目次17番のJPEG、1366x768、文字サイズ入力でEnterしてもdialogが閉じないことを実Chrome合成で確認した。強化browserはUTF-8で復旧し、後半の既存8テストはGit HEADと完全一致することを確認した。保存中の入力抑止、Escape維持、元putによる保存、reload後の文字とfont32保持を第2テスト追記後のfocused 1/1で確認した。
- Issue #265の全画面日本語リライトは次のマイルストーンであり、まだ実装していない。
- remote本人受入、CI・最新Codex Review・remote保存状態の最終確認は未確認であり、Issue #70とPRの記録で確定する。

## Issue #267 記録中入力のフォーカス回帰（2026-09-30）

- 対象: Issue #267。作業branchは `codex/recording-input-focus`、確認時刻は `2026-09-30T16:12:58+09:00`（Asia/Tokyo）。ローカルHEADは `7503f8b58451a33f56726fe157f478c564a8fb51` のままで、今回の修正は未commit・未push。PRは親担当が作成・更新する。
- 原因根拠: 実Chromeで、編集中のinputへ `visibility:hidden` を適用してpaint後に待つとfocusが外れてblur/changeが発生し、後続入力が同じ欄へ入らなかった。opacityだけのmaskではfocus、値、caret、selectionを保持した。
- 実装境界: screenshot maskはvisibility/displayを変更せずopacityだけを適用し、closed shadow内はnested open shadow、top-layerのplain text、動的追加を含めて走査・検証する。closed shadowを検査できない場合はfail closed。復元時はmaskが変更したinline styleだけを戻す。入力値は保存・ログ出力しない。
- 検証: `npm run extension:test` は114/114 PASS。実Chromeの `tests/extension-mask-browser.test.mjs` は4/4 PASS（同一dialogのmask前後・復元pixel、closed shadow、focus/selection、CDP IME確定前後）。実Chromeの `tests/extension-sidepanel-browser.test.mjs` は3/3 PASS（native MV3、画像1→2保存待ち、a→b連続入力、ab、focus維持、blur/change/submit/Enterなし、step数2）。合成fixtureと固定値のみを使い、実ユーザー内容・動画内容は記録していない。
- 検証境界と残作業: 親の `npm ci` は成功。親が確認した `npm run check` のWindows改行差分と既存audit警告は今回の変更原因ではない。stage、commit、push、PR反映、Issue #70同期、最新SHAのCI/Codex Review確認は親のrelease gateで実施する。

## [Issue #265](https://github.com/hozuo0906/meccha-manual/issues/265) / [PR #269](https://github.com/hozuo0906/meccha-manual/pull/269) 全画面日本語UI改善 checkpoint（2026-09-30T17:07:48+09:00）

- 対象: Issue #265、PR #269 draft、branch `codex/ui-japanese-rewrite`。確認時のHEADは `3d2e2693120cacaad6cae5d562a1b61a33c45509`、`origin/codex/ui-japanese-rewrite` も同一SHAであることを実取得した。機能CIは成功しているが、Codex Review・品質ゲート・merge・配布は未完了で、親PMが最終release gateを確認中である。
- 実装範囲の結論: 全画面の表示文言を自然な日本語へ揃え、端末・ワークスペース・共有の意味を混同しない表現へ整理した。利用者が作成する手順本文などのユーザー文章は対象外とし、画像の映り込みに関する注意、縦編集の導線、画像編集の既存操作を維持した。関連する要件・UX・品質文書とUIテストの期待値も同じPR範囲で同期している。
- 検証: `3d2e269` では担当実行のeditor 11/11通過を担当報告として記録する。親が取得した最新CIはDocs CI run `36687031639`（job `109795148531`、npm ci／diff／project checks成功）とExtensionPrivacy run `36687031537`（job `109795147163`、mask／editor／sidebar／verify-recorded-workflow成功）である。ReviewGateは未レビューのため失敗扱いであり、CI成功だけで完了とはしない。親の実Chrome受入では9画面をrefreshして横はみ出しなしを確認した。
- 記録境界: 秘密値・個人情報・実ユーザー文章や画像は記録していない。stage／productionへの反映、配布、merge、PR／Issueへの追記は親PMのrelease gate範囲であり、このcheckpointでは実行しない。

次の1マイルストーンは、PR #269の最終SHAから作成する限定配布版の受入確認である。ReviewGate、PR状態、配布結果を実取得できるまで、今回の日本語UI改善を完了扱いにしない。

## Office容量・privacy handoff checkpoint（2026-10-03T14:11:35+09:00）

- 現行製品sourceの正本は `88e9c2f37f7a47a1ebd5785c2abc05573a8a1494`（branch `codex/manual-explicit-privacy-office-019`）。220dd84で実装したOffice画像64 MiB累積・archive 80 MiB・ZIP32範囲検査、local/cloudの容量拒否・再試行、Heading1のOOXML配置、入力caption同期を88e9c2fで実caller回帰とAPP_ASSET_VERSION同期まで確認した。このcheckpointの変更はhandoff文書だけで、pushは親PMの保存工程で行う。
- 88e9c2fに対する確認結果は、capture actor unit 12/12、local/cloud browser 2/2、worker runtime 71/71、対象ゲート合計85/85、skip 0。P0/P1は確認されていない。旧d34のCI/fullcheck証跡は現行SHAへ流用しない。220で発生したAPP_ASSET_VERSION不一致は88で解消済みである。
- P2候補として、`bytes:string` のdecode後に容量検査するための一時メモリ増加と、XML生成前のarchive guardがある。いずれも現行の実callerおよびAPIの `Uint8Array` 契約外であり、今回の修正対象には含めない。utilityを直接呼ぶ場合の一時メモリ増加を影響として親PMが管理し、2026-10-08までにboundedな契約整理を行う。
- 検証境界は、実OfficeのWord／PowerPoint描画、remote SSO、実Chromeでの追加操作を未確認とする。local/cloudの分離ブラウザ検証を実施し、実Chromeの追加操作は禁止した。Windowsではesbuildの昇格済みdirect Node検査とwranglerのdirect CLI bundleを成功として確認したが、通常の `wrangler.cmd` 経路は `spawnSync ... EINVAL` のため未確認として区別する。
- Google project／IAB構成は作成済みだがOAuth clientは未作成で、課金accountもない。auth文書は別branchのremote SHA `87457fe` に保存済みである。

次の1マイルストーンは、この最新SHAに対するCI・Codex Review・remote／PR headの実取得と、限定0.1.9 ZIPのchecksum／内容確認である。完了までは配布・native Office描画・remote SSOを完了扱いにしない。

## Office PresentationML slide ID P1 correction checkpoint（2026-10-03T14:24:19+09:00）

- dcc90acの未配布候補に対するCodex Reviewで、`ppt/presentation.xml` の最初の `p:sldId` が255になるP1を確認した。MicrosoftのPresentationML例およびST_SlideIdの `minInclusive=256` に照合し、first255はOffice互換境界を満たさないため妥当な指摘と判定した。dcc90ac由来のZIPは配布せず、履歴として保持する。
- boundedな修正では、slide IDを `256 + index` とし、200手順で256〜455の単調増加・一意ID、presentation relationshipのrId／slide順、master/layout ID（2147483648／2147483649）、slide内shape IDと画像relationshipを回帰確認した。生成editor bundleと `APP_ASSET_VERSION` も同じ変更で同期する。
- この単位では追加のOffice native描画・remote SSO・限定ZIP配布は未確認である。次の1マイルストーンは修正後最新SHAへのCI・Codex Review・remote／PR headの実取得と、限定0.1.9 ZIPのchecksum／内容確認である。

## Shared image editor lifecycle P2 correction checkpoint（2026-10-03T14:39:47+09:00）

- 6d59ca8の未配布候補に対するCodex Reviewで、`createImageEditor` が同一dialog再利用時にも置換範囲ボタンとkeyboard helpを追加し続けるP2を確認した。disposeでlistenerは停止しても動的nodeが残り、再open時に重複操作と同一IDの説明が発生し得るため、通常UI到達の不具合として修正した。6d59ca8由来のZIPは配布対象にせず履歴保持する。
- 修正では既存の置換操作・説明nodeをquery再利用し、`aria-describedby` をそのhelp IDへ再設定する。localの同一dialogを3回開閉してbutton/help各1、ID参照、一回のlistener作用を確認し、cloudはclose後にfresh dialogを生成する現行経路を3回以上実browserで確認した。cloudの通常経路にnode累積があるとは判定していない。
- shared bundleを再生成し、`APP_ASSET_VERSION` を同期した。次の1マイルストーンは修正後最新SHAへのCI・Codex Review・remote／PR headの実取得と、限定0.1.9 ZIPのchecksum／内容確認である。


## Issue #283 製品ログイン・Office出力の現在地（2026-10-03T21:44:09+09:00）

- 対象branchは `codex/manual-product-auth-283`、認証sourceを含む `253e108900d354944f385bc12fffe944ce4d1107` のstaging接続準備docs commitは親がpush済みである。Google／ChatGPTの製品ログインsource、session、start/callback、D1 migration `0008` は実装済みで、親が11件の認証unitと2件のbrowser回帰を確認した。これは合成fixture／local Workerを含む証跡であり、実provider SSO成功、remote migration適用、secret binding、Access外周の実設定を示さない。
- Office側は、最新commit `b087abf` の編集済み画像回帰を統合済みである。親取得の実行ID `session55529` では、`tests/office-auth-runtime-browser.test.mjs` の生成editor経路をGoogle／ChatGPT × DOCX／PPTXで2/2、skip 0、exit 0として確認した。合成provider、実ブラウザ、local Worker、SQLite D1 adapter、memory R2を通り、編集中の下書きから同じ形式のdownloadまで到達した。これは実provider SSO、remote D1／R2、staging deployの証跡ではない。
- 未完了の外部境界は、実Google／ChatGPT SSO、staging remote D1 migration、Google secret binding、Access product入口／health分離の実設定である。SIWCは申請の氏名・会社名回答待ちで、商用clientは未発行のため有効化しない。これらの未確認事項をlocal testやfixture passで代替しない。
- 統合Draft PR [#284](https://github.com/hozuo0906/meccha-manual/pull/284) のremote checkpointは `fdd9e2f3d9c6c4f91fe9633149e008f7903885e5` である。旧実生成試験の復帰待ちtimeoutは、実際のcallback navigationを使うharness修正で解消し、open editorを閉じずclaim前にdownload listenerを設定する経路で再検証した。今回の成功は合成provider／local Worker／SQLite D1／memory R2に限定し、実Google／ChatGPT SSO、remote migration、secret binding、Access外周の成功とは扱わない。
- Office最新は `b087abf`（remote／PR #282一致）で、通常CI 13件成功、`78f`へのCodex comment `5968825999` はmajorなしを確認済みである。`b087`に対する最新Reviewは未確認で、未解決threadは1件残っている。製品ログイン側は親が `270` で認証unit 124件・browser 2件を再取得した。
- staging origin rootをIABで1回直接開くとCloudflare Dashboardのサインイン画面へ遷移した。これは確認tabを閉じ、設定変更・ログイン操作をしていない。Access、DNS、未設定domainのいずれが原因かは未確認であり、Accessが原因とは断定しない。challenge URLや連絡先、秘密値は記録しない。
- 次の1 milestoneは、対象SHAを固定して `wrangler.onboarding.jsonc --env staging` のversion、0006/0007/0008、secret名、Access外周をread-only照合する staging 接続案である。実stagingへのdeploy、migration apply、secret取得、Access変更、実provider SSOは別承認境界として実行しない。

## 製品ログイン・Office再試行の親検証（2026-10-03T23:36:46+09:00）

- PR #284、branch `codex/manual-auth-office-integration-283`、source SHA `7342c6512dd3c6282451be89ca679b7752955eda`。PR head一致と通常CI13件成功を取得。latest-review gate失敗、最新Codex Reviewとthread3件の解決は未完了。
- 親実行 `session41501`：Office/auth browser 2/2、skip0、exit0。実editor操作からGoogle／ChatGPT × DOCX／PPTX、キャンセルHTML戻りリンク、実bootstrapボタンから再ログイン、同形式download、return marker消費を確認。合成provider、公式CFT、local Worker、SQLite D1、memory R2の証跡。実SSO・remote設定・native Office描画は未確認。
- e82dの手動gotoによる旧成功報告は実UI証跡として不採用。7342は復元後hashの再ログイン保持と実ボタン経路を修正。credential選択、Google issuer正規化、失敗時の検証済み戻り先は9b6cd1eで修正済み。
- PR #282 source573b921は通常CI13件成功、最新Codex Review majorなし、未解決thread0を親確認済み。merge・配布・production反映は未実施。
- 次は最新headのCI／Codex Reviewとthread解決。その後staging接続案を確定する。Cloudflare運営管理ログインとSIWC申請氏名・会社名・公開URLの回答待ち。SIWC client未発行、Google資格情報は暗号化保管済み。remote secret／migration／外周未確認。文書記録を継続稼働とは扱わない。
## 認証状態遷移とstaging接続の親確認（2026-10-04T00:18:00+09:00）

- PR #284 source/head `6e3ad574c599fbacd82e5120725815d96a343d29` を親が照合。期限切れproduct cookieから明示password成功時に競合sessionを失効・cookie削除、logout JSON成功応答、session.authModeによるproduct／Access分離を修正。初担当の実行は親がinterruptし、差分保持後に回収担当へ引継いだ。
- 親の最新source認証／Access単体は142/142・skip0。公式CFT実行 `session11521` は実editor Office/auth2件とprovider／logout／期限切れbrowser4件の合計6/6・skip0・exit0。合成provider、local Worker、SQLite D1、memory R2の検証で、実SSOやnative Office描画ではない。担当worker71/71等の証跡も回収。最新文書headのCI／Codex Reviewと新3thread解決は待ち。旧3threadは074c789最新レビュー・CI・回帰根拠返信後に解決確認済み。
- 運営IABログインを確認し、staging Workerのlive version cc830546 100%、DB/R2とrate limiter1001/1002一致をread-only取得。runtime変数はAccess3項目とAPP_BASE_URL／APP_ENVの5項目で、Google／SIWC未接続。Accessはowner hostname（path空欄）とWorker全URLスコープ、/s/*別viewer bypass。D1の移行名SELECTは0001〜0005のみで0006/7/8未適用。秘密値取得、遠隔設定変更、migration、deployは実施していない。CLI未認証とIAB取得を区別する。
- 次の1マイルストーンは最新品質ゲート。その後staging専用のDB移行・Google接続・製品入口と運営health保護分離を具体案として提示。SIWCは申請氏名／会社名／公開URL回答待ち、商用client未発行のため無効。AI OFF。production・課金・一般公開未実施、監視未登録。
## OAuth privacy・ストレージ失敗の親回帰（2026-10-04T00:41:13+09:00）

- source `a259a0d0bfd4471e171cde2104b3f4d0e3b3ca11` はlocal／PR #284 head一致、cleanを親確認。callback成功とJSON／HTMLエラーにno-referrer、D1例外と保存失敗をretryable503、consume CAS競合を409として維持。DEC-096と契約／traceabilityを同期。
- 親単体145/145・skip0、公式CFT実行session46819はOffice/auth2＋provider／logout／期限切れ4の計6/6・skip0・exit0。callbackの成功復帰・エラーリンク復帰でReferer無しを確認。合成provider／local Worker／SQLite D1／memory R2であり、実SSO・remote変更・native Office描画ではない。
- 前head211f4f3はDocs111231185336のnpm ci/fullcheck、Privacy111231185305の実browser成功ログ取得。正式botレビュー5401430990の新P2二件をa259a0dで修正。旧transition3threadは解決確認済み、新2threadは最終文書headのCI／Codex Review照合後に解決する。
- 次の1マイルストーンは最終品質ゲート、次にstaging接続の具体案。SIWC申請氏名／会社名／公開URL回答待ち、商用client未発行。Google資格情報は暗号化保管済み・remote未接続。DB0006〜8未適用、Access全URLの旧保護はread-only確認済み。remote変更・merge・production・課金・一般公開未実施、監視未登録。

## 製品認証D1正本同期（2026-10-04T01:15:52+09:00）

- 対象はIssue #283／PR #284、branch `codex/manual-auth-office-integration-283`、検証基準source HEAD `d5ad2e54c559786fa9c29ee983b651da17078feb`。今回の変更は`docs/04-data/d1-and-storage.md`、`docs/04-data/d1-workspace-schema.md`、`docs/09-delivery/open-questions.md`、本引き継ぎの正本同期だけで、Worker、types、migration `0008`は変更していない。
- `auth_sessions`／`oauth_transactions`の列、CHECK、unique／lookup index、identity immutable trigger、hash・期限・失効・consume CAS、Google／SIWCのissuer+subject mapping、`product_user` repository actor入力、`authMode: "product" | "access"`、Access human／service actorとworkspace固定query境界を、Accepted ADR-0041および実sourceへ同期した。remote D1の0006／0007／0008適用済みとは扱わない。
- OQ-033〜036はADR-0041 Accepted後の状態へ更新した。メールprovider／remote Google binding・稼働、SIWC商用client・資格、本人による明示identity linkと旧Access identity移行・復旧は未決・未確認のまま保持する。SIWCの申請回答待ちと商用client未発行も継続する。
- 初期確認はsource HEAD、関連migration/source/types、ADR-0041、decision-log、要件、既存D1文書、OQを照合し、ソース不変を確認する。docs差分、D1 schema記載、`git diff --check`、関連文書／migration検査をこの作業単位で実行し、PR最新headのCI／Codex Reviewは親のrelease gateで再取得する。
- 2026-10-04T01:15:52+09:00（Asia/Tokyo）に`docs:check`（143 files）、`migrations:check`（11 SQL）、`migration:safety:check`（11 SQL）、`app:auth:unit`（133/133、skip 0）、`encoding:check`（377 files）、`git diff --check`を実行し、すべてexit 0を確認した。親が同source基準で行った`wrangler.onboarding.jsonc --env staging` deploy dry-runもexit 0で、remote変更なし。今回source差分は0件である。
- 追加P2修正（PR #284 Codex Review 5401643521、thread `PRRT_kwDOTpNknc6opXYj`）では、state／provider／verifier binding／期限の確認後にtransaction消費CASを先に確定し、nonce bindingとprovider tokenの署名・audience・issuer・nonce検証を消費後に行う順序を2つのD1正本へ明記した。後続検証に失敗してもtransactionは消費済みのため、ログインを最初からやり直す。OQ-036は`authMode`を「productまたはaccess」と記載してMarkdown表のセル境界を維持した。

次の1マイルストーンは、今回の文書同期を含む最新headへCI／Codex Reviewとreview thread解決を照合し、その後にstaging接続の具体案（remote migration、Google binding、製品入口と運営health保護分離）を確定することである。remote migration、secret取得・変更、Access設定、実provider SSO、production反映は未実施である。

## PR #284 Codex Review 5401676113 P2修正（2026-10-04T01:44:31+09:00）

- 対象はIssue #283／PR #284、branch `codex/manual-auth-office-integration-283`。limiterは明示的な`success: false`だけを`429 AUTH_RATE_LIMITED`へ写像し、binding欠落・呼出し例外・不明／不正結果は`503 AUTH_RATE_LIMIT_UNAVAILABLE`としてOAuth transaction作成前に停止する。nonce不一致を含むconsume後callback errorは、再検証した固定`return_path`だけを引き継ぎ、改変された外部pathは利用しない。
- `app:auth:unit`は136/136、`docs:check`は143 files、`worker:check`、worker typecheck、`encoding:check`は377 files、`git diff --check`をexit 0で確認した。追加回帰はlimiterの拒否／例外／malformed、nonce mismatch後のconsume済み、外部return pathのHTML不出力を含む。Office export test／workflowは変更していない。
- この時点の差分はlocal未commitであり、commit・push・PR head／CI／Codex Reviewの再取得は未確認。実provider SSO、remote migration、secret binding、production反映は未実施である。

## Office/authブラウザCI逐次実行ゲート（2026-10-04T01:50:28+09:00）

- 対象はIssue #283／PR #284、branch `codex/manual-auth-office-integration-283`。source基準HEADは`dce841475ee49a9b02d6a99388bf9a7c1cf5d8a6`で、今回の変更は`.github/workflows/extension-privacy.yml`、本引き継ぎ、`docs/09-delivery/decision-log.md`の現行決定DEC-097日本語同期だけである。Worker、source、tests、migrationは変更していない。
- Extension PrivacyのOffice stepで、`extension-office-export-browser.test.mjs`、`cloud-office-export-browser.test.mjs`、`extension-cloud-save-runtime-browser.test.mjs`、`office-auth-runtime-browser.test.mjs`をNodeの`--test-concurrency=1`で逐次実行する。既存の4ファイル、6分timeout、TERM／kill-after、`continue-on-error`と最終結果集約、期待値・skip条件は維持する。
- 並列実行による公式Chrome for Testingのbrowser CPU競合を避ける根拠として、独立担当`office_large_export_ci_diagnosis`の診断報告では対象単体が21.418秒、4ファイル合成は初回65.234秒・2回目20.601秒で、いずれも全5件passだった。CI job `111243391617`はdownload待ち30秒timeoutのstatus生成中であり、これだけでは恒常hangとは判定しない。timeout延長や期待値・skip緩和は行わない。
- 親の公式CFT実行`session18991`は、実Word／PowerPointの20画像case 1/1、skip 0、exit 0、test 21.715秒（全体22.213秒）の取得報告である。実provider SSO、remote migration／secret binding、native Office描画の完了証跡とは分離する。
- source基準`dce841475ee49a9b02d6a99388bf9a7c1cf5d8a6`に対する親の公式CFT実行`session90974`は、認証単体148/148、browser 6/6、skip 0、exit 0、browser 70.767秒で、Google／ChatGPTから同形式Office出力、cancel後の実bootstrap retry、logout、expired 401を確認した取得報告である。これは合成provider／local Worker等の検証であり、実provider SSO・remote変更・native Officeアプリ描画とは分離する。
- この作業単位で`check-workflows.mjs`（29 files）、`check-docs.mjs`（143 files）、`check-encoding.mjs`（377 files）、`git diff --check`を実行し、workflow／文書／encoding／差分検査はすべてexit 0を確認した。未追跡の`.artifacts/unified-editor/`は既存の検証生成物として変更・削除・commit対象にしない。
- PRゲートの`npm ci`は`node_modules/.package-lock.json`のunlinkでWindows `EPERM`となり未完了で、ロック解除のための停止・削除・強制操作は行っていない。既存依存で実行した`npm run check`はdocs／brand／worker検査を通過した後、worktree sandboxのesbuildが`../../../..`を読めず`editor-tools:check`で停止したため、全check成功とは扱わない。認証unitは`app:auth:unit` 136/136、skip 0、exit 0を確認した。

次の1マイルストーンは、この修正を含むcommitをpushし、remote／PR head SHA一致、同SHAのCI、Codex Review、未解決review threadを親がrelease gateで再取得することである。CI成功だけで完成扱いにせず、実provider SSO、remote変更、production反映は未実施のまま維持する。

## Issue #283 / PR #284 auth P2修正チェックポイント（2026-10-04T02:29:10+09:00）

- 対象branchは `codex/manual-auth-office-integration-283`、開始時source HEADは `494af4cbaa42d5d9c81cc1f559734a577f43749b`。product OAuthのlegacy cookie境界とtransaction cookie並行分離を、Worker source、unit/browser回帰、API/D1/ADR/traceability/decision-logと同期し、commit `8f9e15bde02a65b9f197e82a56a6391184b18236` としてpush済みである。
- Google/ChatGPTの成功callbackは既存の `clearSessionCookies()` で `__Host-mm_access` / `__Host-mm_refresh` を消去し、失敗・cancel・不正stateではlegacy cookieを消去しない。transaction cookieはproviderとstateのSHA-256に結び付け、callback/errorは該当transactionだけを消去する。D1 schema、migration、remote Supabase logout、provider secretは変更しない。
- unit実測は app-auth/product-auth 138/138、skip 0、exit 0で、未知・不正stateとlegacy cookie付き失敗時の保持を含む。CFT Chromium browser実測はローカルsession `86926`、5/5、skip 0、exit 0（約22.1秒）。browserではGoogle/ChatGPTの同一provider二tab、成功順 `[0,1]`／`[1,0]`、cancel順 `[0,1]`／`[1,0]`、legacy cookie付き成功、product logout後reloadを確認した。実ユーザーのcredentialやsecretは使用していない。
- 次の1マイルストーンは、実行時に取得した最新PR head・local・origin一致SHAに対するCI、Codex Review、review thread解決を親PMが確認することである。staging/production反映は未実施のまま維持する。

## 製品認証とOffice出力の親検証チェックポイント（2026-10-04T03:28:14+09:00）

- 対象はIssue #283／Draft PR #284、branch `codex/manual-auth-office-integration-283`。source修正は `1802c6fa2cf207b963c222246b509bac73091956` と `017a026ea110b0402df1a6cccd0df340c4eeaed0` でremote保存済み、親がlocal／PR head一致とcleanを取得した。180は自然期限切れでcookieが消えたmanual／share APIを401 SESSION_REQUIREDへ分類し、017はDB bindingがなくても製品routeをdispatchしてstorage障害へ到達させる。cookieがあるDB欠落は期限切れと断定せず503 AUTH_STORAGE_UNAVAILABLEを返す。DEC-099／DEC-100とAPI・traceability・ACを同期した。
- 親が017に対して関連unit（cloud-manual-c／share-link-backend／app-auth／product-auth／m3-http-d1）203/203、skip0、exit0を取得。Google／ChatGPT configured、Access設定なし、cookie有無、DB有無を実Worker.fetchで検証し、legacy password選択、Access有効／不正／service拒否、tenant・share negative/mutationを維持した。docs143／encoding377／git diff --checkも成功した。
- 180の親CFT実行session62025は7件中6件成功、1件は実editorのChatGPTログインボタン表示待ち15秒timeout。単独再実行session85667は1/1、skip0、exit0。同headのLinux Privacy job111260503524ではOffice5/5・provider5/5成功を親がログ確認した。初回失敗を全成功に書き換えず、ローカルタイミングの原因は未特定として残す。017の最新CI／レビューは別取得し、180の結果を最新headへ流用しない。
- 017の `wrangler.onboarding.jsonc --env staging` dry-runはexit0、830.52KiB。対象staging専用DB／R2／rate bindingsとentrypointを確認したローカルビルドであり、実deploy・remote migration・secret bindingの証跡ではない。実Google／ChatGPT SSO、remote D1／R2、native Word／PowerPoint描画は未確認。
- 運営IABログインとremote read-only照合は完了。Google資格情報は暗号化保管済み・remote未接続、SIWC interest formは2026-10-04T03:39:00+09:00（Asia/Tokyo）に受付済み表示をread-only確認した。商用client発行、実SIWC SSO、secret binding、remote migration、production反映は未確認・未実施で、有効化しない。D1の0006／0007／0008は未適用、製品hostname／Worker全URLのAccess保護も未変更。production、課金、AI API、mergeは実施していない。DB rollbackや旧version互換を未検証のまま保証しない。
- 次の1マイルストーンは、実行時に取得した最新local／origin／PR head一致SHAについて通常CI、正式Codex Review、既知指摘への根拠返信とfresh未解決thread0、latest-review品質ゲートを照合すること。その後、候補のstaging接続を具体化し、外部設定の実行承認と商用client発行・利用資格の確認条件を整理する。自動監視・無人継続は登録していない。
- SIWC申請受付状態の訂正（2026-10-04T03:39:00+09:00、Asia/Tokyo）: 親がログイン済みIABのOpenAI interest formをread-onlyで確認し、画面に `We’ve received your submission. We expect to expand access in early Q4...` と表示されることを確認した。SIWC申請が受付済みであることのUI表示だけを確認し、送信主体・送信内容・入力PIIは取得・記録していない。この確認は商用client発行、実SIWC SSO、secret binding、remote migration、production反映を意味しないため、これらは未確認・未実施のまま。フォーム操作・申請送信・重複申請は行っていない。以前の「氏名／会社名／公開URLの回答待ち」「申請必須情報を確認」はこの時点より前の状態として失効し、現在の申請受付状態へ訂正する。

## Issue #283 root login / D1 member route修正（2026-10-04T09:19:15+09:00）

- 対象はIssue #283／PR #284、branch `codex/manual-auth-office-integration-283`、source修正commit `4bb65ab12c9229f342a643ef990e239fcbd8ca30`。rootの製品ログイン後に「メールアドレス未設定」と表示され、手順書タブがメンバー権限確認で停止した原因を、sessionの`members.status`とmember API dispatchが移行状態のまま旧Supabase handlerへ進む実装、rootが旧manual入口を描画するUI不整合として確定した。logout後にpassword formへ戻る原因は、provider設定を再読込する前の共通login初期化がlegacy formを描画していたことだった。
- WorkerはD1 `GET/POST /api/workspaces/{workspaceId}/members`、`PATCH /api/workspaces/{workspaceId}/members/{userId}`へ固定repositoryを接続し、sessionの`members.status`を`ready`へ同期した。UIはproduct／Access sessionのメール欠落時に「アカウント」と表示し、手順書をcanonical `/manuals`へ案内し、product logout後はpassword formへ戻さない。guest導線、manual新規作成API、remote staging設定、秘密値、PII、実ユーザー操作の記録は変更していない。
- 合成D1／SQLiteで、workspace ownerの一覧、join codeによるviewer追加、viewerのmutation拒否、ownerのrole更新、不明workspaceの404、legacy auth routeのSupabase fallback停止を確認した。`tests/m3-http-d1.test.mjs` 13/13、`tests/app-auth.test.mjs` 115/115、`tests/worker-runtime.test.mjs` 71/71、worker typecheck exit 0。`npm exec`の依存解決はWindows npm cacheのEPERMで実行できず、直接Node実行で既存依存を使った結果を記録する。`npm ci`、`npm run check`、CI、Codex Reviewはこの修正headで親が再取得する。
- 親から共有されたstaging／IABの実Google login、D1 migration 0006–0008、Google secrets登録、Access health／preview-onlyのread-only確認、`/manuals`空一覧表示はこのsource変更のlocal検証とは分離する。実保存、Office出力、native Office描画、実ユーザーの手順操作は未確認であり、staging／productionの追加操作は行っていない。

## Cloud Office CSP画像decode修正チェックポイント（2026-10-04T10:13:47+09:00）

- 対象はIssue #283 / PR #284、branch `codex/manual-auth-office-integration-283`。Cloud manualの`renderOfficeImage`で、same-origin asset BlobをFileReaderのdata URLへ変換してから`Image.decode`する最小修正を行った。Workerの`img-src 'self' data:`は維持し、CSPを緩和していない。Office download helper、auth、asset保存、D1、staging／production設定は変更していない。
- `tests/cloud-office-export-browser.test.mjs`は実Worker CSPを全レスポンスへ適用し、合成640x360 PNGを使ってWord／PowerPoint ZIP内の画像寸法、編集済みmask pixel、画像entry数（本文だけの未保存stepに偽画像がないこと）、画像404拒否、画像予算拒否後の再試行、GET限定、secret-like URL非露出を確認する。編集途中のstepは本文を入力してから出力し、既存のsnapshot変更検知・mask焼込み境界を維持する。
- 対象テストはNode direct executableで1/1、skip 0、exit 0を確認済み。`npm ci`、全体`npm run check`、新headのCI／Codex Reviewはこの時点で未確認。native Officeアプリ描画、実provider SSO、remote D1/R2、staging／production反映は未実施。
- 親が観測したIABのWord本文「書き出しました」表示とdownload event／Downloads未確認は、CFTのdownload成功証跡と区別する。今回の修正ではdownload helperの即時revokeタイミングを変更しない。
- 次の1マイルストーンは、この修正を含む最新commitのremote／PR head SHA照合、関連CIとCodex Reviewの再取得、root認証UI担当（`app-assets.ts`／`app-auth.test.mjs`／`product-auth-browser.test.mjs`）の実SHA・検証結果の統合である。staging／productionへの反映、merge、IAB追加操作は親PMが別途判断する。

## D1 direct changes probe（2026-10-04）

- 親がstaging D1へread-only相当の実probeを行い、既存のarchived fixtureでtriggerを発火する`UPDATE manual_revisions ...`と同一batch内の`SELECT changes() AS direct_changes`を実行した。取得結果はDMLが`meta.changes=2`／`results=[]`、直後のSELECTが`meta.changes=0`／`results=[{direct_changes:1}]`で、`manual_revision_sync_draft`のtrigger副作用がD1変更件数へ加算される仕様を確認した。
- このprobeはD1の変更件数仕様確認だけであり、今回のrepository最終修正APIの保存成功、画像あり保存、Office出力、remote migration／deployの成功証跡とは扱わない。今回の修正はD1 batch内の各DML直後に同じ`SELECT changes()`を置き、直接件数を厳密照合する。
- 修正前の旧ローカル回帰43/43はSQLite `run().changes`を使っていたためこのremote専用のtrigger加算誤409を検出できなかった。今回のmockはDMLの累積変更件数を`meta.changes`へ反映し、直後SELECT結果を必須照合することで同じ欠陥を回帰対象へ含めた。

## Root ProductログインUI可視性修正（2026-10-04T10:22:45+09:00）

- 対象はIssue #283／PR #284、branch `codex/manual-auth-office-integration-283`。rootのProductログイン画面で、`.form { display: grid; }` がUAの`hidden`表示を上書きしprovider-onlyでもパスワードフォームが見える問題、単一providerでも不要な「または」が残る問題、隠したフォーム内のエラーが見えない問題を確認し、source commit `4cc027ddde4ba34ffacd134c19b317f2f95d379b`へ最小修正した。
- provider設定取得中はパスワードフォームを表示せず、provider-only時は利用可能なproviderだけを案内する。providerが1つならprovider名を単独表示し、2つの場合だけ「または」を使う。設定が空のときは読み込み中のままにせず利用不可の案内を出し、取得失敗時はProduct session未確認の場合に限り既存入力へ戻す。エラー表示は隠しフォームの外に置いた。UX、requirements traceability、decision logにも同じ状態遷移と境界を追記した。
- 実測は`tests/app-auth.test.mjs` 115/115、`tests/product-auth-browser.test.mjs` 5/5、`tests/worker-runtime.test.mjs` 71/71、Worker harness、`git diff --check`が成功。親が同一headの関連認証・Office・D1回帰207/207、skip 0、exit 0（session 15526）を取得している。実provider SSO、remote D1/R2、native Officeアプリ、staging／production反映はこの作業では確認・実施していない。
- `npm ci`はWindowsの`node_modules\\.package-lock.json` unlinkでEPERM、`npm run check`はworktree内でnpm shimを解決できず未完了。これらを成功扱いにせず、source回帰の既存Node直接実行結果と区別する。外部設定、deploy、mergeは行っていない。
- このhandoff追記を含むdocs-only commitを作成・pushした後、親PMが最終headに対するCI、Codex Review、review thread、staging反映判断を再取得する。
## Issue #283／PR #284 OAuth start origin・browser recovery P2修正（2026-10-04）

- 対象はIssue #283／Draft PR #284、branch `codex/manual-auth-office-integration-283`、source SHA `6313790a31e6bda41ef270ed9dc47954767a5ecb`（remote一致）。`beginProductAuth`はprovider、request URLと設定済み`APP_BASE_URL`の完全一致、許可return pathをrate limiterとD1 cleanup／INSERTより先に検証し、preview／workers.dev／その他aliasと不正returnを副作用なしで拒否する。runtime設定が未取得でも、既存allowlistの正規request originだけをブラウザ復帰先に使う。
- `/api/auth/{provider}/start`のHTML失敗は既存login CSS・security headersを使う日本語復帰画面へ分類し、失敗理由と「元の画面へ戻る」を示す。JSON clientのstatusとbody分類は維持し、aliasや未検証URL、secret、下位例外を返さない。追加ブラウザ回帰では一度429を表示した後、同じ保存handoffの`activeHandoffId`／`handoffId`と`outputAction`／`requestedAction`（いずれも`save`）を保持したままprovider再選択を成功させた。`tests/product-auth-browser.test.mjs`の`runProviderBrowser`は`save`固定のsynthetic handoffを使うため、Office開始失敗時の形式（`officeFormat`）や下書き保持は今回の追加テストでは未確認であり、通常のOffice回帰の証跡をこの失敗ケースへ転用しない。
- 検証: `node --experimental-transform-types --test tests/product-auth.test.mjs` 32/32、`node --experimental-transform-types --test tests/product-auth-browser.test.mjs` 8/8、invalid return／runtime missing／alias、API JSON、rate／D1失敗、cancel／retryを確認。`node --experimental-strip-types --check`による`index.ts`／`product-auth.ts`構文確認と`git diff --check`も成功。Windows `npm ci`の既知EPERM、Linux CI、正式Review、deploy／merge／review thread解決は未確認で親へ引き継ぐ。

## Issue #283／PR #284 provider route・retry最終追補（2026-10-04）

- 作業担当はP1のprovider-only＋legacy cookie経路を、既存server-config窓口のSupabase設定有無で分岐するよう修正した。Supabase未設定時は古い`__Host-mm_access`／`__Host-mm_refresh`だけでlegacy routeへ進まず、Product routeのsession必須応答を維持する。Supabase設定済みのpassword backend、Product cookie優先、mixed cookie fail-closed、Access／missing DB dispatchは変更していない。
- P2のprovider取得非2xx／空応答／通信失敗では、Product session確認済みの画面にエラーと再試行を表示する。成功時だけprovider導線へ戻り、入力値・return pathを保持する。render世代とprovider request世代を照合し、古い非同期応答による画面上書きを抑止した。Product session未確認時の既存password fallbackは維持した。
- `APP_ASSET_VERSION`をsourceと`tests/worker-runtime.test.mjs`の契約へ同期した。関連差分は`apps/worker/src/index.ts`、`apps/worker/src/app-assets.ts`、`tests/product-auth.test.mjs`、`tests/app-auth.test.mjs`、`tests/product-auth-browser.test.mjs`、本追補を含む契約・UX・trace・decision文書である。
- 最終commit／remote SHAと、source回帰、browser retry回帰、既存関連回帰、`npm ci`／`npm run check`のWindows制約は、この追補後に実取得して親PMへ報告する。CI／Codex Review／thread解決、deploy／merge、staging／production設定変更は親PMの回収対象であり未実施。

### 認証資格情報の優先順位とOAuthログイン一時データの整理（2026-10-04）

- 対象は Issue #283 / PR #284、branch `codex/manual-auth-office-integration-283`。P1 は request credential を Access 設定 fallback より先に評価し、product cookie → Access assertion → configured legacy Supabase cookie の順で route を選択する修正。Access assertion の issuer・audience・JWKS、human actor、active identity、workspace・role 認可と、product cookie の fail-closed 境界は維持する。
- P2 は既存10分の `oauth_transactions.expires_at` を正とし、provider／origin／return path／rate limit の拒否後だけ、解釈可能な期限切れ行を start 1回につき最大100件 cleanup する。DELETE と INSERT は D1 batch で atomic に扱い、storage failure は `503 AUTH_STORAGE_UNAVAILABLE`、未期限切れ consumed 行・auth_sessions・identity・workspaceは保持する。migration、cron、新 retention は追加しない。
- local source/tests: `apps/worker/src/index.ts`、`apps/worker/src/product-auth.ts`、`tests/product-auth.test.mjs`。product-auth unit 30/30、Worker typecheck exit 0。追加回帰でrate-limit拒否時の期限切れ行保持、101件の継続start、malformed expiry保持、cleanup後INSERT失敗時のrollbackをD1 adapterで確認した。既存のCI担当所有 `tests/product-auth-browser.test.mjs` は変更・stageしていない。
- UI担当の logout render race 修正は `b6ac28a38822e7247f7113b0200b0c6d5444bac6`（app-assets.ts / app-auth.test.mjs / product-auth-browser.test.mjs、app117/browser6/runtime71）を採用根拠として親が統合する。staging／production設定、deploy、mergeは未実施。
- 次のゲートはこの修正を含むcommitのremote保存後に、親が最新head SHAでCI／Codex Review／review thread解決を再取得すること。
