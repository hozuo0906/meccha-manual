# ADR-0002: システム内クラウドブラウザを第一方式にする

Status: Accepted

## 決定

Chrome拡張を第一方式にせず、Cloudflare Browser Run上で対象サイトをトップレベルページとして開き、Live Viewで操作する方式を採用する。

## 却下案

- 対象サイトを直接iframeに埋め込む。
- HTMLリバースプロキシで書き換える。
- Chrome拡張を必須にする。

## 理由

iframeはX-Frame-Options、CSP、Same-Origin Policyで成立しないサイトが多い。リバースプロキシはCookie、Origin、CSP、Service Worker、WebSocketを壊し、認証情報を代理取得する危険がある。

## リスク

Browser Runはbotとして識別される可能性がある。IP制限、社内DNS、端末認証、ハードウェアキー、bot対策があるサイトは正式サポート外になる可能性がある。
