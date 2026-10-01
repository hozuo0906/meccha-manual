# ADR-0031: Chrome拡張を操作記録の唯一のMVP方式にする

Status: Accepted

Date: 2026-09-12

## 決定

`めっちゃマニュアル` のMVP操作記録は、Chrome Extension Manifest V3だけで実現する。

Cloudflare Browser Run / Browser Session / Live ViewはMVPのruntime、料金、利用上限、品質ゲート、オンボーディングから外す。将来必要になった場合も、本ADRを更新またはSupersedeする新しいADRなしに製品runtimeへ再導入しない。

Chrome拡張は、利用者自身が開いているWebページ上で明示的に記録開始したときだけ対象タブへ一時アクセスし、クリック、入力完了、遷移等の手順イベントと必要なスクリーンショットを収集する。

## MVPの権限

- Manifest V3を使用する。
- `activeTab` と `scripting` を中心に必要最小限の権限で設計する。
- 常時すべてのサイトへアクセスする `<all_urls>` 等の広範なhost permissionを既定にしない。
- 利用者の明示操作なしに記録を開始しない。
- 記録対象を開始時の対象タブから別タブへ勝手に拡大しない。
- MVPでは `debugger` permissionを要求しない。
- password、カード番号、token、個人番号等の入力値を保存しない。
- Cookie、Authorization、ブラウザ保存済みcredential、password manager由来情報を取得・送信しない。
- 入力操作は「対象名」と「入力操作が行われた事実」を基本とし、入力内容そのものを手順データへ含めない。
- 記録停止時はcontent script側の記録状態を終了し、不要な一時データを破棄する。

## 記録イベントの完全性と表示由来metadata

click eventのlabelは`button`、`link`、`menuitem`、`select`等の固定semantic値だけを保存し、`aria-label`、関連label、placeholder、本文などページ由来の文字列を保存しない。入力欄は既存の機密判定を先に適用し、入力値と機密metadataをevent／下書きへ複製しない。

### スクリーンショットのマスキング境界 (2026-09-30)

スクリーンショット取得前に、入力欄・編集領域・canvas・iframeとclosed shadow配下の機密画素をopacity maskで隠し、mask検証に失敗した画像は破棄する。mask中に`visibility:hidden`や`display:none`で編集対象を非表示にしてfocus、selection、IME入力を失わせてはならない。closed shadowのtop-layerを含む子孫とmask中に追加された子孫も個別に検証し、`::backdrop`は対象shadow root内の一時styleでopacity maskする。styleの欠落・接続不良・computed opacity不成立はfail closedとし、復元時は拡張が変更したinline styleと一時styleだけを除去する。

画面に表示された個人情報については、入力欄等の既存maskに加えて、スクリーンショット直前に高信頼なDOM候補だけを一時overlayで置き換える。対象はメールアドレス・電話番号・郵便番号の明確な形式と、`氏名／名前／住所／電話／メール`等の意味ラベルに対応する`dt/dd`・`th/td`の表示値に限定し、overlayへは固定のダミー値（例: `山田太郎`、`100-0000`、`03-0000-0000`、`manual@example.invalid`）を描画する。表示viewportと交差する候補だけを対象にし、候補overlayの生成は1回のcaptureにつき64件までに固定する。同一テキスト範囲が複数形式に一致する場合は1つの候補として扱い、郵便番号を電話番号として重ねて処理しない。これは生成数の上限であり、ページ内DOMを一般用途の無制限scannerとして扱う契約ではない。open shadow root内の通常テキストは同じ候補境界で走査し、closed shadow rootは既存のhost全体のopacity maskで保護する。inline要素（空またはdisplay:contentsの可視inline要素を含む）で分割された表示上連続するtext nodeは同じrender boundary内に限り最大128 node・1024文字・256 text rangeの有限候補として連結する。block／br／非表示の境界は連結せず、CSSのwhite-spaceがnormal／nowrapでcollapseする空白・改行は照合用に1つの空白へ正規化して元のDOM offsetへRangeを戻す。pre-lineでは空白・タブをcollapseするが改行は保持し、pre／pre-wrapの改行は保持して連結しない。MutationObserverの一時候補も各text nodeのwhite-space規則を使って同じrender boundaryへ写像し、PIIの不確かな境界や継続が予算を超えた場合はfail closedにする。hidden nodeの本文は候補へ取り込まず、同じ表示位置に続く有限範囲の可視nodeがPIIの継続を示す場合だけfail closedにする。budget境界では次の可視nodeの`@`等の有限markerを併せて確認し、長い単一nodeの末尾からPIIが継続する場合も保存しない。PIIを含まないhidden/help/menu境界は内容を連結せず記録可能とする。単一text nodeの既存検出はこの連結予算とは別に維持する。`aria-hidden`は視覚的な非表示を表さないため、表示中の値は候補に含める。祖先の`opacity: 0`により表示されない値は候補にせず、overlayは背景画像・`background-clip: text`・角丸・影を無効にした不透明な矩形として描画する。overlay自身または祖先の半透明、filter、blend、clip、mask等の影響で不透明に描画できない場合はcaptureをfail closedにする。初期候補が0件の場合もcapture直前までMutationObserverと候補再走査を維持し、DOMまたはopen shadow rootに後から表示された候補を保護できなければfail closedにする。元のDOM文字列・入力値・イベントは変更せず、overlayはcapture後に必ず除去する。overlayの接続状態、対象要素とoverlayの位置、document identityを再検証し、レイアウト変化や復元不能があれば画像を保存せずfail closedとする。OCR、画像内文字、複雑なレイアウト、cross-origin iframeの内容は自動置換の保証範囲外であり、編集画面での手動黒塗り確認を案内する。

