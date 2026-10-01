# ADR-0038: 編集継続・画像差し替え・チーム書式の保存境界

- Status: Accepted
- Date: 2026-10-01
- Scope: 統一編集器の保存前後の継続、画像編集、チームのテーマ色とロゴ

## Context

承認済み統一編集器仕様では、クラウド保存後も同じローカル下書き・選択手順・画像編集を維持し、次の保存で手順書を重複作成しない。クラウドでの画像編集と、チーム書式の共有版への固定も必要になる。

## Decision

- ADR-0032／guest claim契約の「完了後のローカル原本削除」を更新する。完了通知は原本を削除せず、確定したworkspace/manual/revision/content version/更新時刻と保存対象fingerprintだけを付与する。転送中の新しい編集は保持する。
- IndexedDBの下書きと別の拡張storage receiptを併用し、旧オブジェクトの遅いautosaveでも保存先を見失わない。次のprepareは保存先の既存manualを指定する。版情報のない旧receiptはfail closedにし、新規manualを作らない。
- 未確定claimはsave/shareの別や新しい編集fingerprintより先に回収する。元actionは認可・操作identityとして維持し、保存後に希望する移動先だけをrequestedActionとして分離する。draft単位のfinalize gateとsourceCloudRef比較で別タブの二重確定を拒否する。競合した未確定の準備はsupersededにし、旧operationを別targetへ再利用しない。
- `claim_intents`に任意の既存draft targetを固定する。新規claimは従来のPersonal owner限定を維持し、更新claimは対象workspaceのowner/admin/editorのみ。finalizeはrevision CAS、本文・画像参照・結果receiptをD1 batchで一括確定する。結果不明は同一operationで回収する。
- 編集後画像は専用のimmutable upload予約へ保存し、現行stepの参照は変更しない。owner/admin/editor、workspace/manual/revision/actor/operation/期待版/sha256/サイズを固定し、条件付きR2 putとHEAD照合後にreadyにする。既存draft PATCHのCAS成功時だけ参照を差し替える。
- 新規編集画像／ロゴはPNG/JPEG/WebPだけ、署名・container構造・寸法・byte数を検証する。SVG、外部URL、EXIF/XMP/文字metadata、アニメーションは受け付けない。クライアントはCanvasで再描画した安全なrasterを送る。
- チーム設定はowner/adminのみが変更し、active memberが閲覧する。テーマは厳密な`#RRGGBB`、前景はWCAG 4.5:1以上となる黒／白をサーバーで算出する。ロゴは独立したtenant-scopedのprivate objectとする。
- ローカルで指定した色・ロゴはclaim単位の手順書固有snapshotとして移し、チーム全体のpointerは変更しない。logo/versionのsource_claim_idを固定し、claimのactive writer（更新対象manualのeditorを含む）だけが作成する。別claim／manualへの流用をD1でも拒否する。prepareは色とロゴ有無だけ、ロゴ本体はCanvas再描画後のbounded chunkで送る。通常のcloud編集は固有snapshotを保持する。
- 書式はimmutable versionを作り、手順書固有snapshotがない場合は明示的なdraft保存時にチームのversion IDをsnapshotする。共有発行はそのdraftのversion IDを複製する。後のチーム設定変更は既存の共有版へ反映しない。共有ロゴは同じ短期grantと公開revisionの参照で認可する。
- ADR-0036の注釈local限定・注釈焼き込みを更新する。黒マスクは安全なbase rasterへ不可逆に焼き込み、編集用の注釈だけを正規化した`steps[].annotations`として認証後に保存する。元画像／除去できるmaskレイヤーは送らない。公開snapshotは同じbase assetと注釈JSONを固定し、既存の焼き込み済み画像は空の注釈として正直に扱う。外部AI、公開R2、追加ネットワーク権限は導入しない。

## Consequences

### 保存中断と画像undoの追補（2026-10-01）

- 未確定claimの期限切れはWeb/Accessの認証済みstatus GETでactor・workspace・operationを照合し、D1のpendingをexpiredへ原子的に確定してから通知する。遅延したfinalizeは古いserver時刻を持っていてもexpiredを復活できない。
- Webは成功応答のbounded結果を`handoff.expired`へ渡す。拡張は既存の固定origin coordinatorだけを信頼し、handoff/action/claim/operation/fingerprintと保存先workspaceを照合して同じfinalize lock下でexpiredを保存する。独自fetch、認証情報の移送、local clockだけでのpending解除は追加しない。terminal後は原本・新しい編集・既存cloudRefを保持したまま新しい保存／共有を許可する。
- `manual_edit_assets.first_attached_at`は、同じworkspace/manualのstepへ実際に添付された時だけD1 triggerで一度記録する。後の差し替えで参照が消えても、同じmanualの認可済みwriterは過去に保存した画像へ戻せる。未添付ready画像のactor／期待版制限は維持する。rollback、失敗、uploadだけでは添付履歴を作らない。
- 追補はmigration `0007_d1_retained_save_recovery.sql`を使う。既存step（削除済み・公開版を含む）に証拠のある画像だけをbackfillし、過去の参照が全て上書き済みで証拠のない画像は推測で許可しない。

Migration `0006_d1_manual_editor_branding.sql` が必要。migration未適用環境への反映は本作業に含めない。R2とD1を跨ぐatomic transactionはないため、予約を残して同一operationで再照合する。未使用の予約・objectの自動削除は対象外。共有停止・期限切れはロゴを含め全assetへ適用する。

## Verification

`tests/cloud-manual-c.test.mjs`、`tests/manual-raster.test.mjs`、`tests/extension-retained-cloud-draft.test.mjs`、`tests/share-link-backend.test.mjs`で、正常系、再送、並行upload、CAS、D1途中rollback、R2応答不明、tenant／actor／role、改ざん、公開版固定を検証する。ブラウザー実機検証とremote migration適用は別の品質ゲートとする。

## 不可逆黒塗りと注釈の順序

黒塗りを含む画像は、元の「画像→注釈→黒塗り」の順序を維持して一枚の安全なrasterへ統合する。その画像の注釈JSONは送信・共有しない。部分的に隠した文章も元文字列をmetadataから復元できないことを優先する。黒塗りがない画像だけ、注釈を編集可能なmetadataとして保持する。この制約は画像編集器に表示する。
