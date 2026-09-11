# MVP Product Event契約

Status: Accepted

## 目的

Activation、Time to First Value、Capture Completion、Share、Second Manual、D7 Creator Retentionを一貫した定義で測定する。

本書をMVP Product Eventの名称、発行条件、payloadの正本とし、他文書は本書を参照する。

## 原則

- Product Eventは監査ログ、課金event、業務データの正本にしない。
- 入力値、Cookie、Authorization、スクリーンショット本文、DOM本文、対象ページの機密URL/queryをpayloadへ入れない。
- アカウント作成前のguest contentはanalyticsのためにクラウドへ送らない。
- ゲスト中のProduct Eventは拡張内に一時保持できる。signup完了後にprivacy-safeなeventだけをまとめて送信してよい。
- signupせず離脱したguestについて、内容取得や匿名uploadを追加してまで正確なファネルを作らない。LP / Chrome Web Store等の集計値と分離して扱う。
- eventは冪等なevent IDを持ち、再送で二重カウントしない。
- timestampはclient発生時刻とserver受理時刻を区別する。

## 共通payload

サーバーへ送るProduct Eventは原則次だけを許可する。

- `eventId`: clientで生成する推測困難なID。
- `eventName`: 本書のallowlist値。
- `occurredAt`: client側発生時刻。
- `captureMode`: `pc | smartphone | tablet`。該当しないeventでは省略。
- `orientation`: `portrait | landscape`。該当しないeventでは省略。
- `manualId`: 認証後かつmanualが存在する場合だけ。guest local draft IDを送らない。
- `workspaceId`: 認証後にserverが認可済みcontextから付与する。client申告を信用しない。

email、display name、URL、ページtitle、DOM text、target textをProduct Event payloadへ入れない。

## Event一覧

| event | 発行条件 |
|---|---|
| `onboarding_started` | LPから拡張導入または最初のmanual作成導線を開始した |
| `extension_install_started` | Chrome Web Store等の拡張導入導線を押した |
| `extension_installed` | アプリまたは拡張が導入済み状態を確認した |
| `capture_mode_selected` | PC / smartphone / tabletの表示モードを選んだ |
| `capture_started` | 対象タブで記録開始が成立した |
| `capture_failed` | 記録開始または記録中に継続不能になった。機密を含まない固定error categoryだけを別fieldで許可してよい |
| `capture_completed` | 利用者が記録を終了し、保存可能なlocal captureが成立した |
| `draft_generated` | guest local draftまたは認証済みdraftの生成が完了した |
| `output_gate_opened` | guest利用者が保存・共有・PDF出力等の認証必須操作を選んだ |
| `signup_started` | output gateからセルフサーブ認証を開始した |
| `signup_completed` | human Access actorが検証され、セルフサーブbootstrapが成功した |
| `guest_draft_claimed` | guest local draftのserver claimが完了した |
| `first_manual_completed` | その利用者の最初のmanualがserver側で完成扱いになった |
| `share_enabled` | manualの共有リンク発行が成功した |
| `shared_manual_viewed` | 有効な共有リンクが閲覧された |
| `second_manual_created` | 同じcreatorが2本目のmanualをserver側に作成した |
| `member_invite_started` | creatorがTeam拡張導線を開始した |
| `upgrade_started` | 有料planのCheckout導線を開始した |
| `upgrade_completed` | 署名検証済み課金状態により有料entitlementが有効になった |

## KPI定義

### Activation Rate

分母: `output_gate_opened` に到達したguestまたは既存ログインユーザー。

分子: 対応するmanualが `first_manual_completed` まで到達した利用者。

LP訪問だけを分母にした指標は別途Acquisition Conversionとして扱う。

### TTFV

原則 `capture_started` から `first_manual_completed` までの時間を測る。

拡張インストールを含む初回全体時間は `onboarding_started` からの別指標として保持できる。

### Capture Completion Rate

`capture_started` に対する `capture_completed` の割合。

### Share Rate

`first_manual_completed` または対象manual完成に対する `share_enabled` の割合。

### Second Manual Rate

最初の `first_manual_completed` から7日以内に `second_manual_created` へ到達したcreator割合。

### D7 Creator Retention

初回manual完成後7日目を含む定義済みwindowで、再度manual作成行動を行ったcreator割合。集計windowはanalytics実装前に固定する。

## 保存と重複

- server受理eventは `eventId` で重複排除する。
- event順序だけで業務状態を変更しない。
- server-sideのmanual/share/billing状態と矛盾するeventを業務正本にしない。
- 認証後にguest期間eventをflushする場合、同じevent IDを維持して再送する。

## テスト

- allowlist外eventを拒否する。
- forbidden payload fieldを拒否する。
- 同一event ID再送を二重集計しない。
- guest local data本文がProduct Event APIへ送られない。
- clientがworkspaceIdを差し替えてもserverは認証済みcontextから決定する。
