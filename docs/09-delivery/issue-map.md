# Issue分解

Status: Accepted

## Product最優先

既存EPIC番号とCloudflare移行マイルストーンは移行履歴・安全境界として維持する。ただし、現在のProduct最優先は次の縦切りである。

`LP -> Chrome拡張導入 -> PC/スマホ/タブレット表示選択 -> guest操作記録 -> local draft編集 -> output gate -> signup -> Personal Workspace bootstrap -> guest claim -> 保存/共有/PDF output`

Cloudflare移行の完了数、保守Issue数、CI数だけをProduct進捗としない。

### P0 Product Foundation

- ICP / Job To Be Done / Activationを正本化する。
- アカウント作成前に1本目をlocal-onlyで作れるguest modeを正本化する。
- output時だけsignupを要求する。
- Product Event契約を `docs/05-api/product-events.md` に固定する。
- Activation、TTFV、Capture Completion、Share、Second Manualを計測可能にする。

### P1 Core Value Slice

最初に次の1本を通す。

`guest -> Chrome拡張 -> 3表示モード -> local draft -> output時signup -> claim -> output完了`

この縦切りに直接必要な認証、extension、manual、storage、shareの一部を優先し、各EPICを丸ごと完成させてから次へ進む必要はない。

### P2 Chrome Extension Capture Gate

- Manifest V3。
- `activeTab` / `scripting`中心の最小権限。
- `debugger`と常時`<all_urls>`をMVP必須にしない。
- 利用者の明示操作で対象タブだけを記録する。
- 入力値、Cookie、Authorizationを保存しない。
- guest中のmanual/screenshotをD1/R2へ送らない。
- PC / smartphone / tabletを記録できる。
- smartphone / tabletでportrait / landscapeを選べる。
- window調整後の実`innerWidth / innerHeight`を確認し、終了・取消・失敗時に元window状態へ戻す。
- 初期ICPが利用する代表Webサービス群で記録精度を確認する。

### P3 Value-first Onboarding Gate

- `docs/02-ux/onboarding.md` を正本とする。
- 最初にログインさせない。
- guestがlocal draftを完成するまでworkspace、role、料金planを要求しない。
- `保存 / 共有 / PDF出力` でoutput gateを開く。
- self-service Access認証後にissuer+subjectを正本としてPersonal Workspaceをatomic・冪等にbootstrapする。
- guest draftを二重生成なくclaimする。
- signup後、押していたoutputへ自動復帰する。
- signupキャンセル・通信断・claim結果不明でもlocal原本を失わない。

### P4 Monetization Validation

- 課金はActivationと継続利用の実証後に有効化する。
- Product構造はFree -> Pro -> Teamを第一候補とする。
- Chrome拡張capture時間を利用者向け課金軸にしない。
- `single_export` は現行Product RoadmapでDeferred。
- 3,300円/月、9,900円/月は価格候補として再評価する。
- Stripe技術安全契約は維持し、課金有効化時にDeep Gateを通す。

### Deferred

利用実績または顧客要求が出るまで次をMVPブロッカーにしない。

- Cloudflare Browser Run / Browser Session / Live Viewによる製品capture。
- `debugger` / CDPを使う完全device emulation。
- Guide Me。
- タグ、お気に入り、iframe。
- コメント、通知、詳細分析。
- Markdown/HTMLを含む複数export形式の同時提供。
- 高度なTeam管理UI。
- 都度払い。
- AI拡張。

## 技術依存レーン: EPIC-15 Cloudflare認証・DB統一移行

親Issue: GitHub Issue #176

EPIC-15は安全なAccess/D1基盤を完成させる技術依存レーンであり、Product最優先そのものではない。

正本:

- ADR-0028
- `docs/09-delivery/cloudflare-migration-roadmap.md`
- `docs/04-data/d1-and-storage.md`
- `docs/05-api/cloudflare-access-d1-api.md`

既存順序:

1. M0 正本移行
2. M1 Access identity spike
3. M2 D1 workspace boundary
4. M3 Phase 1移行
5. M4 Phase 2 manual移行
6. M5 staging統合実証
7. M6 Supabase退役
8. M7 production準備

Product側は、guest local作成にはEPIC-15完了を要求しない。認証後のbootstrap、claim、manual保存、shareに必要なM3/M4相当の安全境界だけを依存として明示する。

外部provider callbackはM2のD1 coreから分離したC1マイルストーンで扱う。M2期間中は両exact POST pathを `503 CALLBACK_MIGRATION_IN_PROGRESS` とし、path別Access Bypassを有効化しない。C1ではOQ-031のatomic receipt/work、lease fencing、sink idempotencyまたはsingle-writer、結果不明照合、recovery testを完了してから再開可否を判断する。

EPIC-02、EPIC-03、EPIC-06のSupabase Auth/Postgres/RLS実装は移行前baselineとして保持するが、新規機能の土台やstaging合格証跡として拡張しない。Issue #92はcompleted close済み。Issue #176 M5の実immutable preview negative proof完了まではstaging合格、production資源作成・deploy、外部招待を禁止する既存境界を維持する。

