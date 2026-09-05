# ADR-0006: Storage bucketはprivateを基本とする

Status: Accepted

## 決定

スクリーンショット、注釈済み画像、PDF/HTML出力、アバターはprivate bucketに保存する。公開手順書でもbucket自体は公開しない。

## 理由

画像には個人情報や社内情報が写る可能性が高く、Storage URLの漏えいはP0リスクになります。

## 影響

- Workerで権限、共有トークン、期限、失効状態を検証する。
- （部分失効）検証後の短期署名URL発行は、即時失効が不要な非業務用途に限る。業務assetのreadは後継ADR-0028のWorker proxy境界で毎回Access/D1または有効な共有grantとD1状態を再検証し、ブラウザへ直接R2 URLを配らない。private bucket方針は維持する。
- 削除時は派生ファイルも削除対象にする。
