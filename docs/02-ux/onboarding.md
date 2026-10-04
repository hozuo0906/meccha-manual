# オンボーディング

Status: Accepted

## 目的

初回利用者がアカウント登録や管理概念を理解する前に、実際の手順書を1本作って価値を確認できることを目的とする。

オンボーディングの基本導線は次とする。

`サイトを見る -> Chrome拡張を追加 -> PC/スマホ/タブレット表示を選ぶ -> 操作を記録 -> ローカル下書きを確認・編集 -> 保存/共有/PDF出力を選ぶ -> アカウント作成/ログイン -> 下書きを引き継ぐ -> output完了`

アカウント作成は製品を試すための入口ではなく、作った成果物を残す瞬間の境界に置く。

## 初回導線

1. LPへアクセスする。
2. `無料で手順書を作ってみる` を主要CTAとして表示する。
3. Chrome拡張が未導入なら `Chromeに追加` へ案内する。
4. 拡張導入後、`PC / スマホ / タブレット` の表示モードを選ぶ。
5. スマホ／タブレットでは必要に応じてportrait / landscapeを選ぶ。
6. `記録を始める` を押す。
7. 利用者が普段使っている業務画面を操作する。
8. `記録を終了` すると拡張内でローカル下書きを生成する。
9. タイトル、説明、不要step、並べ替え、マスキングを確認・編集する。
10. 利用者が `保存する`、`共有する`、`PDFにする` 等を選ぶ。
11. この時点で初めて `この手順書を残すためにアカウントを作成しますか？` と案内する。
12. Cloudflare Accessによるセルフサーブ認証を行う。
13. Personal Workspaceを自動準備し、guest draftをclaimする。
14. 認証前に利用者が選んでいたoutput操作を自動で再開する。
15. 完了後に `2本目を作る` を主要な次行動として案内し、必要な場合だけTeam導線を出す。

## ゲスト体験

アカウント未作成でも次を利用できる。

- Chrome拡張導入。
- PC / スマホ / タブレット表示選択。
- 操作記録。
- ローカル下書き生成。
- タイトル・説明編集。
- step削除・並べ替え。
- マスキング確認。

ゲスト状態ではmanual本文とscreenshotをChrome拡張のローカル領域だけに保持し、D1 / R2へ送信しない。

### ゲスト状態でできないこと

- サーバー保存。
- 共有リンクを作成する。
- PDF等のサーバーoutput生成。
- Teamへの引き継ぎ。

Word／PowerPointへの書き出しもoutput gateを通る導線とする。editorの「Officeへ書き出す」から選択した形式を保持してログイン・workspace claimへ進み、認証済みなら再ログインせず編集画面へ戻って生成する。workspace claimに必要なcloud保存は行うが、Office生成成功だけで公開・共有リンク作成・権限変更は自動で開始しない。処理中・失敗・要確認画像がある場合は出力を止め、確認対象と次の操作を日本語で案内する。

これらを選んだ瞬間を `output gate` と呼び、アカウント作成を要求する。

## アカウント作成画面

output gateでは長い登録フォームを表示しない。

表示する内容:

- `この手順書を保存して続ける` 等、利用者が押した目的をそのまま見出しにする。
- `メールで続ける` 等の認証CTA。
- `今は登録しない` でローカル編集へ戻れる導線。
- 「登録しても、いま作った手順書は消えません」の説明。

認証完了後にworkspace作成画面やrole設定画面へ寄り道させない。

## Personal Workspace自動準備

初回セルフサーブユーザーは、検証済みAccess human actorをもとに内部Personal Workspaceを自動準備する。

利用者に初回から次を要求しない。

- workspace名。
- owner/admin/editor/viewerの理解。
- member設定。
- 保存容量の選択。
- entitlementやrevisionの理解。

Team機能を使う時点で必要な管理概念を段階的に開示する。

## Chrome拡張導入画面

初回価値までの主な摩擦点は拡張インストールなので、1画面で目的を理解できるようにする。

