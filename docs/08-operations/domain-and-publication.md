# ドメインと公開構成

Status: Accepted

## 推奨URL一覧

| URL | 役割 | 公開単位 |
|---|---|---|
| `https://www.meccha-iiyatsu.com/` | 「めっちゃいいやつ」公式HP | `meccha-iiyatsu-web` Static Assets Worker |
| `https://www.meccha-iiyatsu.com/app` | アプリ/サービス一覧 | 同上 |
| `https://www.meccha-iiyatsu.com/app/meccha-manual` | 「めっちゃマニュアル」紹介LP | 同上 |
| `https://meccha-manual.meccha-iiyatsu.com` | ログイン後のアプリ本体 | `meccha-manual-prod` Worker |
| `https://meccha-iiyatsu.com/*` | `www`への恒久redirect入口 | Cloudflare Bulk Redirect |

## 実装済みの範囲

- `apps/brand-site/public`へ公式HP、アプリ一覧、`めっちゃマニュアル` LP、404、共通CSSを追加した。
- 各ページへtitle、description、canonical、OGP、Twitter Card、favicon、見出し構造、skip linkを設定した。
- アプリCustom Domain接続前はCTAを「アプリを開く（準備中）」として無効化し、`apps/brand-site/apps.json`を`live`へ変更する公開PRでリンクを有効化する。
- `_headers`へCSP、frame拒否、MIME sniffing拒否、Permissions Policy、Referrer Policy、cache方針を追加した。
- `wrangler.brand.jsonc`はStatic Assetsと`workers.dev` previewだけを定義し、production Custom Domainを意図的に含めていない。
- `npm run brand:check`でURL、canonical、OGP、内部リンク、CTA、security header、Wrangler設定を検査する。

## Cloudflareで必要な作業

以下はproduction反映であり、実施前に対象、影響、rollbackを再確認して承認を受ける。

1. `meccha-iiyatsu.com`をCloudflareのactive zoneとして確認する。
2. `meccha-iiyatsu-web` Workerを`wrangler.brand.jsonc`から作成し、まず`workers.dev` previewで3ページ、404、header、mobile表示を確認する。
3. 別承認後にだけproduction専用Access application/audience/policy/session、D1、R2、`meccha-manual-prod` Workerを物理分離して作成し、`workers.dev`でAccess JWT、identity/membership認可、メールOTP導線を検証する。
4. Custom Domain `meccha-manual.meccha-iiyatsu.com`を`meccha-manual-prod`へ追加し、TLS、`/health`、ログイン、ログアウトを確認する。
5. `apps/brand-site/apps.json`の対象を`live`へ変更し、3か所の「アプリを開く」を同Custom Domainへのリンクにする公開PRを作成する。`npm run check`と実URL到達確認を必須にする。
6. 5の合格後にだけCustom Domain `www.meccha-iiyatsu.com`を`meccha-iiyatsu-web`へ追加する。既存CNAMEがある場合は追加前に競合を解消する。
7. apexにproxied DNSを用意し、Bulk Redirectで`https://meccha-iiyatsu.com/*`から`https://www.meccha-iiyatsu.com/${1}`相当へpath/queryを保持して301または308 redirectする。
8. TLS、canonical、OGP、`/app`、`/app/meccha-manual`、アプリCTA、404、security headerを実URLで再検証する。
9. Worker Buildsを2projectに分け、brandは`apps/brand-site/**`と`wrangler.brand.jsonc`、appはアプリ/Worker関連pathをbuild watch対象にする。

Cloudflare Custom Domainは対象hostnameのDNSと証明書を自動作成する。既存originの前段でWorkerを動かすRoutesではなく、各Worker自身をoriginとするCustom Domainを使う。

## 認証・Cookie・メールリンク

