# ADR-0024: ブランドサイトとアプリをサブドメインで分離する

Status: Accepted

ADR-0028により、認証・DB固有手順をSupabaseからCloudflare Access/D1へ置換する。ブランド/アプリのsubdomain分離、Custom Domain/DNS/deployの個別承認、rollback原則は維持する。

## Context

取得済みドメイン `meccha-iiyatsu.com` を「めっちゃいいやつ」全体で利用し、今後のアプリ追加時にもURL、認証、デプロイを個別に拡張できる構成が必要である。

`www`配下へアプリ本体までサブパスで置くと、アプリごとのルーティング、Cookie、CSP、デプロイ、障害範囲が結合する。現在の`めっちゃマニュアル`はCloudflare Accessで認証付きアプリを保護するため、Access policy/audience、Cookie、CSP、障害範囲をLPから分離し、同一Workerへ統合しない。

## Decision

- `https://www.meccha-iiyatsu.com/`を「めっちゃいいやつ」のブランドトップとする。
- `https://www.meccha-iiyatsu.com/app`をアプリ一覧とする。
- `https://www.meccha-iiyatsu.com/app/meccha-manual`を`めっちゃマニュアル`の紹介LPとする。
- `https://meccha-manual.meccha-iiyatsu.com`を認証付きアプリ本体とする。
- apex `https://meccha-iiyatsu.com/*`は同じpath/queryを保って`https://www.meccha-iiyatsu.com/*`へ恒久redirectする。
- ブランドサイトは`meccha-iiyatsu-web`という別WorkerのStatic Assetsとして提供し、アプリWorker`meccha-manual-prod`とデプロイ単位を分ける。
- 同じGitHubリポジトリ内の`apps/brand-site`で管理するが、CloudflareのWorker、Custom Domain、build watch path、release approvalは別にする。
- `www`とアプリ間で認証Cookieを共有しない。アプリの`__Host-` Cookie、same-origin write検証、CORSなしを維持する。
- Custom Domain、DNS、production Worker deploy、production Access application/audience/policy/session、production D1/R2設定はコードmergeとは別の明示承認対象とする。

## URL命名規則

| 種別 | 形式 | 例 |
|---|---|---|
| ブランドトップ | `https://www.meccha-iiyatsu.com/` | 固定 |
| アプリ一覧 | `https://www.meccha-iiyatsu.com/app` | 固定 |
| 紹介LP | `https://www.meccha-iiyatsu.com/app/{app-slug}` | `/app/meccha-manual` |
| アプリ本体 | `https://{app-slug}.meccha-iiyatsu.com` | `meccha-manual.meccha-iiyatsu.com` |
| production Worker名 | `{app-slug}-prod` | `meccha-manual-prod` |
| staging Worker名 | `{app-slug}-staging` | `meccha-manual-staging` |

`app-slug`は小文字英数字とハイフンだけを使い、一度公開したslugは変更しない。変更が必要な場合は旧URLから新URLへ恒久redirectし、認証callback、メールリンク、外部連携のallowlistを同時に移行する。

## Consequences

- ブランドサイト障害と認証アプリ障害、CSP、Cookie、deployを分離できる。
- 新しいアプリはLPディレクトリ、アプリWorker、Custom Domainを追加する同じ手順で拡張できる。
- Workerが2つになるため、Cloudflare Git連携のbuild設定とproduction gateも2系統必要になる。
- apex redirectはWorkers Static Assetsの`_redirects`ではなく、Cloudflare Bulk Redirectとproxied DNSで設定する。
- production公開前にAccess application domain/audience/policy/session、メールOTP導線、Webhook URL、CSPをアプリサブドメイン基準で検証する必要がある。

## Rollback

Custom Domain追加前のWorker versionとDNS設定を記録する。問題発生時は、Custom Domainを新Workerから外し、直前のDNS/Worker割当へ戻す。Accessの旧技術URL policy/routeは移行確認完了までrollback対象として管理し、認証中断を避ける。DB migrationやデータ移動はこの切替に含めない。
