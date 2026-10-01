# 記録単位の架空値対応契約

Status: Accepted

## 対象

[操作記録基盤API](browser-capture-foundation-api.md)のChrome拡張スクリーンショット境界を、[ADR-0039](../03-architecture/adrs/ADR-0039-recording-value-aliases.md)に従い補足する。同一document内に限る従来のalias範囲を、同一記録内のdocument遷移まで拡張する。

- 意味を判別できた表示値について、同じ記録・同じ種類・完全一致する表示文字列には、DOM要素、画面内位置、出現順序、documentが変わっても同じ架空値とalias IDを割り当てる
- 氏名が一致する場合も値の一致だけを表す。同一人物、同一企業、同一顧客等のentity同定、別種類の値同士の関連付け、表記ゆれの同一視は行わない
- 異なる値には異なる連番を割り当てる。生年月日の架空値も512件の上限内で重複しない。秘密欄は値を読まず固定保護、不明欄は固定サンプル表示と要確認を維持する
- 原文の入力値、selection、focus、input/change/submit、元DOMへ書き込まない。架空値は一時overlayと保存画像・安全な画像metadataだけへ反映する

## 非公開の一時状態

拡張service workerは256-bitのランダム鍵、ランダムnamespace、HMAC→連番の有限割当を専用のchrome.storage.sessionキーへ保存する。通常のcapture sessionとは別に保持し、Chromeの既定TRUSTED_CONTEXTSを維持する。content scriptやページから読み取れる設定へ変更しない。

原文を含むHMAC-SHA256計算はISOLATED worldだけで実行する。入力は種類と表示文字列を曖昧さなく符号化した組であり、原文はservice workerへ返さない。鍵付きdigestと連番は信頼済みservice workerにのみ返し、append-onlyの整合性検証とsession保存を完了してから画像取得へ進む。保存失敗、不正状態、予算超過は画像取得を拒否する。

- 最大512割当、候補文字列は最大4096 UTF-16 code unit。既存の1画像64overlay、DOM走査4096node等の独立予算は緩和しない
- navigation、service worker再起動、一時停止・再開では同じsession状態を利用する
- 記録終了、キャンセル、session削除、新しい記録の開始では一時状態を破棄する。ブラウザ終了時はchrome.storage.sessionの寿命に従う
- chrome.storage.local、復旧journal、IndexedDB draft、画像metadata、操作event、status応答、ログ、handoff、ネットワークには原文、鍵、HMAC、対応表を含めない
- 公開replacements.idはランダムnamespace・種類・連番だけで構成する。別記録は新しいnamespaceと鍵を使う

## 非同期処理中の境界

HMAC計算のawait中は、documentと検査可能なshadow rootのmutationを監視する。入力、変更、スクロール、resize、pagehideも監視し、処理完了時は候補の接続と値の完全一致を再確認する。inputイベントやMutationObserverを発生させないvalue property更新も拒否する。既存のpaint後・capture前後の候補集合、幾何、描画、不透明性の検証は維持する。

## 検証

- tests/extension-record-alias-state.test.mjs: service worker再生成時の保持、終了時の破棄、別記録の分離、append-only・重複・容量検証、公開応答のallowlist、storage.session保存失敗
- tests/extension-record-alias-browser.test.mjs: 実MV3と実captureVisibleTabを使い、異なる2documentと出現順序の逆転で同一値のalias一致、異値の分離、元フォーム値・イベント不変、draftとlocal/statusから原文・鍵・digestが除外されること、新記録のnamespace変更、非同期計算中のproperty変更拒否を確認する
- テストに使う値は合成fixtureのみ。native browser起動が環境制約で失敗した実行は成功と扱わない