- Access session CookieはCloudflare Accessが管理する。production Access application、audience、policy、sessionをアプリ本体hostname専用にし、`www`や別アプリの到達許可と共有しない。アプリはAccess Cookieや独自access/refresh tokenを発行・更新・削除しない。
- StripeとDiscordの外部callbackは、`POST /v1/webhooks/stripe` と `POST /v1/integrations/discord/interactions` のexact pathごとに、hostname applicationより具体的なpath別Access Bypass applicationへ分離する。hostname全体、共通prefix、wildcard pathへBypassを適用しない。
- Bypassを認証・認可の代替にしない。Workerはexact POSTとbody上限を確認し、raw bodyのStripe署名またはDiscord Ed25519署名・署名対象timestampを副作用なしで検証してから有界JSON parse/schema検証を行い、provider event/interaction IDをauthoritative storeへ原子的に予約する。予約後だけQueue、外部API、業務D1、entitlementその他の副作用へ進める。OQ-031の実装・negative test完了前はpath別Access Bypassを有効化しない。通常アプリAPIはAccess user用application、`GET /health/config`はservice-token用Access application/policyで保護する。
- LPからアプリへは通常のtop-level GET遷移だけとし、LPからアプリAPIを呼ばない。アプリAPIのCORS許可を`www`へ広げない。
- 通常のブラウザwrite APIはアプリ自身のOriginだけを受け付ける。Stripe/Discordの2 exact callback pathはserver-to-server例外であり、`Origin`の有無や値を認証根拠にせずprovider署名を正とする。
- production Access applicationはアプリ本体URL、audience、policy、sessionを専用化し、メールOTPの明示Emails/Groups allowlistを検証する。preview wildcard policyをproductionへ流用しない。
- 旧`workers.dev` URLは移行期間だけ認証allowlistへ残し、本番callbackの検証後に削除する。

## 環境変数方針

| 項目 | staging | production | 変更 |
|---|---|---|---|
| `APP_BASE_URL` | staging Worker URL | `https://meccha-manual.meccha-iiyatsu.com` | production値の登録が必要 |
| Access application/audience/policy + D1/R2/Worker binding | staging専用 | production専用 | 物理分離し、共有・fallbackを禁止 |
| ブランドサイト | runtime変数なし | runtime変数なし | URLは公開情報としてHTML/OGPへ固定 |
| Secret / R2 / Discord | staging専用 | production専用 | 共有禁止 |

ブランドサイトは静的であり、Secretもruntime環境変数も追加しない。新しいアプリのLP URLとアプリURLは、公開URL台帳と静的ページのcanonical/CTAを同じPRで更新する。

## 新しいアプリの追加手順

1. `app-slug`を小文字英数字とハイフンで確定する。
2. `apps/brand-site/apps.json`へ`prelaunch`状態で登録する。
3. `apps/brand-site/public/app/{app-slug}/index.html`へLPを追加する。
4. `apps/brand-site/public/app/index.html`へ一覧導線と準備中CTAを追加する。
5. `{app-slug}-staging`と`{app-slug}-prod`を別Workerとして用意する。
6. `{app-slug}.meccha-iiyatsu.com`をproduction WorkerのCustom Domainにして到達確認する。
7. app台帳を`live`へ変更してCTAを有効化し、その後にブランドサイトを公開する。
8. アプリ固有のAuth、Cookie、callback、CSP、Webhook、Secretを別管理する。
9. `npm run check`と実URLの公開前検査を通す。

## 変更範囲・リスク・rollback

今回のPRは静的ファイル、検査、Wranglerの未接続設定、設計文書だけを変更する。DNS、Custom Domain、Worker deploy、Access、D1、R2、legacy Supabase、Secretは変更しない。

| リスク | 対策 | rollback |
|---|---|---|
| `www`を誤ったWorkerへ割当 | Custom Domain追加前にWorker名とpreviewを照合 | Custom Domainを外し旧DNSへ戻す |
| ログイン/メールリンク切断 | 旧URLを一時allowlistへ残しcallbackを実機確認 | app Custom Domainを外し旧技術URLを案内 |
| apex redirect loop/path消失 | `www`をredirect対象から除外しpath/queryを検査 | Bulk Redirect ruleを無効化 |
| LPだけ先に公開され未完成アプリへ誘導 | prelaunch中はCTAを無効化し、アプリ到達確認後の公開PRでだけ有効化 | brand Workerを直前versionへrollback |
| 2 Workerの誤deploy | build watch pathとGitHub Environmentを分離 | 直前の合格SHAを再deploy |
