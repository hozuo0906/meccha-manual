# B登録UIスライス

Status: Accepted

このスライスは、拡張機能のoutput gateからAccess Web画面へ進み、認証済みWebアプリが同一operationIdで`POST /api/onboarding/bootstrap`を再試行できる最小導線を定義する。

- 拡張機能は手順書本文、画像、credentialを送信しない。handoff fragmentには256bitの識別子だけを置き、local原本はbootstrap成功後も削除しない。
- output gateの取消、登録画面の未準備、401／403／429／503、応答消失では、編集内容とlocal原本を保持する。
- Web画面はbootstrap成功をPersonal Workspace準備完了として表示する。手順書が保存された、claimされた、共有されたとは表示しない。
- `operationId`と`handoffId`はWebの`sessionStorage`へmetadataだけ保存し、手順書本文をURL、DOM、storage、API payloadへ複製しない。
- owner限定staging配布版では、`apps/extension/onboarding-config.js`の`ready`設定を明示したstaging originへ固定し、CTAからstaging B登録UIへ接続する。production、preview、localhost、userinfo、port、path、query付きoriginは`handoff.js`でも同じ固定値との完全一致を要求して拒否する。production originを含む未準備版は引き続き`pending`設定でCTAを無効化し、日本語で準備中と表示する。

Workerの`index.ts`へ`GET /onboarding/continue`、外部CSS/JS asset、bootstrap有効状態のbinding判定を接続した。bootstrap API本体・D1 migrationを`codex/s2-onboarding-bootstrap`から通常mergeし、BのAPI/UI統合を完了した。環境設定が確認できない場合は`bootstrapEnabled=false`で安全に停止する。owner限定staging配布版の設定・unit／browser回帰は実装済みだが、配布ZIPを実Chromeへ導入してstagingへ接続する通し確認は別途の実行証跡として扱い、このスライスのコード検証だけで完了扱いにしない。

owner pilot向けの専用runtime設定は`wrangler.onboarding.jsonc`に分離する。`apps/worker/src/index.ts`を入口とし、stagingは`meccha-manual-staging`／staging D1だけを使う。productionは専用Worker名と正式originを記載するが、D1 ID・Access audience・rate-limit namespaceが確定するまでplaceholderでfail closedにする。Web画面は`APP_ENV`と`APP_BASE_URL`の環境別完全一致、およびrequest originの完全一致時だけstaging／productionごとの許可originでbootstrap CTAを有効化する。既存の`wrangler.jsonc`（legacy Supabase／Discord経路）は変更しない。migration適用、owner pilot、配布版の導入、production反映の手順は[owner pilot runtime runbook](../08-operations/onboarding-b-owner-pilot-runtime.md)を正とする。

検証は`npm run test:onboarding-ui`で行い、拡張機能の取消・保存失敗・未準備表示、Webの503後同一operationId再試行、再読込後のTTL失効、Worker route/assetsのCSP・binding判定を含む。

この文書の対象はB登録UIスライスまでとし、C以降の機能・運用・本番反映は対象外とする。
## Handoff期限と不正fragment

- `handoff` fragmentが明示されている場合は、空値、形式不正、重複を保存済みmetadataへフォールバックせず拒否する。
- 有効fragmentの訪問時にoperationの期限起点を固定し、初回クリックまでの待機も15分TTLに含める。
- 同じhandoffの有効な保存済みmetadataを再訪しても、保存済みの期限起点を維持してTTLを延長しない。
- 同一タブではhandoffごとのoperation履歴と期限切れtombstoneを保持し、A→B→AでもAのoperationを再発行しない。期限切れtombstoneの保存に成功した場合だけ再読込後も失効状態を保証し、保存に失敗した現在ページはfail closedとするが再読込後の耐久性は保証しない。fragmentなし再読込はactive pointerだけを参照する。
- hash-onlyのfragment遷移ではCTAを即時無効化して再読込し、遷移先のhandoffを再検証する。
- 旧単一recordの検証済み移行を除き、parse・重複・保存失敗や履歴容量超過は新しいoperationを作らず副作用0で停止する。履歴保証の境界は同一タブのsessionStorage存続中とする。
- 期限切れ後はbootstrap requestとoperationIdの再発行を0回にし、期限内のreload／応答消失だけ同じoperationIdで再試行する。
