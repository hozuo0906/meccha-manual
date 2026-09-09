# ADR-0021 Issueイベント駆動Codex自動実装

Status: Accepted

## 背景

DiscordからGitHub Issueを作成できるようになったが、15分ごとのIssue確認だけでは反応が遅く、何もない時にも確認処理が走る。
ユーザーはPC電源に依存せず、Discord、GitHub、Codex利用枠を使ってクラウド上で開発を進めたい。

## 決定

Issue作成時の即時処理と、Codex自動実装を分離する。

- Issue作成、再オープン、編集時はGitHub Actionsで自動トリアージする。
- トリアージは決定的なNode.jsスクリプトで行い、Codex利用枠を消費しない。
- 自動実装は `approved-for-codex` ラベルが付いたIssueだけを対象にする。
- 自動実装はOpenAI APIキーではなく `CODEX_ACCESS_TOKEN` を使い、ChatGPT/Codex側の利用枠を消費する。
- `approval-required` または `blocked-from-discord` が残るIssueは、`approved-for-codex` が付いていても自動実装全体を停止する。これは危険操作の自動開始を防ぐ既存フィルタであり、通常操作への一律ユーザー承認を意味しない。通常作業の承認判断はDEC-067に従い、自動workflowの危険ラベル停止とは区別する。通常範囲と危険範囲が混在する場合は、親セッションで切り分けてから進める。
- 自動実装はbranchとPR作成までとし、mergeはDiscordボタンから直接実行せず、GitHub上の品質ゲート確認後に行う。商用リリース前はAstra high親PMが対象SHA・依存順・必要な品質ゲートを実証確認すれば通常のmergeにユーザーの都度承認を要せず、商用リリース後はmergeごとにユーザーの事前承認を得る（DEC-067）。初回商用公開、production反映、課金、secret変更、機密情報保存、破壊的操作などの別承認境界は維持する。

## 理由

Issueイベント駆動にすると、ポーリングより反応が速く、不要な定期処理を減らせる。
一方で、Issue本文は外部入力であり、作成だけでCodexを起動すると利用枠消費、prompt injection、危険操作の誤実行につながる。
承認ラベルを明示的なゲートにすることで、クラウド運用の速度と安全性を両立する。

## 影響

- GitHub Actions secret `CODEX_ACCESS_TOKEN` が必要になる。
- `approved-for-codex` ラベルが作業開始の合図になる。
- `issue-intake-monitor` は保険または親セッション向けの整理用途に縮小できる。
- 本番反映、DB migration、課金、AI API、共有リンク公開は従来通り自動実行しない。

## 代替案

### 15分ポーリングを継続

実装は簡単だが、反応が遅く、何もない時にも確認が走る。

### Issue作成だけでCodexを起動

速度は出るが、不要Issue、曖昧な指示、危険操作候補でも利用枠を消費しやすい。

### OpenAI APIキーでCodex Actionを使う

GitHub Actions連携としては素直だが、ユーザー方針の「API従量課金ではなくCodex利用枠を使う」と合わない。

## 検証

- `npm run issue-codex:check`
- `npm run workflows:check`
- `npm run check`
