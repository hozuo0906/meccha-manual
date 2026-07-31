# Browser Runtime

Status: Accepted

## 目的

Cloudflare Browser Runを使い、利用者が対象サイトをクラウドブラウザ上で操作し、その操作を手順書の下書きへ変換する。

## セッション状態

| 状態 | 説明 | 終端 |
|---|---|---|
| `created` | DBに作成済み、Browser未起動 | no |
| `starting` | Browser Run起動中 | no |
| `ready` | Live View発行可能 | no |
| `recording` | 操作記録中 | no |
| `paused` | 一時停止中 | no |
| `reconnecting` | 再接続待ち | no |
| `stopping` | 終了処理中 | no |
| `completed` | 下書き生成済み | yes |
| `failed` | 復旧不能な失敗 | yes |
| `expired` | 期限切れ終了 | yes |

## Durable Object責務

- Browser Run session IDの管理
- Live View URLの短命発行
- 操作イベントの連番付与
- コマンドの直列化
- 再接続
- idle/timeout終了
- 終了時flush
- 監査ログの発行

## 記録対象

- pointerdown/click
- change/input completion
- submit
- navigation
- scroll summary
- compositionend

記録しないもの:

- パスワード
- 入力値の生データ
- Cookie
- Authorization header
- カード番号
- 個人番号

## SSRF対策

- `http` と `https` のみ許可。
- localhost、private IP、link-local、metadata endpointを拒否。
- DNS rebindingを想定し、リダイレクト後も再検査する。
- `file:`, `data:`, `javascript:` を拒否する。
