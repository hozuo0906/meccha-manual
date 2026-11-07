# ADR-0034: D1共有リンクの不変snapshotと短期grant

Status: Accepted

Date: 2026-09-26

## 決定

保存済み手順書を共有するときは、owner/admin/editorが明示確認した下書きのrevisionとcontent versionをCASで照合し、同じD1 batchで新しいimmutable published revision、step、share linkを作成する。下書きの以後の編集は公開snapshotへ反映しない。既存の有効リンクがある手順書は、先に明示停止するまで再発行しない。

管理APIは既存のAccess保護下に置き、共有viewerと匿名APIは `/s/` 配下だけに集約する。未知の `/s/*` は404にする。viewerはread-onlyで、発行時に有効期限と12〜128 code pointのpasscodeを必須にする。期限は最大30日とし、UIは7日を明示値として送信する。閲覧grantは最大15分またはshare期限の早い方までとする。

## 秘密値と再検証

tokenとgrantは256 bitの乱数をクライアントまたはWorkerで生成し、D1にはSHA-256 digestだけを保存する。生tokenをpath、query、ログ、Markdownへ保存せず、viewerのfragmentからbody/headerへ移す。passcodeはsalt付きPBKDF2-HMAC-SHA-256（100,000 iterations、256 bit）で保存し、入力は保存せず、誤passcode・未知token・期限切れを同じ拒否結果へ正規化する。

本文と各asset requestは毎回、grant、share expiry/revocation、manual、workspace、published revision、発行者のactive membershipを再検証する。R2はprivate bindingをWorkerがproxyし、公開bucketやsigned read URLを発行しない。応答はprivate/no-store、Referrer-Policy、CSP、X-Content-Type-Optionsを付け、既に受信済みのbytesを回収できるとは主張しない。

認証試行には専用の `SHARE_AUTH_RATE_LIMITER` を使い、IPとlink単位の有界制限を設ける。bindingがない環境はfail closedとする。発行・停止・再発行はoperation ID、対象link、draft revision、content version、期限を照合し、結果不明の再送や複数タブ競合で別snapshotを作らない。DB triggerでもsource CAS、scope、期限延長禁止、失効取消禁止、published内容不変を強制する。

## 根拠と制約

共有リンクを初期OFFとするADR-0008、公開revisionを不変にするADR-0005、Access/D1/R2境界を定めるADR-0028を具体化する。PBKDF2のruntime確認は同梱workerdのcompatibility date 2026-08-11で実施済みで、staging設定の2026-09-20をローカルで起動できない制約は別途検証記録に残す。production binding、Access policy、remote migration、deployはこのADRの適用範囲に含めない。

## 2026-10-01: 共有閲覧の位置復帰と再検証

共有viewerは目次、現在位置、前後移動、画像の全体表示／200%拡大とパンを提供する。拡大は既に注釈を描画した表示画像を使い、元画像、切り抜き、公開snapshotを変更しない。画像取得とロゴ取得は既存のgrant header付きprivate proxyを維持する。

fragmentは初期読取直後に現在のhistory entryから除去する。token、grant、passcodeはlocalStorage、sessionStorage、history state、queryへ保存せず、認証後は入力欄とtoken変数を消去する。再読込でgrantを復元せず、「元の共有リンクから開き直してください」と案内する。元のリンクとpasscodeで再認証した後だけ、公開snapshotの先頭step UUIDをキーに保存した非機密の手順indexを復帰する。本文、画像、タイトル、秘密値を位置記録へ含めない。storageを利用できない場合も閲覧を妨げない。

別タブへ移るvisibilitychangeとpagehideで本文・拡大dialog・object URLを破棄する。visibility復帰／pageshowでは同じメモリ内grantを使って既存の `POST /s/api/content` を再検証し、成功する前に本文を表示しない。中断された取得・画像decodeの遅い応答は世代照合で破棄する。通信失敗は本文を空にして再確認を案内し、受信済みgrant期限のtimerでも本文・画像を破棄する。期限切れ、共有停止等の権限拒否、画像だけの取得失敗を表示上区別する。ただしserverの401は停止理由を開示しないため、停止を断定せず「共有が停止されたか、閲覧権限を確認できません」と案内する。server側の匿名拒否理由・grant期間・認可条件は変更しない。

回帰は `tests/share-viewer-browser.test.mjs` の20手順、1366／1024／390px、17/20、前後移動、拡大とフォーカス、別タブ復帰、元リンクからの再認証、期限、通信失敗、停止、遅延応答を対象とする。pageshowのBFCache経路は明示的な合成lifecycle eventも使い、実BFCacheへの格納成功とは扱わない。mock APIの実ブラウザ回帰であり、live Access／D1／R2の認可やproduction失効の証拠ではない。実行は既存の公式Chrome CIを使い、ソケット制限環境ではNode／構文検査と区別する。
