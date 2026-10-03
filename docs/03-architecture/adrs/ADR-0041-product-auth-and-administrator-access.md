# ADR-0041: 製品認証と管理者Cloudflare Accessの分離

Status: Accepted

## 実装対象の受入れ（2026-10-03）

このADRのAccepted範囲は、first-partyのGoogle／SIWC認証基盤、D1の`auth_sessions`・`oauth_transactions`、既存`identities(issuer, subject)`とPersonal Workspace bootstrapへの接続である。Googleは`GET /api/auth/google/start`と`/callback`、ChatGPTは同形式のrouteを持つ。設定未完了のproviderは設定booleanだけを返し、UIとstartをfail closedにする。

PKCE verifierとnonceは短命のSecure・HttpOnly・SameSite=Lax cookieに結び、D1にはhashだけを保存する。callbackはstate、cookie binding、期限、一回消費、issuer、audience、署名、nonceを検証し、Googleだけverified emailを必須とする。SIWCは`client_secret_basic`とissuer・audience・nonce・subjectを正本にし、`siwc:` + SHA-256(JSON配列 `[registeredClientId, verifiedTokenSub]`) をsubjectとしてprovider/client IDを含むidentity衝突を防ぐ。同じsubでもclient IDが変われば別identityとなり、本人確認を伴う明示linkが将来必要になる。平文token、credential、secretはD1/R2/logへ保存しない。

Accessのservice token、`/health/config`、D1/R2の固定workspace query、tenant越境拒否は製品sessionから分離して維持する。失効・不正な製品cookieをAccessへ暗黙fallbackしない。メール確認と明示的identity link、ChatGPT plan usage permission、remote migration・provider secret bindingは別unitの未完了事項である。

専用Google Cloud project `meccha-manual-auth`は作成済みで、Google API policyへの同意、OAuthの構成作成、OAuth client作成が完了している。請求先アカウントはなく、client資格情報はrepo外で保護済みである。callback/startのsource、D1 schema、設定値の読み取り窓口とconfigured booleanの実装は完了しているが、remote migration適用と本番secret bindingが未完了のため、Googleログインは未稼働として扱う。

Date: 2026-10-03

## 背景

ユーザー向けの製品認証について、Cloudflareアカウントへのログインを要求せず、自社のメール登録・ログインとGoogleログインを提供する。ChatGPTログインは、OpenAI側の商用client登録と利用資格が確認できるまで製品画面へ表示しない。Cloudflare Accessは管理者・運用経路とimmutable preview等の運用保護に限定する。

現行のAccepted ADR-0028、ADR-0032、`auth-and-tenancy.md`、`domain-and-publication.md` は、現在運用するAccess/D1移行の正本であり、この提案だけでは変更しない。ADR-0041がAcceptedになり、移行実装と検証が完了した時点で、製品利用者のログイン部分だけを部分的にSupersededとする予定である。Accessのservice token分離、D1/R2、workspace固定query、deny-by-default、tenant越境negative testは維持する。

## 提案する方針

- 製品ログインは自社Webのfirst-party UIから開始し、認証完了後はfirst-partyのSecure・HttpOnly・SameSite Cookieでアプリセッションを作成する。認証tokenをブラウザJavaScript、Chrome拡張、URL fragment、ログへ渡さない。
- メールは確認コード方式を第一候補とする。passwordを利用者に保持させないが、メール送信providerとcredentialが未選定・未設定の間は有効化しない。登録とログインで利用者の存在を推測できる応答を返さない。
- GoogleはOIDC Authorization Code + PKCE、state、nonceを使う。登録済みcallback URL、issuer、audience、ID token署名、verified emailを厳格に確認する。
- ChatGPTログインは、provider登録と商用利用資格が確認できるまで非表示とする。ChatGPT identityは製品ログインのidentityとして扱えるが、ChatGPT planを使う権限は別の明示同意・別permissionとする。AI APIの初期OFFは維持する。
- 検証済みproviderのissuerとsubjectをD1 identityへ写像する。email一致だけで既存provider identityや旧Access identityを自動link・統合・復活させない。linkが必要な場合は、既存アカウントへ本人がログインした後の明示操作として実装する。
- 既存のAccess identityは移行完了まで保持し、旧issuer+subjectの履歴をemailだけで置換しない。既存workspace、membership、role、manual、R2 assetのtenant境界を認証provider変更で緩めない。
- セッションはサーバー側にtoken hashだけを保存し、expiry、明示logout、revocation、必要なrotation、CSRF防御を持つ。セッションの平文token、メール確認コード、OIDC token、ChatGPT credentialをD1、R2、ログへ保存しない。
- `/api/session`は認証方式を`authMode: "product" | "access"`として返し、ブラウザはこの値だけで製品ログインとCloudflare Access再認証を分岐する。`manuals.status`や`members.status`は機能移行状態であり、認証方式の代替マーカーにしない。明示password login成功時は競合する製品sessionをserver-side revokeし、製品cookieを削除してlegacy sessionへ遷移する。
- メール確認challengeは短命・一回使用・試行回数上限・再送制限・並行消費防止を必須にする。期限切れ、使用済み、回数超過、送信失敗を区別しつつ、アカウント存在の列挙を許さない。
- guestのlocal draftとoutput選択はログイン途中でも保持し、認証後に同じhandoffとdraft fingerprintを再検証して元のoutputへ戻す。認証失敗やキャンセルでlocal原本を削除しない。

