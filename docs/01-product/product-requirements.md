# 機能要件

Status: Accepted

## プロダクト原則

- 主役は文書ではなく、業務を完了できる手順。
- 最初の価値は `Chrome拡張で操作を記録 -> 下書きを生成 -> 編集 -> 共有` を短時間で完了できること。
- 個人利用開始時は内部ワークスペースを自動準備し、利用者へ管理概念を先に要求しない。
- 公開URLは正式な共有正本。PDF等のexportは補助出口。
- 操作記録の第一方式はChrome Extension Manifest V3とする。
- 初期状態で外部AI APIを呼ばない。
- 将来要件がAcceptedであっても、Launch優先度がDeferredなら初回商用MVPの完了条件にしない。

## Launch優先度

- `MVP`: 初回価値提供に必要。
- `NEXT`: MVPのActivation・継続利用が確認できた後に検証する。
- `DEFERRED`: 実利用または顧客要求が確認されるまで詳細化・実装を急がない。

## 要件

| ID | 優先度 | 要件 | 受入条件 |
|---|---|---|---|
| FR-001 | MVP | 招待済みユーザーはCloudflare AccessのメールOTPでログインできる | Access JWTの署名・issuer・audience・期限をWorkerが検証し、ログイン、ログアウト、期限切れ、再認証が動作する。アプリ独自passwordは保存しない |
| FR-002 | MVP | ユーザーは必ずワークスペースに所属する | 個人利用開始時は内部ワークスペースを自動準備し、workspace管理をActivationの前提にしない |
| FR-003 | NEXT | owner/admin/editor/viewerを管理できる | 権限ごとのCRUDがWorker認可とworkspace固定D1 queryで制御され、Accessへ到達できても未所属・停止中は拒否される。MVPでは内部認可境界を維持しつつ高度なロール管理UIを前面に出さない |
| FR-004 | MVP | 手順書を作成、編集、削除、アーカイブできる | 下書きと公開版が混ざらない |
| FR-005 | MVP | 手順を追加、並べ替え、削除できる | 1手順1操作の構造を維持できる |
| FR-006 | MVP | 日本語テンプレ文を生成できる | `［対象］を［操作］します` 形式で生成される |
| FR-007 | MVP | Chrome拡張で現在タブの操作記録を開始・停止できる | Manifest V3を使用し、利用者の明示操作で対象タブだけを記録する。MVPは`activeTab`と`scripting`を中心に最小権限で構成し、広範なhost permissionを既定にしない |
| FR-008 | MVP | 操作イベントを記録できる | クリック、入力完了、遷移、スクロール等が連番で保存され、入力内容そのものは原則保存されない |
| FR-009 | MVP | スクリーンショットを保存できる | private R2 bucketへ保存され、業務assetのreadは毎回Access/D1または有効な共有grantとD1状態を再検証するWorker proxy経由で閲覧する。ブラウザへR2の短期署名read URLを配らず、失効後の新しいrequestとcache reuseを拒否する |
| FR-010 | MVP | 入力値を原則保存しない | password、カード番号、トークン、個人番号、Cookie、Authorizationが保存されない |
| FR-011 | MVP | 操作記録から下書きを生成できる | Chrome拡張の記録終了後、手順書エディタで編集できる下書きが生成される |
| FR-012 | MVP | 共有リンクを作成できる | デフォルトOFFで明示的に有効化でき、無効化できる。期限・パスコードはMVPの公開条件で必要性を再評価する |
| FR-013 | MVP | 未ログイン閲覧ができる | 公開許可された共有リンクのみ閲覧できる |
| FR-014 | NEXT | PDF/Markdown/HTML出力ができる | 日本語、画像、ぼかし、リンクが維持される。初期は利用需要を見てPDFなど1形式から提供してよい |
| FR-015 | DEFERRED | Guide Me風の再生ができる | 対象不一致時は停止し、勝手に進まない |
| FR-016 | DEFERRED | スマホ表示確認ができる | UA、viewport、DPR、touch、colorSchemeを設定できる |
| FR-017 | NEXT | 閲覧分析を記録できる | 閲覧数、完了率、離脱ステップを原イベントから集計できる。MVPではActivation/Share/Second Manual計測を優先する |
| FR-018 | DEFERRED | コメントと古い情報の報告ができる | 手順単位で管理者に通知される |
| FR-019 | NEXT | 短命なStripe Checkout SessionとStripe Linkで購入できる | 課金確定は署名検証済みWebhookのみで、Linkの利用者情報をアプリ認証に使わない |
| FR-020 | DEFERRED | AI拡張口を持つ | 初期OFFで、外部AI APIを呼ばない |
| FR-021 | NEXT | 利用権と上限を適用できる | MVPの価値検証後にFree/Pro/Teamの提供条件を確定し、対象マニュアル、席数、保存容量等の必要な境界をサーバー側で検証する。Chrome拡張による通常capture時間をクラウドブラウザ従量課金の利用者向け制限軸にしない |

## MVPで追加して計測するProduct Event

次は課金・詳細分析より先に計測する。

- signup completed
- extension install completed
- capture started
- capture completed
- draft generated
- first manual completed
- share enabled
- shared manual viewed
- second manual created
- member invite started
- plan upgrade started / completed

イベントには入力値、対象URLの機密query、Cookie、Authorization、スクリーンショット本文を含めない。

## Chrome拡張の重要な制約

- Chrome以外のブラウザは初回MVPの正式サポート外とする。
- 対象タブ以外を継続的に監視しない。
- 利用者の明示操作なしに記録を開始しない。
- SPA、iframe、Shadow DOM、Canvas、複雑なWeb Componentsは代表サイトで互換性を実測する。
- 拡張権限を拡大する場合は、必要性、ユーザー警告、プライバシー影響を再評価する。

## Browser Run

Cloudflare Browser RunをMVPの操作記録要件から外す。将来のサーバー側自動処理で再導入する場合は、SSRF、全通信egress、Live View、外部原価に関する既存安全契約を再度合格条件にする。

## その他の制約

- スマホ表示確認はChrome相当の確認であり、実機保証ではない。
- 課金上限到達時に自動従量課金せず、追加利用を停止して日本語で次の操作を案内する。
