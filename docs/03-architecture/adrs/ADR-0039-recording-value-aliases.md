# ADR-0039: 記録をまたがない値単位の架空値対応

Status: Superseded

Date: 2026-10-01

この決定は[ADR-0040](ADR-0040-explicit-image-privacy-and-local-office-export.md)で更新した。記録時の自動aliasを現行の利用者明示による画像保護契約の正本として扱わない。履歴として参照できるが、0.1.9以降の新規導線・出力判定には適用しない。

## 背景

同一記録内で画面が遷移すると架空値が変わると、記録画像の読み取りと編集が一貫しない。従来のdocument内・DOM対象ベースの割当はこの要件を満たさない。原文対応表の永続保存や人物の自動同定は必要ない。

## 決定

DEC-090の同一document内の対応範囲を、同一記録・同一種類・完全一致の表示値へ拡張する。ISOLATED worldでHMAC-SHA256を計算し、256-bitの記録鍵、ランダムnamespace、最大512件のdigest→連番を信頼済みchrome.storage.sessionへ保持する。原文はページ外へ返さず、鍵付きdigestも公開capture応答に含めない。service worker再起動やnavigation後も同じstateを使う。終了、取消、新規記録で破棄する。

salt付き32-bit fingerprintは割当の識別子に使わない。DOM対象による氏名分離もしない。同じ文字列のalias一致は値の一致であり、同一人物・企業・顧客を推定するものではない。異なる種類の関連付けや表記ゆれの同一視は行わない。新しい記録には独立したnamespaceと鍵を割り当てる。

非同期cryptoの待機中は追加の有限監視を行い、DOM mutation、入力等のinteraction、候補valueのproperty変更をfail closedにする。既存のcapture前後検証は緩和しない。新規権限、ネットワーク送信、外部AI、DB変更は追加しない。

## 帰結と確認

512件の割当または4096文字の値を超えた場合、該当画像は安全に失敗し、操作の記録自体と失敗理由は保持する。記録鍵が失われたブラウザ再起動後に対応を復元しない。公開画像とmetadataには架空値とランダムaliasだけが残る。session内の鍵とdigestは秘密に準じた一時状態であり、ログ、draft、復旧journal、共有やexportから除外する。

実装・試験の正本は[記録単位の架空値対応契約](../../05-api/recording-value-alias-contract.md)。native Chrome回帰とNodeでの状態境界回帰を別々に確認する。
