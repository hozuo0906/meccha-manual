# B登録UIスライス

Status: Accepted

このスライスは、拡張機能のoutput gateからAccess Web画面へ進み、認証済みWebアプリが同一operationIdで`POST /api/onboarding/bootstrap`を再試行できる最小導線を定義する。

- 拡張機能は手順書本文、画像、credentialを送信しない。handoff fragmentには256bitの識別子だけを置き、local原本はbootstrap成功後も削除しない。
- output gateの取消、登録画面の未準備、401／403／429／503、応答消失では、編集内容とlocal原本を保持する。
- Web画面はbootstrap成功をPersonal Workspace準備完了として表示する。手順書が保存された、claimされた、共有されたとは表示しない。
- `operationId`と`handoffId`はWebの`sessionStorage`へmetadataだけ保存し、手順書本文をURL、DOM、storage、API payloadへ複製しない。
- Access環境と正式originの配布が未準備の限定版では、`apps/extension/onboarding-config.js`の`pending`設定によりCTAを無効化し、日本語で準備中と表示する。`ready`への変更は正式originとAccess環境を確認した配布物へ明示反映する。実環境での認証・bootstrap成功はこのスライスの検証結果に含めない。

Workerの`index.ts`へのルート接続とbootstrap APIの実装は別担当の統合対象であり、この変更では触れない。統合時は`renderOnboardingContinuePage({ bootstrapEnabled })`を`GET /onboarding/continue`へ接続し、環境設定が確認できない場合は`false`を渡す。
