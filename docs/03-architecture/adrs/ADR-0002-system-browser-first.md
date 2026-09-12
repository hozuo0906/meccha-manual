# ADR-0002: システム内クラウドブラウザを第一方式にする

Status: Superseded by ADR-0031

## 旧決定

Chrome拡張を第一方式にせず、Cloudflare Browser Run上で対象サイトをトップレベルページとして開き、Live Viewで操作する方式を採用する。

## Superseded理由

2026-09-12のProduct/Cost再評価で、操作記録の第一方式をChrome拡張へ変更した。

- Browser RunはFree枠を超えると利用時間・同時実行数に応じた外部原価が発生する。
- 本製品の主要体験は、利用者が自分のChromeで行う既存業務操作を記録することであり、クラウド上に別ブラウザを起動すること自体は価値ではない。
- 利用者自身のブラウザを利用すれば、既存ログイン、社内ネットワーク、IP制限、端末認証等との互換性を高められる。
- Browser Run固有のLive View、bot判定、クラウドブラウザ時間課金、egress実証をMVPの必須依存から外せる。

新しい正本は `ADR-0031-chrome-extension-first-capture.md` とする。

## 履歴として保持する旧却下案

- 対象サイトを直接iframeに埋め込む。
- HTMLリバースプロキシで書き換える。
- Chrome拡張を必須にする。

iframe／リバースプロキシを却下した理由は引き続き有効である。Chrome拡張に関する旧却下判断だけをADR-0031で反転する。
