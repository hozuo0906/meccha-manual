# ADR-0006: Storage bucketはprivateを基本とする

Status: Accepted

## 決定

スクリーンショット、注釈済み画像、PDF/HTML出力、アバターはprivate bucketに保存する。公開手順書でもbucket自体は公開しない。

## 理由

画像には個人情報や社内情報が写る可能性が高く、Storage URLの漏えいはP0リスクになります。

## 影響

- Workerで権限、共有トークン、期限、失効状態を検証する。
- 検証後に短期署名URLを発行する。
- 削除時は派生ファイルも削除対象にする。