実装境界の補足: overlayにはlegacy `clip`を含むCSS paintを適用させず、`clip:auto!important`とcomputed styleを検証する。paint後のcapture前とcapture後の両境界で初期shadow root snapshot、MutationObserver、候補再走査を維持し、初期snapshotにないroot、対象hostの除去、PII候補に関係する追加・除去・文字列・属性変更を検出できない場合は、最終候補が空でもcaptureをfail closedにする。同一mutation batchで追加・除去された可視text nodeがboundedなsplit PIIを形成する場合も、node除去後を含めてfail closedを維持する。observer callback時にrecord targetが空または矩形のない状態でも、追加・除去node自身を最大128 node・1024文字の有限rolling候補として照合し、characterDataのoldValueと変更後valueも別の有限履歴系列で照合する。予算到達で候補を確定できない場合はfail closedにし、hidden本文は読まない。composed-treeの候補存在確認は4096 DOM nodeを別予算として扱い、走査上限超過はfail closedにする。候補overlayの64件上限とは分離し、PII候補を含まない64件超の子nodeに対する無関係なclass変更は許可する。時計や無関係なclass変更など保護候補に関係しないDOM変更は無効化しない。

mutationのnumeric fragment履歴はcapture期間だけ既存privacy mutation state内に保持し、同じrendered parentで実際に隣接する可視nodeだけを連結する。変更後の可視valueはchildListとcharacterDataのrecord種別をまたいで同じ系列として照合し、characterDataのoldValueは別系列で扱う。周囲の空白・句読点および有限の普通文はnumeric coreを含むnodeの判定境界としてだけ扱い、連結時の原文から無条件に除去しない。普通文を含むnodeもnumeric coreがある場合だけ候補へ加え、numeric separatorだけの可視nodeはhyphenまたは空白に限ってbounded sequenceの一部として保持し、それ以外の非numeric separatorでは連結を止める。capture中は同じparentの現在可視textも同じ128 node・1024文字の有限snapshotで確認し、初期から存在したprefixと後続追加の組み合わせを取りこぼさない。予算を超えた未知のmutationはfail closedとし、removeSensitiveMasksで履歴を解放する。

navigationでsession storageとrecovery journalの両方が一時的に失敗した場合は、同じcapture session IDにだけ紐づく一時fallbackへ正規化済みnavigation eventを保持する。後続のstorage書込みまたはfinishでsessionへmergeし、event IDで重複排除してからfallbackを破棄する。service worker終了中のメモリ状態まで永続化する保証はなく、入力値・URL・ページ文字列はfallbackへ含めない。

scrollは記録開始時点のdocumentと既存要素の現在位置をbaselineとしてseedする。開始後に追加された未知要素は最初のscrollで現在位置だけをseedし、そのイベントをstepへ出さず、次の位置差分から方向を記録する。未知baselineを0と推測しないため、動的要素の追加直後の一回目だけは記録対象外となる。

通常のevent送信中はページ離脱を妨げない。`capture:event` のACK待ちは未保存確定とは扱わず、送信失敗が判明して保存成功を確認できないeventだけを再試行可能な保護対象としてbeforeunloadで警告する。再送成功を確認するまで失敗保護を保持し、送信世代を照合して遅着ACKが新しい送信を消さないようにする。retainで保持したpending batchの警告と明示的なサイト自身のbeforeunloadは維持する。

