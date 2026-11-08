# ADR-0036: ローカル画像注釈エディタと共有時の焼き込み

- Status: Partially Superseded
- Date: 2026-09-27
- Scope: Issue #264

2026-10-01更新: 注釈のlocal限定と注釈焼き込みの方針はADR-0038により更新した。プライバシーmaskだけを不可逆に安全なbaseへ焼き込み、許可した編集用注釈を認証後に保存する。以下は採用時点の記録を保持する。

## Context

手順書編集では、本文と対応画像を連続して確認し、既存の黒マスクを引き継ぎながら画像へ説明用の注釈を追加できる必要がある。ADR-0035で対象外としていた画像編集の拡張は、この要件により対象へ更新する。

## Decision

- 注釈は拡張機能のlocal draftだけに保存し、正規化座標、有限値、許可色、最大100件、文字500文字の境界を検証する。
- 既存`screenshot.masks`形式を維持し、プレビューとclaim assetは同じCanvas描画順（元画像、注釈、黒マスク）を使う。共有へは焼き込み済みPNGだけを送る。
- claim message、handoff metadata、Cloudflareの本文へ注釈本文・元画像を含めない。旧draftで注釈が未指定または空の場合はcanonical JSONとfingerprintの形を変えない。
- 本文は全手順を安定したarticleとして保持し、目次はscrollspyと明示選択を提供する。編集はnative dialogで行い、取消、Escape、保存失敗、reduced motion、キーボード操作を維持する。

## Consequences

画像編集用のUIモジュールと共通rendererを追加するが、DB、Worker API、権限、新依存は追加しない。旧版拡張へ戻した注釈付きdraftは注釈を表示・焼き込みできないため、注釈付きdraftの保存共有は0.1.6以降で行う。
