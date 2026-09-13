# ADR-0030: PLG型MVPを優先し将来要件の先行固定を抑える

Status: Accepted
Date: 2026-09-12

## Context

`めっちゃマニュアル` は、認証、workspace、4ロール、共有、複数export、Guide Me、分析、コメント、課金等を将来像として持っている。一方、商用価値の中心である「操作を一度見せるだけで手順書になり、必要な相手へ渡せる」が実ユーザーに継続利用される前に、将来機能の詳細設計・品質契約が増え、Product Discoveryより技術完成度が先行していた。

初期ユーザーには、管理概念やアカウント登録を先に要求するのではなく、まず自分の業務画面で1本作らせる必要がある。また対象業務にはPCだけでなくスマホ／タブレット向けレスポンシブ画面も含まれる。

## Decision

- 初回商用MVPはPLG型とし、`価値体験 -> output時signup -> 保存/共有 -> 継続利用 -> 必要になればTeam` の順で設計する。
- Product最優先の縦切りは `LP -> Chrome拡張 -> PC/スマホ/タブレット -> guest capture -> local draft -> output gate -> signup -> Personal Workspace bootstrap -> guest claim -> output完了` とする。
- アカウント未作成でも1本目のlocal draft生成・編集まで進められる。
- `保存 / 共有 / PDF出力` 等、成果物をserverへ残す時点で初めてsignup/loginを要求する。
- signup後は同じguest draftをclaimし、利用者が選んでいたoutput操作を自動再開する。
- guest manual本文・screenshotを認証前にD1/R2へ送らない。
- workspaceは認証後のデータ・認可境界として維持し、初回human actorにはPersonal Workspaceをatomic・冪等に自動準備する。
- 検証済みAccess `issuer + subject` をapplication identityの正本とし、email一致だけでidentityを移動・統合・復活させない。
- 操作記録のMVP方式はChrome Extension Manifest V3だけとする。Cloudflare Browser Run / Browser Session / Live Viewへfallbackしない。
- Chrome拡張は `activeTab` / `scripting`中心の最小権限とし、MVPで`debugger`と常時`<all_urls>`を必須にしない。
- PC / smartphone / tabletの3表示モードをMVP必須とする。smartphone/tabletはdesktop Chrome上のresponsive viewportで実現し、portrait/landscapeを提供する。
- 実機iOS/Android、UA、DPR、touch、OS固有描画の完全再現はMVPで保証しない。
- Product KPIは `docs/05-api/product-events.md` のevent契約からActivation、TTFV、Capture Completion、Output Gate、Signup、Claim、Share、Second Manual、D7 Creator Retention等を計測する。
- 初期North Star候補は `7日以内に2本目の手順書を作成したCreator数` とする。
- 商品設計はFree / Pro / Teamを第一候補とし、Chrome拡張capture時間を課金軸にしない。
- `single_export` の旧技術契約は履歴として保持するが、現行MVPの主要offerにしない。
- 課金は `BILLING_FEATURE_ENABLED=false` のまま価値検証を先に行う。
- テスト要件は弱めず、Fast / Core PR / Deep Release Gateへ運用レベルを分ける。
- 未検証の将来要件は `Deferred` とし、価値検証より先に詳細実装しない。

## Supersedes / Refines

- DEC-009「設計は全部入り、開発は段階的に進める」はSuperseded。将来要件の一覧保持は許可するが、価値検証前の詳細固定を原則にしない。
- DEC-005「Chrome拡張を第一方式にしない」はADR-0031によりSuperseded。現行MVPではChrome拡張onlyとする。
- DEC-008「個人利用ではなくワークスペース所属を前提にする」は認証後のデータ・認可境界として維持するが、guest作成やActivation前にworkspaceを要求する意味ではない。詳細はADR-0032を正とする。
- DEC-037およびADR-0023の価格・offer部分はADR-0033によりProduct Roadmap上で再整理する。Stripeの技術安全契約は維持する。
- 旧FR-016のBrowser Run mobile preview方式はADR-0031によりSuperseded。responsive PC/smartphone/tablet captureをMVP必須とする。

## Preserves

MVP簡素化の対象外:

- Cloudflare Access JWT検証。
- Worker認可とworkspace固定D1 query。
- tenant越境拒否。
- private R2。
- 入力値・Cookie・Authorization等の非保存。
- guest contentの認証前server write禁止。
- 下書きと公開版のデータ整合性。
- 共有リンクのデフォルトOFF、期限、パスコード、権限範囲、失効。
- Stripe callback / idempotency / Webhook安全契約。
- production、課金、外部公開、secret変更等の既存承認境界。
- Browser Runを将来再導入する場合のSSRF / egress / hard-expiry安全原則。

## Consequences

- Browser Runは現行MVPとProduct Roadmapのcapture依存から外れる。
- スマホ／タブレット向けresponsive manual作成はDeferredではなくMVP必須になる。
- LP直後のsignupは不要になり、Chrome拡張導入・guest作成が先になる。
- guest中はクラウド原価・匿名upload abuse・所有者不明データを発生させない。
- signup/bootstrap/claimの結果不明・再送・二重生成防止がMVPの重要安全境界になる。
- Guide Me、詳細分析、コメント、通知、Markdown/HTML同時提供、高度なTeam UI、AI、Browser RunはMVPブロッカーではない。
- Product Discoveryとオンボーディング改善が技術移行と同等以上のDelivery対象になる。
- Cloudflare移行は認証後の安全基盤として継続するが、その完了数だけをProduct進捗としない。

## 関連正本

- ADR-0031: Chrome拡張only capture / responsive views / guest local。
- ADR-0032: value-first signup / self-service bootstrap / guest claim。
- ADR-0033: Free / Pro / Team料金簡素化。
- `docs/05-api/product-events.md`。
- `docs/05-api/guest-onboarding-and-claim-api.md`。
- `docs/07-quality/mvp-product-acceptance.md`。
