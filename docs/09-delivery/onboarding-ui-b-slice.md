# B登録UIスライス

Status: Accepted

このスライスは、拡張機能のoutput gateからAccess Web画面へ進み、認証済みWebアプリが同一operationIdで`POST /api/onboarding/bootstrap`を再試行できる最小導線を定義する。

- 拡張機能は手順書本文、画像、credentialを送信しない。handoff fragmentには256bitの識別子だけを置き、local原本はbootstrap成功後も削除しない。
- output gateの取消、登録画面の未準備、401／403／429／503、応答消失では、編集内容とlocal原本を保持する。
- Web画面はbootstrap成功をPersonal Workspace準備完了として表示する。手順書が保存された、claimされた、共有されたとは表示しない。
- `operationId`と`handoffId`はWebの`sessionStorage`へmetadataだけ保存し、手順書本文をURL、DOM、storage、API payloadへ複製しない。
- Access環境と正式originの配布が未準備の限定版では、`apps/extension/onboarding-config.js`の`pending`設定によりCTAを無効化し、日本語で準備中と表示する。`ready`への変更は正式originとAccess環境を確認した配布物へ明示反映する。実環境での認証・bootstrap成功はこのスライスの検証結果に含めない。

Workerの`index.ts`へ`GET /onboarding/continue`、外部CSS/JS asset、bootstrap有効状態のbinding判定を接続した。bootstrap API本体・D1 migrationを`codex/s2-onboarding-bootstrap`から通常mergeし、BのAPI/UI統合を完了した。環境設定が確認できない場合は`bootstrapEnabled=false`で安全に停止する。正式なAccess外部設定と実環境の認証・bootstrap成功は未設定・未検証であり、このスライスの完了条件に含めない。

検証は`npm run test:onboarding-ui`で行い、拡張機能の取消・保存失敗・未準備表示、Webの503後同一operationId再試行、再読込後のTTL失効、Worker route/assetsのCSP・binding判定を含む。

この文書の対象はB登録UIスライスまでとし、C以降の機能・運用・本番反映は対象外とする。
## Handoff期限と不正fragment

- `handoff` fragmentが明示されている場合は、空値、形式不正、重複を保存済みmetadataへフォールバックせず拒否する。
- 有効fragmentの訪問時にoperationの期限起点を固定し、初回クリックまでの待機も15分TTLに含める。
- 同じhandoffの有効な保存済みmetadataを再訪しても、保存済みの期限起点を維持してTTLを延長しない。
- 期限切れ後はbootstrap requestとoperationIdの再発行を0回にし、期限内のreload／応答消失だけ同じoperationIdで再試行する。