## EPIC-00: 文書正本

目的: 実装前の迷いをなくす。

成果:

- README、AGENTS、要件、設計、データ、API、品質、Issue分解。
- 未決事項の分離。
- ADR初期セット。

完了条件:

- 対象scopeの正本間に矛盾がない。

## EPIC-01: 基盤

- Cloudflare Pages/Workers構成。
- Codespaces。
- 環境変数台帳。
- feature flag台帳。
- CI/CD。
- Fast / Core / Deep品質レベルの実workflow分離。

## EPIC-02: 認証とワークスペース

既存Phase 1実装とIssue #176 M3をbaselineとして保持する。

Product追加scope:

- output gateからのセルフサーブAccess認証。
- unknownだが検証済みhuman actor専用bootstrap route。
- issuer+subject正本。
- identity/profile/Personal Workspace/active owner membershipのatomic provisioning。
- email一致だけのidentity復活・移動禁止。
- bootstrap idempotencyと結果不明照合。

既存Team member / 4 role管理はNEXTとして安全契約を維持する。

## EPIC-03: アプリシェル

- 共通シェル、権限別UI、共通状態、日本語文言、アクセシビリティ。
- guest初回では空の管理シェルを見せず、拡張導入・記録開始へ誘導する。
- 認証後も初回workspace選択画面へ寄り道させない。

## EPIC-04: Chrome Extension Capture

MVPの操作記録レーン。

- Manifest V3。
- `activeTab` / `scripting`中心の最小権限。
- guest local persistenceはIndexedDB等を利用する。
- 記録開始・停止UI。
- content scriptによる対象タブの操作イベント収集。
- screenshot取得。
- 入力値、Cookie、Authorization非保存。
- PC / smartphone / tablet表示mode。
- portrait / landscape。
- responsive window制御と元bounds復元。
- SPA / iframe / Shadow DOM / Canvas / Web Components互換性検証。
- Chrome Web Storeまたは限定配布の導入フロー。
- 実Chrome E2E。

旧Browser Run関連Issue #86/#89等は削除せず、将来再導入時の安全証跡・履歴として保持するがMVPをブロックしない。

## EPIC-05: Guest Draft / Claim / 操作記録

- guest local event正規化。
- guest local screenshot。
- local draft生成。
- local editor persistence。
- output gate。
- claim intent。
- 認証後R2 upload。
- manual/asset finalize。
- idempotent guest claim。
- claim成功後のlocal cleanup。
- save/share/export resume。

## EPIC-06: 手順書編集

既存Postgres RPC/RLS実装はIssue #176 M4でD1 transaction/queryへ置換する移行前baselineとする。

- guest local editor。
- 認証後manual一覧。
- server editor。
- 手順並べ替え。
- 注釈／マスキング。
- 版管理。
- 公開/復元。

MVPではrevision内部構造を利用者へ見せず、作成・編集・保存・共有の完遂を優先する。

## EPIC-07: 検索と整理

- アーカイブ: MVP。
- フォルダー/検索: NEXT。
- タグ/お気に入り: Deferred。

## EPIC-08: 共有と出力

- URL共有と失効: MVP。
- 期限・パスコード・権限範囲: MVP安全条件。
- PDF: output gate対象。正式なFree/Pro配分はNEXTで決定。
- iframe、Markdown、HTML: Deferred。

## EPIC-09: 運用機能

- セキュリティ上必要な監査記録は維持。
- 一般利用者向けコメント/通知/高度な管理UIはDeferred。
- Team member管理はNEXT。

## EPIC-10: 課金

- 現行Product構造: Free / Pro / Team。
- capture時間課金なし。
- Stripe Checkout Sessions / Link / webhook安全契約は維持。
- 旧single_export 550円はDeferred。
- 旧3,300円/月、9,900円/月は価格候補として再評価。
- R2/API/export原価は内部計測。
- 自動従量課金なし。

## EPIC-11: 分析

Product Event正本: `docs/05-api/product-events.md`。

MVP:

- onboarding_started。
- extension install。
- capture mode / start / fail / complete。
- draft generated。
- output gate。
- signup。
- guest claim。
- first manual。
- share。
- second manual。

詳細閲覧分析はNEXT/Deferred。

## EPIC-12: セキュリティ/運用

- 秘密管理。
- 削除/退会。
- バックアップ/リストア。
- Chrome拡張permission境界。
- guest local-only境界。
- claim recovery。
- share期限・パスコード・失効。

## EPIC-13: リリース品質

- Chrome拡張実E2E。
- PC / smartphone / tablet実E2E。
- guest server-write 0 negative test。
- signup/bootstrap/claim再送・結果不明。
- Access JWT、Worker認可、workspace固定D1 query negative/mutation test。
- R2、share、manual回帰。
- Fast / Core / Deep運用レベル。

Browser Run Deep Gateは再導入時だけ必須化する。

## EPIC-14: AI拡張口

Product優先度: Deferred。収益・利用価値が確認されるまでコア導線の依存先にしない。