表示する内容:

- `Chromeに追加して手順書を作る` の主要CTA。
- 「普段の業務画面をそのまま操作すると、手順書になります」。
- 「記録を開始したタブだけを対象にします」。
- 「入力欄の内容は記録せず、画像でも隠します」。
- インストール後に1クリックで記録へ進める導線。

`activeTab`、`scripting`、Manifest V3等の技術用語は通常利用者へ表示しない。

## 表示モード選択

表示モードは手順書作成前に簡単に選択できるようにする。

- `PC`
- `スマホ`
- `タブレット`

スマホ／タブレットは実機上でChrome拡張を動かす方式ではなく、デスクトップChromeのwindowをレスポンシブviewportへ調整して記録する。

利用者向けには「スマホ表示」「タブレット表示」と表現し、device emulation等の技術語を出さない。

### Orientation

スマホ／タブレットでは必要に応じて次を選択できる。

- 縦向き。
- 横向き。

記録終了、キャンセル、失敗時は元のChrome window位置・サイズへ戻す。

## 記録開始前

最低限伝えること:

- 今から開いている対象タブだけを記録する。
- 入力欄の内容は記録しない。入力欄以外の機密情報は画像に写る場合があるため、画像編集で黒塗りする。
- 記録停止後は継続監視しない。
- スマホ／タブレット表示はレスポンシブ表示の再現であり、実機固有動作と完全一致しない場合がある。

## 記録中

記録中であることを拡張UIで常に明示する。

最低限必要な操作:

- 記録停止。
- 現在の表示モード確認。
- エラー時にどこまで保持できたかの案内。

別タブへ移動しても勝手に記録対象を広げない。

## 記録失敗

エラーは次の順で表示する。

1. 何が起きたか。
2. どこまでローカルに保持されているか。
3. 次に何を試せるか。

無限再試行させず、再読み込み、表示モード変更、手動step追加等の安全な代替を提示する。

## ローカル下書き

下書き生成後は最初から全編集機能を展開しない。

優先操作:

- タイトルを直す。
- 不要stepを消す。
- 説明文を直す。
- 必要箇所をマスキングする。
- 並べ替える。

高度な設定は通常導線外に置く。

ゲスト下書きは拡張を削除したりブラウザデータを削除した場合に復元できないため、ローカル保存であることを必要な場面で説明する。

## Output Gate

output gateの対象:

- 保存。
- 共有。
- PDF出力。
- Teamへの引き継ぎ。

未認証なら認証へ進み、認証済みなら再ログインせずそのまま実行する。保存・共有・PDF・Word・PowerPointの選択形式と下書きのfingerprintを復帰時に照合する。

認証後は `guest draft claim -> 元のoutput` の順で自動継続する。Officeは `guest draft claim -> 元のOffice形式` とし、利用者へ同じボタンをもう一度押させない。

### 共有

共有リンクは安全性を簡素化しない。

- デフォルトOFF。
- 期限必須。
- パスコード必須。
- 権限範囲を明示。
- 無効化可能。

## Activation定義

Activationは次を満たした時点とする。

- local draftを生成・確認した。
- output gateへ進んだ。
- 必要な場合はsignup/bootstrap/claimを完了した。
- 最初のmanualがserver側に確定した。

実際に共有閲覧された場合は `Activated + Shared` として別計測する。

## Product Event

イベント名称・発行条件・payloadは `docs/05-api/product-events.md` を正本とする。本書では独自の別名を作らない。

## Teamへの拡張

個人が価値を得た後にだけTeam機能を開示する。

`1本目完成 -> 2本目作成 -> 共有利用 -> メンバーを招待したい -> Team案内`

4ロール、席数、監査UIを初回体験の中心に置かない。

## B登録UIスライス（実装範囲）

output gateは、編集内容を確認してから保存先の準備画面へ進む。キャンセル時は編集中の値と拡張機能のlocal原本を保持する。

