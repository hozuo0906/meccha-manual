# 2026-08-09 Phase 1認証ライフサイクル

Status: Accepted

## 依頼範囲

Issue #33の認証ライフサイクルについて、テスト、セキュリティ、UIUXの独立レビューを行う。

## 入力前提

- FR-001、AC-001/003/004/005、ADR-0010、API契約を正本とする。
- production反映、外部DB変更、secret変更は行わない。

## 成果要約

- テスト担当は、上流通信例外、偽JSON MIME、正常ログイン/Cookie属性、refresh後の途中失敗に不足を確認した。
- セキュリティ担当は、通常API内のrefresh応答が別タブの新規login後に遅着し、旧ユーザーのCookieへ巻き戻し得るP1を確認した。
- UIUX担当は、未知の非JSON 401を期限切れと誤表示するP1と、日本語入力エラー、初期フォーカス、処理中表示の不足を確認した。
- 第1修正後の再レビューでは、refreshと元要求の再送が同じ排他区間になっておらず、別タブのログイン後に状態変更を別ユーザーとして再送し得るP1を確認した。
- 第2修正後の再レビューでは、同時期限切れ時に待機要求も重複refreshするP2を確認した。
- PR作成後の独立再監査では、Content-Lengthを省略した巨大bodyの全量読込、JSON応答MIME未検証、DOMイベント・並行Lock・入力エラー関連付けの回帰不足をP2として確認した。

## 採用

- refreshを同一originの専用POSTへ分離し、login/logout/refreshを同じWeb Lockで直列化する。
- 初回要求前の認証世代を固定し、refreshと元要求の再送を同じ排他区間で行う。認証世代が変わった状態変更要求は409で中止する。
- lock取得後は現Cookieで元要求を再確認し、まだrefreshが必要な場合だけtokenを更新する。
- 上流通信失敗と資格情報エラーを別コード・別文言にする。
- JSON Content-Typeを正確に検証し、再利用不能なCookieだけ削除する。
- request bodyをbyte上限まで逐次読み込み、認証JSONは16KB、Discord署名bodyは64KBを超えた時点で中止する。
- 認証JSONの`null`、配列、primitiveを400で拒否し、クライアントも`application/json`以外の応答を受理しない。
- 実イベント経路、FIFO Web Lock、同時refresh、ASCII/UTF-8境界、入力エラー関連付け、処理中表示の回帰テストを追加する。
- Worker runtime testと認証UIロジックtestを品質ゲートへ追加する。
- 最終回帰ではWorker runtime 32件、認証UI 22件を含む`npm run check`が成功した。
- 修正後のセキュリティ、テスト、UIUX再レビューはP0/P1/P2すべて0件だった。

## 却下

- 通常GET内でrefreshし、JavaScript側で古い画面更新だけを捨てる案。Cookie適用はJavaScript判定より先に起きるため不十分。
- すべての401を期限切れとして表示する案。中継・上流異常を誤案内するため不採用。

## 未決事項

- 実ブラウザ全体のE2Eと200%ズーム等の横断アクセシビリティ確認はIssue #36/#37で行う。
- 外部Supabase、BroadcastChannel、複数の実ブラウザコンテキストを使う統合確認はIssue #37/#38で行う。

## リスク

- 外部Supabaseを使った動的なログインから再ログインまでの検証はIssue #38の承認対象であり、この変更では実行しない。

## 正式文書への反映先

- ADR-0010
- API契約
- Phase 1 app harness
- テスト戦略
- DEC-042
