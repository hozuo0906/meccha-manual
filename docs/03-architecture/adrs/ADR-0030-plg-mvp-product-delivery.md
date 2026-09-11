# ADR-0030: PLG型MVPを優先し将来要件の先行固定を抑える

Status: Accepted
Date: 2026-09-12

## Context

`めっちゃマニュアル` は、認証、workspace、4ロール、Browser Run、共有、複数export、Guide Me、分析、コメント、課金等を将来像として持っている。一方、商用価値の中心である `操作を記録 -> 下書き生成 -> 編集 -> 共有` が実ユーザーに継続利用される前に、将来機能の詳細設計・品質契約が増え、Product Discoveryより技術完成度が先行していた。

初期ユーザーには、管理概念を学ばせるより先に価値を体験させ、個人利用から共有・継続利用・チーム利用へ自然に広げる必要がある。

## Decision

- 初回商用MVPはPLG型とし、`個人が価値体験 -> 共有 -> 継続利用 -> 必要になればTeam` の順で設計する。
- 現在の価値検証に必要な仕様だけを優先し、未検証の将来要件は `Deferred` として詳細設計・実装を急がない。
- 技術EPICの完了順だけではなく、`認証 -> 操作記録 -> 下書き生成 -> 編集 -> URL共有` の利用者価値の縦切りをDelivery単位にする。
- workspaceは内部データ境界として維持するが、個人利用では自動準備し、初回Activation前にworkspace管理や4ロール理解を要求しない。
- Product KPIとしてActivation、TTFV、Capture Completion、Share、Second Manual、D7 Creator Retentionを技術品質と別に計測する。
- 初期North Star候補は `7日以内に2本目の手順書を作成したCreator数` とし、実データで正式採用を判断する。
- 課金は `BILLING_FEATURE_ENABLED=false` のまま価値検証を先に行い、Free -> Pro -> Teamを第一候補とする。`single_export` の既存技術契約は保持するが商用MVPではDeferredとする。
- Browser Runは安全実証に加えて、初期ICPの代表サイト群でProduct Market Fit上の利用可能性も検証する。利用不能率が高い場合、capture方式を再評価する。
- テスト要件は弱めず、Fast / Core PR / Deep Release Gateへ運用レベルを分ける。

## Supersedes / Refines

- DEC-009「設計は全部入り、開発は段階的に進める」は本ADRでSupersededとする。将来要件を一覧として保持することは許可するが、価値検証前の詳細固定を原則にしない。
- DEC-005「Chrome拡張を第一方式にしない」は現時点の実装方針として維持するが、Product DiscoveryでBrowser Runの市場適合性が不足した場合に再評価できるよう固定性を弱める。
- DEC-008「ワークスペース所属を前提にする」はデータ・認可境界として維持する。個人利用者にworkspace設定を初回UIで要求する意味には解釈しない。
- DEC-037等の既存価格契約は変更しない。課金公開順と商品仮説をDeferred/再検証とするだけで、価格自体を変更する場合は既存ADR・decision-log・環境変数・テストを同じ変更単位で更新する。

## Preserves

次はMVP簡素化の対象外とする。

- Cloudflare Access主体検証。
- Worker認可とworkspace固定D1 query。
- tenant越境拒否。
- private R2。
- 入力値・Cookie・Authorization等の非保存。
- SSRF / Browser Run egress fail closed。
- 下書きと公開版のデータ整合性。
- Stripe callback / idempotency / Webhook安全契約。
- production、課金、外部公開、secret変更等の既存承認境界。

## Consequences

- Guide Me、スマホ表示確認、詳細分析、コメント、通知、複数export形式、高度なTeam UI、AI等は初回商用MVPのブロッカーではなくなる。
- Product Discoveryとオンボーディング改善が技術移行と同等のDelivery対象になる。
- 将来機能の安全契約は、機能を有効化する段階でDeep Gateを必須にする。
- 既存の履歴・安全設計は削除せず、Product優先度と公開順を再整理する。
