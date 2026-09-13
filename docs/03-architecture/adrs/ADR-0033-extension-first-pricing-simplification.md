# ADR-0033: Chrome拡張firstの料金設計をFree / Pro / Teamへ簡素化する

Status: Accepted

Date: 2026-09-12

## 決定

Chrome拡張を操作記録の唯一のMVP方式にしたため、Browser Run時間を利用者向け料金プランの制限軸から外す。

初期の商品構造は次の3段階を正とする。

- `Free`: 価値体験として、手順書を作成・保存・共有できる。
- `Pro`: 継続的に複数の手順書を作成・運用する個人向け。
- `Team`: メンバー招待、共同管理、権限等が必要なチーム向け。

初回商用MVPでは `BILLING_FEATURE_ENABLED=false` を維持し、Activation・Second Manual・D7 Retentionを確認してから課金を有効化する。

## 利用者へ見せない原価制御

R2保存容量、API request量、export生成量等は内部のabuse／原価制御として監視してよい。ただし通常利用者へ複数の技術メーターを常時表示しない。

上限に近づいた場合だけ、利用者が理解できる単位で案内する。

## Free

Freeは「触れるだけ」ではなく、最初の手順書を完成して共有できるところまでを対象にする。

具体的なmanual本数、保存容量、export権は実測原価と初期利用データを見て決める。Activationを阻害するほど低い上限を先に固定しない。

## Pro

Proの価値はBrowser Run分数や単なる技術制限解除ではなく、継続的な手順書運用に置く。

候補例:

- より多い／無制限に近いmanual数。
- PDF出力。
- ブランド表示の調整。
- 高度な整理・検索。
- 更新運用を助ける機能。

正式な含有機能は初期利用データで決める。

## Team

Teamは実際にメンバー招待意図が確認された利用者へだけ案内する。

候補例:

- 複数creator。
- viewer。
- role管理。
- 共同管理。
- Team向け監査・管理。

## 都度払い

`single_export` 550円 / manualの技術契約は履歴として保持するが、現行Product RoadmapではDeferredとする。

単発購入需要が確認されるまで、Checkout導線、manual単位entitlement、30日再出力をMVPブロッカーにしない。

## 価格

3,300円/月、9,900円/月は過去にAcceptedされた価格候補として保持するが、Chrome拡張firstで原価構造が変わったため商用公開価格として確定済みとは扱わない。

価格公開前に、Free→Pro転換理由、Team招待意図、競合価格、R2/API/export原価を見て再評価する。

## Stripe安全契約

本ADRは課金のProduct設計を簡素化するものであり、次を弱めない。

- Stripe Checkout Session。
- Stripe Link。
- 署名検証済みWebhookを課金状態の正本にする。
- checkout intent / idempotency。
- 重複、順不同、結果不明、返金、chargebackの安全契約。
- 課金無効時に新規Checkoutを開始しない。

## Supersedes

- ADR-0023のうち、Browser Run時間をplan制限として利用者へ提供する部分。
- ADR-0023のうち、`single_export` を初回Product Roadmapの主要offerとして扱う部分。
- 料金表上のBrowser Run月次分数を現行商品仕様として扱う決定。

## Preserves

- ADR-0023のStripe Checkout / Link / webhook / idempotency等の技術安全契約。
- 自動従量課金を行わない方針。
- 席数超過や未払いでデータを即時削除しない方針。

## 完了条件

- 利用者向け料金表にBrowser Run時間が存在しない。
- Freeで手順書完成・共有まで価値体験できる。
- Pro / Teamで何に支払うかを利用価値で説明できる。
- single_export未実装がMVP公開をブロックしない。
- Stripe有効化前にProduct Gateと既存Security Gateの両方を通す。
