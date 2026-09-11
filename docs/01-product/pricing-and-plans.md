# 料金プランと利用上限

Status: Accepted

## 現行Product方針

Chrome拡張をMVP唯一のcapture方式にしたため、Browser Run時間・Browser Session同時数を利用者向け料金プランの制限軸から外す。

初期の商品構造は次を第一候補とする。

| Plan | 対象 | Product価値 | capture時間課金 |
|---|---|---|---|
| Free | まず価値を試す個人 | 手順書を作成・保存・共有できる | なし |
| Pro | 継続利用する個人 | より多いmanual、PDF、整理・運用支援等 | なし |
| Team | 複数人で運用するチーム | member、role、共同管理等 | なし |

`BILLING_FEATURE_ENABLED=false` を維持したまま、まずguest作成、output時signup、Second Manual、D7 Retentionまでを検証する。

## Value-first onboardingとの関係

アカウント未作成でもChrome拡張で1本目のローカル下書きを作成・編集できる。

`保存 / 共有 / PDF出力` 等のoutputを選んだ時点でアカウント作成／ログインを要求し、Personal Workspaceへのguest claim後に元操作を続行する。

料金プラン選択やStripe Checkoutを初回価値体験より前に出さない。

## Free

Freeは「デモを見るだけ」ではなく、最初の手順書を完成し、共有できるところまで価値体験できることを優先する。

正式なmanual本数、R2保存量、PDF権等は次を見て課金公開前に固定する。

- 実際のR2/API/export原価。
- Activation Rate。
- Second Manual Rate。
- D7 Creator Retention。
- Free利用者が継続利用で求める価値。

原価実測なしにActivationを阻害するほど低い上限を先に固定しない。

## Pro

Proで購入される価値を「記録できる時間」には置かない。

候補:

- より多い／無制限に近いmanual数。
- PDF出力。
- ブランド表示の調整。
- folder / search等の整理。
- 更新運用を助ける機能。

正式な含有機能と公開価格は初期利用データで決定する。

## Team

Teamはmember invite意図が確認された利用者へ段階的に案内する。

候補:

- 複数creator。
- viewer。
- role管理。
- 共同管理。
- Team向け監査・管理。

初回利用者へ席数やroleを先に理解させない。

## 内部の原価・abuse制御

利用者向け料金軸から外しても、次はserver側で計測・制御してよい。

- R2保存容量。
- API request量。
- export生成量。
- manual / asset数。
- 異常なupload頻度。

通常画面へ複数の技術メーターを常時表示せず、警告・停止・plan判断に必要な情報だけを利用者語彙で表示する。

上限超過による自動課金は行わず、新規利用を安全に停止して次の操作を案内する。

## 課金開始のProduct Gate

Stripeを有効化する前に少なくとも次を確認する。

- guestから最初のlocal draft完成までが実ユーザーで再現できる。
- output gateからsignup、guest claim、保存／共有まで完遂できる。
- 2本目を作成する利用者が存在する。
- Proで購入される価値を技術制限解除以外で説明できる。
- Teamのmember invite意図が実際に観測されている。
- Free上限を原価または商品価値で説明できる。

Product Gateは既存Stripe Security Gateを置き換えず、追加条件とする。

## Stripe技術契約

課金を有効化する場合は、次の安全契約を維持する。

- Stripe Checkout SessionsとLinkを使う。
- 固定Payment Link URLをentitlement付与に使わない。
- checkout intentを推測不能にし、`client_reference_id`へ使用する。
- 課金確定は署名検証済みWebhookのみ。
- 同一購入操作の再送・応答消失・並行送信で同じSessionを返せるidempotency keyを使う。
- Linkのメールやログイン状態をアプリ認証・workspace認可に使わない。
- 返金、chargeback、未払い、解約でmanualを即時削除しない。

## 過去のoffer契約

以下は過去にAcceptedされた技術契約であり、現行MVPの公開offerではない。ADR-0033によりProduct Roadmap上はDeferredまたは価格再評価対象とする。

| 旧offer | offer code | 旧候補価格 | 現在の扱い |
|---|---|---:|---|
| 都度払い | `single_export` | 550円 / 1マニュアル | Deferred |
| パーソナル | `personal_monthly` | 3,300円 / 月 | Pro価格候補として再評価 |
| チーム | `team_monthly` | 9,900円 / 月 | Team価格候補として再評価 |

旧`single_export`契約では購入日から30日間の再出力を想定していた。この契約は履歴として保持するが、単発購入需要が確認されるまでMVP実装・公開の完了条件にしない。

## 旧offerを再導入する場合の安全条件

- 購入権を対象workspace/manualへ固定する。
- WebhookでPrice、支払状態、checkout intentを照合する。
- 重複・順不同・結果不明で二重entitlementを作らない。
- 返金後に既にユーザー端末へ保存された成果物を遠隔削除できるものとして扱わない。

## 変更管理

価格、Free上限、Pro/Team含有機能、席数、single_export再導入を変える場合は、ADR、decision-log、課金ハーネス、環境変数台帳、受入条件を同じ変更単位で更新する。

Stripe側の外部設定変更は文書変更とは別に既存の明示承認境界へ従う。