## 境界
- 実装済みのGoogle routeは、同一staging origin `https://meccha-manual-staging.meccha-iiyatsu.com` の `GET /api/auth/google/start` と `GET /api/auth/google/callback` である。scopeは`openid email profile`、server secretは`GOOGLE_OIDC_CLIENT_ID`と`GOOGLE_OIDC_CLIENT_SECRET`、`APP_ENV`と`APP_BASE_URL`を再利用する。remote migration適用、実環境secret binding、外部providerを使った本番稼働は別のrelease作業である。
- Word／PowerPoint出力は、保存処理を開始する直前に製品sessionを必須とする。guestの下書きと出力選択はログイン途中も保持し、製品session確立後に同じ出力を再開する。Cloudflare Accessの管理者・運用sessionとは別境界にする。

このADRの実装は、現行Access application、production policy、Cloudflare管理設定、Google client、メール送信provider、OpenAI clientの実環境設定を変更しない。D1 migrationとsession実装は本ADRのAccepted範囲に含めるが、remote D1への適用は別releaseで行う。新しい環境変数、依存package、秘密値をこのADRだけで追加しない。

管理者・運用用のCloudflare Accessとservice tokenは、製品利用者のログインとは別の認証経路として残す。`GET /health/config`等の管理経路を製品sessionへ置き換えない。D1/R2のbindingとworkspace固定認可queryも変更しない。

## Accepted化の条件

1. 自社メールproviderとGoogle OAuth clientの選定、登録済みredirect URI、staging/productionの分離、秘密管理方法を確認する。
2. ChatGPTの商用client登録・利用資格を確認する。確認できない間はSIWCをhiddenのままにし、OSS向け動的登録を商用SaaSの代替にしない。
3. provider identity、製品アカウント、旧Access identityを明示的に関連付けるschemaと移行手順を決め、email-only linkをnegative testで拒否する。
4. session、challenge、CSRF、logout/revocation、再送、parallel request、結果不明、アカウント列挙防止のAPI契約とD1 migrationを追加する。
5. guest handoff保持、Personal Workspace bootstrap、workspace固定query、tenant越境・権限negative testを各providerで通す。
6. provider secret値を返さず、設定済みbooleanだけを管理者向け診断へ出す。ログ、Issue、Markdownへ秘密値・token・実メールアドレスを記録しない。
7. 現行ADR-0028/0032のどの範囲をSupersededにするかをAccepted化時のdecision-logへ記録し、旧運用状態を遡って書き換えない。

## 予定する関係

- ADR-0028: Access JWT検証、service token分離、Worker/D1 deny-by-default、環境分離は維持し、製品利用者のhuman login入口だけを将来部分的にSupersededとする。
- ADR-0032: guest-first、local draft、handoff、claim、Personal Workspace bootstrapは維持し、Access OTPを前提にした製品ログイン部分だけを将来部分的にSupersededとする。
- ADR-0010、旧Supabase Auth/Postgres/RLS baseline: 移行前の履歴として保持し、新認証実装の正本へ戻さない。

## 状態

本ADRはAcceptedであり、記載した実装範囲を承認する。ただしproductionの認証方式の切替、Cloudflare設定、実環境provider有効化、remote D1 migrationは別release承認とする。
