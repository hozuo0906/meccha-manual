# 機能要件

Status: Accepted

## プロダクト原則

- 主役は文書ではなく、業務を完了できる手順。
- 最初の価値は `Chrome拡張を導入 -> PC/スマホ/タブレット表示を選ぶ -> 操作を記録 -> ローカル下書きを生成 -> 編集` をアカウント作成前でも体験できること。
- `保存 / 共有 / PDF出力` 等の成果物を残す操作を選んだ時点でアカウント作成またはログインを要求する。
- 認証完了後はPersonal Workspaceを自動準備し、ゲスト下書きを失わず同じoutput操作へ復帰する。
- 公開URLは正式な共有正本。PDF等のexportは補助出口。
- 操作記録はChrome Extension Manifest V3だけをMVP方式とする。
- 初期状態で外部AI APIを呼ばない。
- 将来要件がAcceptedであっても、Launch優先度がDeferredなら初回商用MVPの完了条件にしない。

## Launch優先度

- `MVP`: 初回価値提供に必要。
- `NEXT`: MVPのActivation・継続利用が確認できた後に検証する。
- `DEFERRED`: 実利用または顧客要求が確認されるまで詳細化・実装を急がない。

## 要件

| ID | 優先度 | 要件 | 受入条件 |
|---|---|---|---|
| FR-001 | MVP | output境界でセルフサーブのアカウント作成／ログインができる | Cloudflare AccessのメールOTP等で人間ユーザーを認証し、Access JWTの署名・issuer・audience・期限をWorkerが検証する。商用MVPでは招待済みユーザーだけに限定せず、検証済みhuman actorのセルフサーブbootstrapを明示routeで許可する。アプリ独自passwordは保存しない |
| FR-002 | MVP | 認証済みユーザーは必ずワークスペースに所属する | 初回セルフサーブbootstrapでは検証済みissuer+subjectを正本としてidentity、profile、Personal Workspace、active owner membershipをWorker認可とworkspace固定D1 query／D1 atomic operationで一度だけ作成する。email一致だけで既存identityを移動・復活させず、workspace管理をActivation前提にしない |
| FR-003 | NEXT | owner/admin/editor/viewerを管理できる | 権限ごとのCRUDがWorker認可とworkspace固定D1 queryで制御され、Accessへ到達できても未所属・停止中は拒否される。MVPでは内部認可境界を維持しつつ高度なロール管理UIを前面に出さない |
| FR-004 | MVP | 手順書を作成、編集、削除、アーカイブできる | 下書きと公開版が混ざらない |
| FR-005 | MVP | 手順を追加、並べ替え、削除できる | 1手順1操作の構造を維持できる |
| FR-006 | MVP | 日本語テンプレ文を生成できる | `［対象］を［操作］します` 形式で生成される |
| FR-007 | MVP | Chrome拡張で現在タブの操作記録を開始・停止できる | Manifest V3を使用し、利用者の明示操作で対象タブだけを記録する。MVPは`activeTab`と`scripting`を中心に最小権限で構成し、広範なhost permissionと`debugger` permissionを既定にしない |
| FR-008 | MVP | 操作イベントを記録できる | クリック、入力完了、遷移、スクロール等が連番で保存され、入力内容そのものは保存されない |
| FR-009 | MVP | 認証後のスクリーンショットを安全に保存できる | 認証後のclaim時にprivate R2 bucketへ保存され、業務assetのreadは毎回Access/D1または有効な共有grantとD1状態を再検証するWorker proxy経由で閲覧する。ゲスト状態ではスクリーンショットをR2へ送らない |
| FR-010 | MVP | 入力値を保存しない | password、カード番号、トークン、個人番号、Cookie、Authorization、password manager由来情報がローカルguest data、DB、Storage、ログのいずれにも保存されない |
| FR-011 | MVP | 操作記録から下書きを生成できる | Chrome拡張の記録終了後、アカウント未作成でもローカルで編集できる下書きが生成される |
| FR-012 | MVP | 共有リンクを作成できる | 認証・guest claim完了後だけ発行できる。デフォルトOFF、期限、パスコード、権限範囲、無効化を持ち、ADR-0008の安全境界を維持する |
| FR-013 | MVP | 未ログイン閲覧ができる | 公開許可された有効な共有リンクのみ閲覧できる |
| FR-014 | NEXT | PDF/Markdown/HTML出力ができる | 日本語、画像、ぼかし、リンクが維持される。初期は需要を見てPDFなど1形式から提供してよい。ゲストがPDF出力を選んだ場合は先に認証・claimを完了する |
| FR-015 | DEFERRED | Guide Me風の再生ができる | 対象不一致時は停止し、勝手に進まない |
| FR-016 | MVP | PC・スマホ・タブレット表示から手順書を作成できる | デスクトップChrome拡張からPC/スマホ/タブレットの表示モードを選び、スマホ/タブレットではレスポンシブviewportを再現して記録できる。portrait/landscapeに対応し、終了・失敗時は元のwindow状態へ復元する。MVPでは実機UA/DPR/touch/OS完全再現を保証しない |
| FR-017 | NEXT | 閲覧分析を記録できる | 閲覧数、完了率、離脱ステップを原イベントから集計できる。MVPではActivation/Share/Second Manual計測を優先する |
| FR-018 | DEFERRED | コメントと古い情報の報告ができる | 手順単位で管理者に通知される |
| FR-019 | NEXT | 短命なStripe Checkout SessionとStripe Linkで購入できる | 課金確定は署名検証済みWebhookのみで、Linkの利用者情報をアプリ認証に使わない |
| FR-020 | DEFERRED | AI拡張口を持つ | 初期OFFで、外部AI APIを呼ばない |
| FR-021 | NEXT | 利用権と上限を適用できる | MVPの価値検証後にFree/Pro/Teamの提供条件を確定し、manual数、席数、保存容量等の必要な境界をサーバー側で検証する。Chrome拡張によるcapture時間を利用者向け課金軸にしない |
| FR-022 | MVP | アカウント未作成でも1本目をローカル作成できる | Chrome拡張のIndexedDB等のローカル領域だけでcapture event、画像、下書き、編集内容を保持し、D1/R2へguest contentを送信しない。`保存 / 共有 / PDF出力` で認証を要求し、認証後は冪等なguest claimで同じ下書きをPersonal Workspaceへ移して元の操作を続行する |

