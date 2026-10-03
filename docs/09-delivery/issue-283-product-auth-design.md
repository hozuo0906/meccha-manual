# Issue #283 設計メモ: 製品認証の移行案

Status: Proposed

実装unit（2026-10-03）では、GoogleとSIWCの共通first-party session、provider start/callback、D1接続を実装した。`migrations/0008_product_auth_sessions.sql`のremote適用、secret binding、メール確認、明示的identity link、ChatGPT商用client登録・plan usageは未完了であり、外部ログイン稼働済みとは扱わない。

PKCE verifier/nonceはSecure・HttpOnly cookie binding、D1はstate／nonce／verifier hashだけを保持する。Googleはverified email、SIWCはclient_secret_basicとissuer・audience・nonce・subjectを検証し、SIWC subjectは`siwc:` + SHA-256(JSON配列 `[registeredClientId, verifiedTokenSub]`) でscopeする。同じsubでもclient IDが異なれば別identityとし、email一致による自動linkは行わない。Access service tokenとhealthは製品cookieから分離する。

専用Google Cloud project `meccha-manual-auth`は作成済みで、Google API policyへの同意、OAuthの構成作成、OAuth client作成が完了している。請求先アカウントはなく、client資格情報はrepo外で保護済みである。callback/startのsource、D1 schema、設定値の読み取り窓口とconfigured booleanの実装は完了しているが、remote migration適用と本番secret bindingが未完了のため、Googleログインは未稼働として扱う。

Date: 2026-10-03

## 目的

Cloudflareアカウントへのログインを製品利用者へ要求せず、めっちゃマニュアル自身のメール登録・ログインとGoogleログインを提供する。ChatGPTログインは、商用client登録と利用資格が確認できるまでユーザーへ表示しない。管理者・運用のCloudflare Access、D1/R2、workspace認可は別境界として維持する。

このメモはADR-0041の設計候補を具体化する。現行Accepted文書を遡って書き換えず、実装開始前にprovider、schema、session、移行の未決を解消する。

## 製品ログイン画面の仕様案

画面名は「めっちゃマニュアルにログイン」とする。説明は「手順書を保存・共有するにはアカウントが必要です。ログイン前の下書きはこの端末に残ります。」とし、Cloudflare、issuer、provider内部名は表示しない。

初期表示には次の操作を置く。

- 「メールで登録／ログイン」
- 「Googleで続ける」
- 認証を中断して下書きへ戻る操作

ChatGPTの操作は商用client登録と利用資格が確認できるまで表示しない。利用者へ準備中の内部事情を説明する必要がある場合は、「このログイン方法は現在利用できません」とだけ表示する。

メールを選ぶと、メールアドレス入力と「確認コードを送る」を表示する。送信後は同じ画面で確認コード入力、「確認する」、「コードを再送する」を表示する。再送は待機時間と残り回数を示す。成功後は元のhandoffに戻り、認証前に選択した保存・共有・PDF等のoutputを続行する。

送信結果は、登録済みか未登録かを判別できない共通文言にする。「確認コードを送信しました。届かない場合は、入力内容を確認して再送してください。」と表示する。期限切れ、使用済み、試行回数超過、送信失敗、通信断は日本語で次の操作を案内し、入力中のメールアドレスとlocal draftを失わない。

Googleでは遷移中に「Googleで認証しています」と表示し、キャンセル・拒否・callback不一致・検証失敗・通信断を区別して再試行を案内する。Googleのverified emailを確認できない場合は製品アカウントを作成しない。Google identityと既存アカウントをemailだけで自動統合しない。

ログイン途中でlocal draftを再読み込みしても、認証用handoffの有効期限とdraft fingerprintを照合できる間は同じ下書きへ戻す。別の利用者のsession、別handoff、期限切れhandoff、変更されたdraftは復帰させず、元のlocal下書きを保持したまま再開方法を示す。

## Office出力の認証境界

Word／PowerPoint出力は、ファイル保存を開始する直前に製品sessionを必須とする。ログイン途中もguestの下書きと出力選択を保持し、製品session確立後に同じ出力を再開する。Cloudflare Accessの管理者・運用sessionを製品利用者のログイン完了とは扱わない。

## provider別の処理境界

### メール確認コード

