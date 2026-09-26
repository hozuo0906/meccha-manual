# ADR-0034: D1共有リンクの不変snapshotと短期grant

Status: Accepted

Date: 2026-09-26

## 決定

保存済み手順書を共有するときは、owner/admin/editorが明示確認した下書きのrevisionとcontent versionをCASで照合し、同じD1 batchで新しいimmutable published revision、step、share linkを作成する。下書きの以後の編集は公開snapshotへ反映しない。既存の有効リンクがある手順書は、先に明示停止するまで再発行しない。

管理APIは既存のAccess保護下に置き、共有viewerと匿名APIは `/s/` 配下だけに集約する。未知の `/s/*` は404にする。viewerはread-onlyで、発行時に有効期限と12〜128 code pointのpasscodeを必須にする。期限は最大30日、未指定時は7日とし、閲覧grantは最大15分またはshare期限の早い方までとする。

## 秘密値と再検証

tokenとgrantは256 bitの乱数をクライアントまたはWorkerで生成し、D1にはSHA-256 digestだけを保存する。生tokenをpath、query、ログ、Markdownへ保存せず、viewerのfragmentからbody/headerへ移す。passcodeはsalt付きPBKDF2-HMAC-SHA-256（100,000 iterations、256 bit）で保存し、入力は保存せず、誤passcode・未知token・期限切れを同じ拒否結果へ正規化する。

本文と各asset requestは毎回、grant、share expiry/revocation、manual、workspace、published revision、発行者のactive membershipを再検証する。R2はprivate bindingをWorkerがproxyし、公開bucketやsigned read URLを発行しない。応答はprivate/no-store、Referrer-Policy、CSP、X-Content-Type-Optionsを付け、既に受信済みのbytesを回収できるとは主張しない。

認証試行には専用の `SHARE_AUTH_RATE_LIMITER` を使い、IPとlink単位の有界制限を設ける。bindingがない環境はfail closedとする。発行・停止・再発行はoperation ID、対象link、draft revision、content version、期限を照合し、結果不明の再送や複数タブ競合で別snapshotを作らない。DB triggerでもsource CAS、scope、期限延長禁止、失効取消禁止、published内容不変を強制する。

## 根拠と制約

共有リンクを初期OFFとするADR-0008、公開revisionを不変にするADR-0005、Access/D1/R2境界を定めるADR-0028を具体化する。PBKDF2のruntime確認は同梱workerdのcompatibility date 2026-08-11で実施済みで、staging設定の2026-09-20をローカルで起動できない制約は別途検証記録に残す。production binding、Access policy、remote migration、deployはこのADRの適用範囲に含めない。