## MVP Product Event

Product Eventの正本は `docs/05-api/product-events.md` とし、名称・発行条件・payloadを他文書で独自定義しない。

最低限次を計測する。

- `onboarding_started`
- `extension_install_started`
- `extension_installed`
- `capture_mode_selected`
- `capture_started`
- `capture_failed`
- `capture_completed`
- `draft_generated`
- `output_gate_opened`
- `signup_started`
- `signup_completed`
- `guest_draft_claimed`
- `first_manual_completed`
- `share_enabled`
- `shared_manual_viewed`
- `second_manual_created`
- `member_invite_started`
- `upgrade_started`
- `upgrade_completed`

イベントには入力値、対象URLの機密query、Cookie、Authorization、スクリーンショット本文を含めない。

## Chrome拡張の重要な制約

- MVPのcapture runtimeはChrome拡張だけとし、Browser Runへfallbackしない。
- Chrome以外のブラウザは初回MVPの正式サポート外とする。
- スマホ/タブレットはデスクトップChrome上のresponsive viewであり、実機Chrome拡張実行を前提にしない。
- 対象タブ以外を継続的に監視しない。
- 利用者の明示操作なしに記録を開始しない。
- SPA、iframe、Shadow DOM、Canvas、複雑なWeb Componentsは代表サイトで互換性を実測する。
- 拡張権限を拡大する場合は、必要性、Chromeのpermission warning、プライバシー影響を再評価する。

## Browser Run

Cloudflare Browser RunをMVPと現行capture Roadmapから外す。将来のサーバー側自動処理等で再導入する場合は別ADRで決定し、SSRF、全通信egress、hard expiry、外部原価に関する既存安全契約を再度合格条件にする。

## その他の制約

- スマホ/タブレット表示はresponsive viewportの確認であり、実機iOS/Android、UA、DPR、touch、OS固有レンダリングを完全保証しない。
- 課金上限到達時に自動従量課金せず、追加利用を停止して日本語で次の操作を案内する。