保存先の準備画面へ進む場合、拡張機能は本文・画像・ログイン情報を送らず、256bit相当のhandoff識別子、local draftの参照情報、選択済みactionを保持する。Officeは `officeFormat=docx|pptx` とlaunch単位の準備記録を追加し、認証後の同一tab・同一形式・同一fingerprintだけを復帰させる。owner限定staging配布版のhandoff識別子は`https://meccha-manual-staging.meccha-iiyatsu.com`のURL fragmentにだけ置き、production・preview・localhost等のoriginは拒否する。認証後のWeb画面は、同一タブの`sessionStorage`にhandoffごとの履歴として保持したmetadataから、そのhandoffに紐づく`operationId`だけを同一originの`POST /api/onboarding/bootstrap`へ送る。履歴はA-B-Aの遷移でもhandoffごとに分離し、作成から15分をTTLとする。期限切れmetadataは、`expired` tombstoneの保存に成功した場合に限り再読込後も失効状態として保持し、同じhandoffIdのoperationを再開・再送せず、拡張機能で新しいhandoffを発行して保存をやり直す。保存に失敗した現在ページは操作を停止するが、再読込後の失効状態の耐久性は保証しない。hash-onlyのfragment遷移はCTAを即時無効化して再読込し、遷移先のhandoffを再検証する。本文・画像・下書きはWebの`sessionStorage`へ転送しない。専用WorkerのWeb画面は、信頼済み`APP_ENV`と環境別に固定した`APP_BASE_URL`が一致し、request originも完全一致する場合だけ保存操作を有効化する。production originまたはAccess環境が未準備の限定配布版では保存操作を無効化し、日本語の準備中表示に留める。

 Access認証後の復帰はURL監視に依存せず、通常は同一originのWeb画面が`handoff.access-return` external messageを送る。初回AccessでWeb側JSが一度も実行されない場合だけ、stagingの`/onboarding/continue`に限定したcontent scriptがpayloadなしの内部通知を送り、拡張機能がsenderのtab IDに束縛された未確認handoffを照合する。拡張機能は固定origin・top-level frame・tab ID、handoff ID、launch ID、拡張ID、operation identity、action、draft fingerprint、元の期限、既存ready recordを照合した場合だけ、同じfragmentを最大3回まで再付与する。期限切れでも`finalize-pending`／`completion-pending`の結果回収identityがある場合はGET専用の回収だけを許可し、通常の期限切れhandoffの書き込みは拒否する。別tab、同tabの別navigation、通常のfragment除去、取消済み、完了済み、metadata不一致は復帰として扱わず、認証情報・本文・画像はメッセージや復帰URLへ含めない。Web画面へextension IDやhandoff capabilityをquery／fragmentで追加露出しない。

通常Web経路の送信は、hashlessページを表示しただけでは行わない。同じtabの保存済みhandoffを表示した利用者が「保存を再開する」または「保存状況を確認する」を押した場合だけ送信し、通常navigationの自動復帰は0回とする。初回AccessでWeb側JSが実行されない場合のpayloadなしcontent script経路は自動復帰を維持する。
認証後のWeb画面は同一originの`POST /api/onboarding/bootstrap`へ`operationId`だけを送る。成功表示は保存先の準備完了に限り、手順書が保存・claim・共有されたとは表示しない。401、403、429、503、応答消失ではlocal原本を保持し、metadataがTTL内である限り同じ`operationId`で再試行できる。TTL経過後は再試行せず、拡張機能で新しいhandoffを発行する。

このスライスではguest本文のclaim、画像upload、元のsave/share/PDFの再開、Webから拡張機能への完了通知を実装完了と扱わない。これらはC以降の受入条件である。

## Cクラウド保存スライス

0.1.2の拡張機能は、handoff fragmentに拡張機能IDを添えてstaging Webへ渡す。Webはfragmentを読み取った直後にURLから除去し、extension ID、handoff、operation、claim intent、workspace等のmetadataだけを同一タブのsessionStorageへ保持する。古いextension IDなしhandoffはbootstrapの成功を手順書保存と表示せず、0.1.2の拡張機能からやり直す案内を出す。