## `externally_connectable` handoff

output時の認証後、guest draftを自社Webアプリへ渡すため、Manifest V3の `externally_connectable` を使用する。

- `externally_connectable.matches` は承認済みの自社app originだけを環境別に列挙する。
- `<all_urls>`、任意domain、wildcard TLDを外部message許可に使わない。
- Webページから拡張へ `chrome.runtime.sendMessage(extensionId, ...)` または `chrome.runtime.connect(extensionId)` で要求する。
- 拡張は `runtime.onMessageExternal` / `runtime.onConnectExternal` で受け、`sender.url` のorigin、message type、schema、handoffId、expiryを検証する。
- 拡張からWebページへcredentialを渡さない。Access JWT、Access cookie、OTPを拡張へ取り込まない。
- guest payloadは認証済みWebページからのrequest/connectionへのresponseとしてだけ返す。拡張から任意Webページへ勝手にpushしない。
- 大きなscreenshotはbounded chunkで渡し、単一巨大messageを前提にしない。
- handoffの詳細はADR-0032と `docs/05-api/guest-onboarding-and-claim-api.md` を正とする。

## PC・スマホ・タブレット表示

スマホ／タブレット向けサイトの手順書作成をMVP必須とする。ただし、Chrome拡張を実行する端末はデスクトップ版Chromeとする。

MVPでは次の表示モードを提供する。

- `PC`
- `スマホ`
- `タブレット`

スマホ／タブレットは、デスクトップChrome上で対象ページのレスポンシブ表示幅を再現して記録する。

### 実現方針

- 記録開始時に表示モードを選択できる。
- スマホ／タブレットでは変更前のChrome window `id`、`left`、`top`、`width`、`height`、`state`をactive capture sessionへ保存する。このrestore情報はManifest V3 service workerのsuspension後も復元できる永続範囲へ保持する。
- 元の`state`がmaximized／fullscreen等の場合も元state／boundsを先に保存し、`normal`へtransitionしてからresponsive target outer boundsを適用する。
- Chrome window APIとページ側の `window.innerWidth / innerHeight` 実測を使い、指定したviewportに近づくよう必要な補正を行う。
- portrait / landscapeを選択可能にする。
- 記録停止、キャンセル、失敗、target tab close時には、保存したoriginal boundsとoriginal stateの両方を復元する。
- 既定presetの具体値はUI実装時に代表端末で検証して固定する。

これはレスポンシブviewportの再現であり、実機iOS / Androidの完全なemulationではない。MVPではUA、DPR、touch event、OS固有レンダリングの完全再現を保証しない。対象サイトがviewportだけでなくUAやtouch capabilityへ強く依存する場合は、画面上でその制約を明示する。

`debugger` / CDPによる完全なdevice emulationは、強い拡張権限を必要とするためMVPでは採用しない。実需要が確認された場合だけ別ADRで再評価する。

## アカウント未作成のゲスト記録

アカウント作成前でも、拡張導入後に1本目の手順書を作成・確認・編集できるようにする。

ゲスト状態では次を守る。

- capture event、スクリーンショット、下書き、編集内容は利用者端末の拡張ローカル領域だけに保持する。
- ゲスト本文・スクリーンショットをD1 / R2へ送信しない。
- 大きな画像を扱うため、ゲスト本文の主保存先を`chrome.storage.local`だけに依存させずIndexedDB等の拡張ローカル永続領域を利用する。
- アカウント未作成でも記録、下書き生成、タイトル修正、説明修正、step削除・並べ替え、マスキング確認まで進められる。
- `保存`、`共有`、`PDF出力`等、サーバー側に永続化または外部出力する操作を選んだ時点でアカウント作成／ログインを要求する。
- 認証完了後は同じ操作をやり直させず、ゲスト下書きを認証済み利用者のworkspaceへclaimして、押していた出力操作を再開する。
- claim成功後はローカルゲスト本文を安全に削除する。結果不明時は二重manualを作らず照合できる設計にする。
- 拡張を削除、ブラウザデータを削除した場合、未登録ゲスト下書きは復元できないことを分かりやすく案内する。

## サーバー境界

認証前のゲスト記録を理由にtenant境界を弱めない。

