# ADR-0031: Chrome拡張を操作記録の第一方式にする

Status: Accepted

Date: 2026-09-12

## 決定

`めっちゃマニュアル` の操作記録は、Cloudflare Browser RunではなくChrome拡張を第一方式とする。

Chrome拡張は、利用者自身が開いているWebページ上で、明示的な記録開始操作を行ったときだけ対象タブへ一時的にアクセスし、クリック、入力完了、遷移等の手順イベントと必要なスクリーンショットを収集する。

操作イベントは既存の手順書生成パイプラインへ渡し、Cloudflare Workers / D1 / private R2をサーバー側の認証・認可・保存基盤として維持する。

## MVPの拡張方式

- Chrome Extension Manifest V3を使用する。
- `activeTab` と `scripting` を中心に、必要最小限の権限で設計する。
- 常時すべてのサイトを読み取る広範なhost permissionをMVPの既定にしない。
- 利用者の明示操作で記録を開始し、対象タブだけを記録対象にする。
- password、カード番号、token、個人番号等の入力値を保存しない。
- Cookie、Authorization、ブラウザ保存済みcredentialを取得・送信しない。
- 入力操作は「対象名」と「入力操作が行われた事実」を基本とし、入力内容そのものを手順データへ含めない。
- 記録停止時はcontent script側の記録状態を終了し、不要な一時データを破棄する。
- サーバーへ送るイベント・assetは認証済み利用者とworkspace境界で検証する。

## 理由

### 原価

Cloudflare Browser Runは無料枠を超えるとブラウザ時間およびBrowser Sessionの同時実行数に応じた原価が発生する。操作記録を利用者ごとにクラウドブラウザで実行するモデルは、利用増加とともに変動原価が増える。

Chrome拡張では、対象Webアプリの実行自体は利用者のChrome上で行われるため、操作記録のためのクラウドブラウザ時間を購入する必要がない。

### 互換性

利用者自身のChromeを使うことで、既存ログイン状態、社内ネットワーク、IP制限、端末認証等の環境と自然に共存しやすい。

### UX

別のLive View画面へ移動するのではなく、普段使っている業務画面で「記録開始 -> 普通に操作 -> 記録停止」ができるため、TTFVを短縮しやすい。

## Browser Runの位置づけ

Cloudflare Browser Runを削除済み機能とは扱わないが、MVPの必須依存から外す。

将来、次のような用途で費用対効果が確認できた場合だけ再評価する。

- サーバー側の自動スクリーンショット生成。
- 定期的な手順の鮮度チェック。
- 自動テストや公開ページ検証。
- 利用者ブラウザを使わないバックグラウンド処理。

Browser Runを再導入する場合は、既存のegress・SSRF・Live View・外部原価に関する安全契約を再度合格条件にする。

## セキュリティ原則

- 拡張機能の権限は最小権限とする。
- 利用者の明示操作なしにページ内容を継続収集しない。
- 入力値、Cookie、Authorization、password manager由来情報を収集しない。
- DOMから取得する文字列は手順生成に必要な範囲へ限定する。
- screenshot送信前にマスキング境界を設計・検証する。
- extensionからAPIへのwriteは認証・CSRF相当境界・workspace認可を経由する。
- extension IDやクライアント申告だけを認証・認可の根拠にしない。

## Supersedes

- ADR-0002の「Chrome拡張を第一方式にしない」決定。
- DEC-005の「Chrome拡張を第一方式にしない」部分。

## Preserves

- Cloudflare Workers / D1 / R2をサーバー側基盤として利用する方針。
- tenant分離、private R2、入力値非保存、共有失効、production承認境界。
- Browser Runを将来利用する場合のSSRF / egress fail-closed原則。

## MVP完了条件

- Chrome Web Store公開前または限定配布環境で、拡張のインストールから初回記録開始まで説明なしで進める。
- `記録開始 -> 複数操作 -> 記録停止 -> 下書き生成 -> 編集 -> URL共有` が実Chrome E2Eで完了する。
- 対象タブ以外を収集しない。
- 入力値・Cookie・Authorizationを保存しないnegative testが通る。
- 初期ICPが利用する代表Webサービスで実用可能性を確認する。