認証済みWebは外部messageで拡張機能へ`handoff.prepare`を依頼し、手順書の許可されたtitle／description／stepだけを受け取る。画像は`handoff.asset.start`と順序付き`handoff.asset.chunk`で受け取り、拡張機能内でマスクを焼き込んだPNGだけを同一originのclaim APIへ送る。raw screenshot、capture event、対象URL、credentialは外部message、DOM、URL、Web storage、ログへ複製しない。全asset uploadが成功した後、claim intentの結果を照会できる`finalize-pending`を保存してclaim finalizeを行い、同じoperation・内容fingerprint・asset slotでpendingを安全に再送する。claim完了identityを`completion-pending`へ耐久保存してから削除を試み、削除直前のCASで下書きが変わっていた場合は変更後の下書きを残したまま完了状態を保存する。技術的な保存障害は編集済みとは扱わず、既存の未確定状態（`finalize-pending`または`completion-pending`）を維持して同じidentityを再試行する。通常のCAS成功時だけ下書きを削除し、完了結果の確認後に新しいhandoffを開始できる。

保存後は`/manuals`でworkspace所属の手順書一覧を表示し、選択した手順書を再表示する。編集はowner以上のserver認可を前提に、title／descriptionを表示中versionの`expectedUpdatedAt`で保存する。409の競合時はサーバーの値をフォームへ上書きせず、入力値を保持して再読込を案内する。表示値は`textContent`でDOMへ挿入する。

### D共有出力の限定配布記録

D共有出力の限定配布候補は拡張機能manifest `0.1.3` とする。ゲストの共有出力は認証・claim完了後に対象手順書の共有設定へ戻り、共有リンクを自動作成しない。実Chrome導入と配布反映の状態は、Issue #70および該当PRのlive recordを正本として確認する。

## セキュリティ境界

オンボーディング簡素化を理由に次を弱めない。

- guest contentは認証前にD1/R2へ送らない。
- Access主体検証。
- issuer+subjectを正本とするidentity境界。
- workspace/tenant分離。
- private R2。
- 入力値非保存。
- 共有リンク期限・パスコード・失効。
- ログへのsecret非出力。


### 共有設定UI（D）

認証・guest claim後の共有出力は対象手順書へ戻り、共有リンクの作成は利用者が共有設定で期限・パスコード・作成時点の内容を確認した後にだけ行う。認証やclaimの完了だけでリンクを自動作成せず、再読込後はトークンを復元しない。既存リンクが有効または期限切れの場合は停止を先に行い、作成済みsnapshotは後続の下書き編集から分離する。

### Productログイン画面の状態表示（2026-10-04）

保存先準備後のProductログイン画面は、利用できる認証方法を取得してから表示を確定する。取得中はメール／パスワード入力欄を表示せず、「ログイン方法を読み込んでいます。」と案内する。取得できた認証方法がGoogleまたはChatGPTだけの場合は、対応するボタンとprovider名の案内だけを表示し、メール／パスワード入力欄や不要な区切りを表示しない。2つのproviderが利用できる場合だけ「または」を使う。

認証方法の取得に失敗した場合は、Product sessionが未確認であれば既存のメール／パスワード入力へ戻し、失敗内容と次の操作を画面上で確認できる状態にする。設定済みのproviderがない場合は読み込み中の表示を残さず、「現在利用できるログイン方法がありません。管理者にお問い合わせください。」と案内する。入力フォームを隠している間もエラーメッセージは画面から隠さない。
### Product provider取得失敗時の再試行（2026-10-04）

Product session確認済みの状態で認証方法の取得に失敗した場合は、隠したpasswordフォームや空のprovider欄を残さず、ログイン方法を読み込めなかったことと再試行操作を表示する。再試行成功時はprovider導線だけを復元し、入力値とURLのreturn pathを保持する。古いlogin renderの応答で新しい画面を上書きしない。