- 認証済みmanual、asset、shareは既存どおりWorker認可とworkspace固定D1 queryを通す。
- extension ID、client側workspace ID、ローカルdraft IDだけを認証・認可根拠にしない。
- ゲスト下書きclaimは、検証済みhuman Access主体とatomicなPersonal Workspace provisioning後だけ実行する。
- claim token / operation IDは推測困難・短命とし、URLへスクリーンショットや本文を埋め込まない。
- business write APIは認証済みWeb app originからsame-originで呼び、extensionから直接呼ばない。

## 理由

### 原価

Cloudflare Browser Runは無料枠を超えるとブラウザ時間等に応じた変動原価が発生する。利用者の業務操作を記録するためだけにクラウドブラウザ時間を購入することは、MVPの価値に対して不要な原価となる。

Chrome拡張では対象Webアプリ自体は利用者のChrome上で動くため、操作記録のためのクラウドブラウザ利用時間を課金軸にする必要がない。

### 互換性

利用者自身のChromeを使うことで、既存ログイン状態、社内ネットワーク、IP制限、端末認証等の環境と自然に共存しやすい。

### UX

普段使っている業務画面で `記録開始 -> 普通に操作 -> 記録停止` ができ、さらにアカウント登録前に1本目を試せるため、Time to First Valueを短縮しやすい。

## Browser Runの位置づけ

Cloudflare Browser RunはMVPおよび現行Product Roadmapのcapture方式として採用しない。

既存のBrowser Run関連文書、テスト、Issueは履歴・将来検討用の安全契約として残してよいが、featureが無効である限りChrome拡張MVPの開発・公開をブロックしない。

将来サーバー側自動処理などで再評価する場合は、費用対効果と既存egress / SSRF / hard-expiry安全契約を改めて合格させる。

## Supersedes

- ADR-0002の「Chrome拡張を第一方式にしない」決定。
- DEC-005の「Chrome拡張を第一方式にしない」部分。
- FR-016の旧Browser Run mobile preview方式。

## Preserves

- Cloudflare Workers / D1 / R2を認証後のサーバー基盤として利用する方針。
- tenant分離、private R2、入力値非保存、共有失効、production承認境界。
- 通常Web write APIのsame-origin境界とAccess credential非露出。
- Browser Runを将来再導入する場合のSSRF / egress fail-closed原則。

## MVP完了条件

- Chrome Web Store公開前または限定配布環境で、拡張インストールから初回記録開始まで説明なしで進める。
- アカウントなしで `記録開始 -> 複数操作 -> 記録停止 -> ローカル下書き生成 -> 編集` まで完了できる。
- PC / スマホ / タブレットの3表示モードで記録でき、終了・cancel・failure・target tab close時にservice worker suspensionをまたいでも元のwindow bounds／stateへ復元できる。
- `保存 / 共有 / PDF出力` を押した時だけ登録を要求し、認証後にゲスト下書きを失わず同じ操作へ復帰できる。
- Access credentialを拡張へ渡さず、allowlist済み自社app originとのexternal messagingだけでhandoffできる。
- 対象タブ以外を収集しない。
- 入力値・Cookie・Authorizationを保存しないnegative testが通る。
- 初期ICPが利用する代表Webサービスで実用可能性を確認する。
- キャンセル処理は意図を先にsession/recovery journalへ保存し、一時画像削除またはwindow復元の失敗を`cancel_failed`として保持する。service worker再起動後も終了保存へ戻さず、復元可能なら復元を再試行し、削除・復旧情報の終了確認後だけsessionを破棄する。ブラウザ再起動や拡張再読み込みで`storage.session`が失われた場合は、local journalの`cancel_failed`とsession IDからcleanup専用状態を復元し、旧tab/windowの復元・停止は行わず、IDB画像削除とjournal終了だけを再試行する。
- pauseはrecorderのdrain前に`paused`意図をsessionまたはrecovery journalへ保存し、両方が失敗した場合はrecorderを停止しない。停止時のpending batchはページ側でclone保持し、sessionまたはjournalへの保存確認後だけreleaseする。recorderのretain確認が欠落または失敗した場合はbatchを空配列として保存せず、releaseや再注入を行わない。release確認が欠落または失敗した場合も成功扱いにせず、保持中のbatchと再試行可能な状態を維持する。保存ready画像100件または手順200件の上限到達時はrecorderを停止し、既存の`captureLimitReached`をjournalにも保存して再開を拒否する。cancel／上限到達の明示discardだけはpending batchをreleaseする。