候補providerから送信providerを選び、送信元domain、rate limit、失敗時の再送、staging/production分離を決める。provider未選定またはcredential未設定の環境では、メール認証を有効化しない。パスワードhashや確認コードの平文は保存しない。

### Google

実装済みrouteは、`GET /api/auth/google/start` と `GET /api/auth/google/callback` である。server secretは`GOOGLE_OIDC_CLIENT_ID`と`GOOGLE_OIDC_CLIENT_SECRET`、origin設定は既存の`APP_ENV`と`APP_BASE_URL`を再利用する。remote migration適用と実環境secret bindingが完了するまで本番では有効化しない。

scopeはidentity確認に必要な最小候補として`openid email profile`を使う。現行sourceと契約で確認できるstaging originは`https://meccha-manual-staging.meccha-iiyatsu.com`である。既存の`/onboarding/continue`はguest handoff用のrouteであり、Google callbackではない。Google callbackは`/api/auth/google/callback`として実装し、OAuth clientにも登録済みである。

OIDC Authorization Code + PKCE、state、nonceをサーバー側で生成し、登録済みcallback URLへ限定する。issuer、audience、署名、期限、nonce、state、verified emailを検証し、検証済みのissuer+subjectをidentityとして扱う。client secretはserver-side secret managerだけに置く。secret名を追加する場合も候補として設計に記載し、実装unitで承認するまで追加しない。

### ChatGPT / SIWC

identity scopeとChatGPT plan usage permissionを別々に扱う。identityだけを許可しても、ChatGPT plan利用を許可したことにはしない。plan利用は将来の本人同意画面、token保護、利用停止・失効処理を含む別unitとする。商用client登録が未確認の間はボタン、callback、設定を有効化しない。OSS向けdynamic registrationやlocal loopbackの仕組みを、遠隔商用SaaSの認証・AI利用の迂回に使わない。

## データ、session、tenant

既存D1の `identities(issuer, subject)` はprovider identityの正本候補として再利用できる。ただし、メール・Google・SIWCを同一製品アカウントへまとめるためのaccount/link主体は現行schemaにない。次のどちらを採用するかを先に決める。

- `accounts`相当の製品主体を追加し、provider identityを明示linkする。
- provider identityごとに別application identityを作り、利用者が明示操作でlinkするまで別アカウントとして扱う。

いずれもemail一致だけの自動linkを禁止する。旧Access identityはissuer+subjectを保持したまま移行対象として残し、本人が旧経路と新経路の両方で認証した明示linkだけを許可する。disabled・retired identityを自動復活させない。

実装候補のschema名は次のとおりだが、採用は未決である。

- `auth_sessions`: session token hash、application identityまたはaccount ID、issued_at、expires_at、revoked_at、last_seen_at、session version
- `auth_challenges`: challenge hash、purpose、期限、試行回数、消費時刻、送信回数、operation ID
- `account_identity_links`または`accounts`: 複数provider identityの明示link境界

sessionの平文token、OIDC token、ChatGPT credential、メール確認コード、provider secretはD1/R2/logへ保存しない。CookieはSecure・HttpOnly・適切なSameSiteを設定し、状態変更APIはCSRF tokenまたは同等のorigin/session bindingを検証する。logoutはcookie削除だけを成功扱いにせず、server-side revocationを確定する。

全business queryは従来どおりapplication identity、workspace ID、active membership、role、resource workspaceを同時に検証する。provider callbackやlogin成功だけでworkspace権限を付与しない。D1/R2のtenant境界、owner制約、negative/mutation testは維持する。

## 設定・依存の候補

メール送信とSIWC商用client設定は未完了だが、Googleのcredential binding、callback/start実装、product auth schemaは実装済みである。Google OAuth clientは作成済みでclient資格情報はrepo外で保護済みだが、請求先アカウントはない。

- Google設定: `GOOGLE_OIDC_CLIENT_ID`、`GOOGLE_OIDC_CLIENT_SECRET`、環境別redirect URI
- メール候補: `EMAIL_CODE_PROVIDER`、送信元名、provider secret
- SIWC候補: `OPENAI_SIWC_CLIENT_ID`、必要なclient secret、環境別redirect URI
- 診断: secret値を返さず、providerごとのconfigured booleanだけを管理者経路へ表示する

既存のJWT検証依存を再利用できるかを先に確認し、新しいOAuthライブラリ、メールSDK、環境変数、共通moduleは承認なしに追加しない。D1とR2のbindingは変更しない。

## 次の認証実装unitの受入条件

- メール確認コードの正常、期限切れ、使用済み、試行超過、再送制限、parallel request、送信失敗、通信断を確認できる。
- 登録済み／未登録を応答差分、文言、時間差で列挙できない。
- Googleのstate、PKCE、nonce、issuer、audience、signature、verified email、callback URIを検証し、拒否時にsession・workspace・membershipを作成しない。
- SIWCが未登録・未eligibleの環境ではログインUIとcallbackが無効で、AI APIもOFFのままである。
- session cookieがJavaScript、拡張、URL、ログへ漏れず、expiry、logout、revocation、CSRF、再認証を確認できる。
- email一致だけでは旧Access identity、Google identity、SIWC identityをlinkしない。明示本人linkと拒否系を確認する。
- login途中のguest handoff、local draft、選択済みoutputを保持し、成功後に同じdraft fingerprintを確認して復帰する。
- provider callback、session、workspace、manual、R2 assetの各経路でtenant越境・権限不足・disabled identity・結果不明を拒否する。
- secret値、token、確認コード、実メールアドレスをテストログ、Issue、Markdownへ出さない。

## 必要な外部操作と未決事項

- メール送信providerの選定、送信元domain、staging/production credential、rate limitと失敗時運用の承認。
- Google Cloud側の作成済みclientの環境別callback URL、issuer/audience、verified email運用の登録。OAuthの構成作成、Google API policyへの同意、client作成、source実装、設定bindingは完了済みだが、remote migration適用と実環境secret bindingは未完了である。
- OpenAI側のSIWC商用client登録・利用資格、identity scopeとplan usage scopeの可否、callbackとtoken endpointの登録。
- 既存Access identityを新provider identityへ明示linkする本人確認手順と、link解除・アカウント復旧方針。
- `accounts`/link table、session、challengeのD1 schema、migration、backup/restore、negative/mutation testの承認。

これらが確認できるまで、現行Access/D1運用と本番設定を変更せず、実環境のprovider有効化、remote migration適用、secret bindingは行わない。実装済みの検証用UI・callbackは合成providerテストの範囲に限定する。

## staging接続準備のread-only確認（2026-10-03）

ローカルの`wrangler.jsonc`を実読した結果、`APP_ENV`は`staging`ですが、`APP_BASE_URL`は`https://meccha-manual.tattoo-studio-crm.workers.dev`で、`main`は`apps/worker/src/index-phase2.ts`です。D1、`MANUAL_ASSETS`を含むR2、Google／SIWCのproduct auth secret bindingはこの設定にありません。設定済みsecret名として宣言されているのは既存の`DISCORD_PUBLIC_KEY`と`GITHUB_ISSUE_TOKEN`だけです。これはIssue 283が定めるstaging origin・D1・R2・product auth bindingの実環境設定とは一致しません。

Wrangler CLIの`whoami`は終了コード0で認証済みシグナルを返しましたが、アカウント名やメールは保存・表示していません。`deployments list`と`secret list`は、この環境のWranglerがログ出力先へのEPERMまたはCLI終了異常で終了し、Worker version、remote secret名、D1 migration履歴を取得できませんでした。したがって、stagingの現行version、`APP_ENV`／provider configured boolean、0006・0007・0008のremote適用状況、Access外周の実設定は未確認です。remote write、deploy、secret取得、migration適用、Access変更は行っていません。

実環境へ進む場合の順序は、対象Worker名・staging origin・staging専用D1/R2 binding・Access applicationをread-onlyで照合し、対象SHAを固定した後、0006・0007・0008の適用履歴を確認することです。その後にstaging専用のGoogle secret bindingと`APP_BASE_URL`を登録し、configured boolean、Google／ChatGPTの未登録時非表示、製品cookieとAccess healthの分離、workspace／manual／R2 tenant拒否を確認します。反映はversion upload後にstagingだけで行い、migration失敗、callback失敗、health未認証、foreign workspace、logout失敗のいずれかで旧versionへ戻せるよう、対象version・migration順・binding差分を一つのrollback記録に残します。production、課金、外部ユーザー招待、ChatGPT商用client有効化はこの確認では承認しません。
