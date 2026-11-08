# Issue #248 横スクロール記録の実MV3回帰

Status: Accepted

Date: 2026-11-08

最終全体検証確認日時: 2026-11-08T19:28:15+09:00（Asia/Tokyo）。

対象: [Issue #248](https://github.com/hozuo0906/meccha-manual/issues/248)。branch `codex/horizontal-scroll-248-20261108`、base `main` / `ec6b8db1b8d66e6df03af88ba7a745442ac8fe6b`。

## 結論と欠けの仕組み

Issue記載の旧判定では、横位置を読んでも閾値判定がdeltaY限定だったため、overflowした表／パネルで横だけ動かした操作を記録できなかった。現行の`apps/extension/content/recorder.js`は記録開始時にdocumentと既存要素の現在位置をWeakMapへseedし、`max(abs(deltaX), abs(deltaY)) >= 80`で判定、絶対値の大きい軸から左右／上下を選ぶ。同量なら縦方向を使い、250msのcoalesceとeventIdで同じ操作をまとめる。横方向判定は`8c873a08b5856b769e95baed184eee6cd76f8743`のrecorderにも存在することをgitで確認した。

下流の`capture/privacy.js`はscroll eventをkind／at／direction／eventIdへ限定し、backgroundの`instructionFor`とsidepanelはleft／rightを日本語の操作文へ変換する。実MV3でこの経路から終了時のIndexedDB local draftまで通り、現行の横スクロール対応は満たせていた。残項は、横方向の実ブラウザ回帰とCIへの接続だった。既存のsource文字列検査、4方向のmerge unit、縦方向のpending-event VM試験だけでは、横スクロールからlocal draftまでの経路を検証していなかった。

## 対応した範囲

- `tests/extension-horizontal-scroll-browser.test.mjs`を追加。既存共通launcherとnative sidepanelのCDP操作パターンを使い、実Manifest V3拡張のactionからactiveTab許可、recorder注入、記録開始、記録終了、editor表示、IndexedDB保存の読取りまで検査する。製品source、権限、capture API、時計、storeは差し替えない。
- 開始前から存在する横長tableのoverflow要素を非ゼロ位置から右／左へ動かし、各操作が1 event・1 stepになることを確認。ページ全体の右／左、要素とページの下／上も確認する。
- 要素／ページの両軸79pxでは追加0件、80pxでは追加1件。斜め移動は横優勢ならright、縦優勢ならdownとなる。250msより長く待った後もcheckpoint／flushの二重記録がなく、計13手順の方向・eventId・順序・日本語操作文が保存されることを確認する。
- eventのkey完全一致、stepの許可key、合成URLのorigin／path／query／fragment・合成入力値・合成secret値・対象label・表の本文canaryの非混入を検査する。これは構造化event／stepの検査であり、現行ADR-0040でraw保持される画像から可視文字が消えるという主張ではない。
- 既存`.github/workflows/extension-privacy.yml`の`extension-privacy` job、`sidepanel` stepへ新テストを接続し、同じ3分timeout内で既存sidepanel試験と直列実行する。最終の必須outcome検査はそのまま適用され、新job、required CI／Latest Review Gateの変更はない。

## 変更しなかった範囲と理由

製品コードと挙動は変更していない。FR-008、NFR-004、AC-026、ADR-0031／ADR-0040、DEC-071、要件トレーサビリティ、capture APIとProduct Eventの既存境界を確認し、仕様変更に伴う契約文書更新は不要と判断した。新しい依存・環境変数・状態・共通モジュールは追加しない。

動的に追加された要素の最初のscrollはbaseline設定だけでstepを作らない。これは[ADR-0031](../03-architecture/adrs/ADR-0031-chrome-extension-first-capture.md)とDEC-071の明示的な現行契約であり、未知の元位置を0と仮定した誤方向の記録を避けるためである。本試験でも初回0件、次の横移動1件を確認する。開始時から存在するoverflowed table／panelでは初回から記録できるため、#248の未修正欠陥とは扱わず、この契約を維持する。動的要素の初回も必ず記録する仕様への拡張は今回の対象外とする。

自動マスキング／自動置換、production反映、Access／D1／R2、Stripe、secret、Chrome Web Store公開は対象外。npm ciと正式レビューの完了判定は監督側へ残す。

## 検証結果

- Node `v24.22.1`。依存未配置だったため、同一package-lockの既設node_modulesをこの作業場所へコピーした。ownership保存失敗後にownershipを保存しないコピーを完了し、Playwright `1.62.1`／TypeScript `7.0.2`／Wrangler `4.121.0`を確認。npm ciは未実行で、CIでのclean installを代替したとは扱わない。
- 単独実MV3: `MECCHA_TEST_CHROME_PATH=/home/hatch/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome node --test --test-reporter=tap tests/extension-horizontal-scroll-browser.test.mjs`。実行`22481`、Google Chrome for Testing `156.0.8078.4`、1/1、fail 0／skip 0、exit 0。
- 検出力確認: `/tmp`の隔離コピーだけ閾値判定をdeltaY限定へ戻して同じテストを実行。実行`79209`、最初の要素横移動で`Scroll did not produce exactly one event`として失敗（1 failed／exit 1）。元の欠陥を検出でき、製品sourceは変更していない。
- CI相当: `MECCHA_TEST_CHROME_PATH=/home/hatch/.cache/puppeteer/chrome/linux-156.0.8078.47/chrome-linux64/chrome MECCHA_TEST_HEADED=1 timeout --signal=TERM --kill-after=10s 3m xvfb-run -a node --test --test-concurrency=1 --test-reporter=tap tests/extension-sidepanel-browser.test.mjs tests/extension-horizontal-scroll-browser.test.mjs`。実行`6833`、Google Chrome for Testing `156.0.8078.47`、4/4、fail 0／skip 0、exit 0、約98秒。新規横スクロール試験と既存sidepanelの画像・navigation・入力focus回帰を同じ3分制限内で確認した。
- 全体`npm run check`: 実行`43559`、exit 0、56段階を完走。Node test summary集計779/779、fail 0／skip 0。Worker 71/71、認証157/157、D1 binding 3/3を含み、最終secret／encodingまで成功した。browser試験は全体checkの対象ではなく、上記単独実行と既存CIジョブで別に検証する。報告書・引き継ぎ確定後の局所検査`53148`もexit 0（docs 156／secret 471／encoding 396／cached・uncached diff）。

先行実行の失敗は上記成功へ合算しない。依存配置前はPlaywright import不可（`39276`）、制限内の初回起動はexit 1（`11360`）、`/opt/meta-chromium`は起動policy必須で拒否（`54874`）、既定launcherは想定revisionのbrowser未配置（`31685`）だった。既設Chrome for Testingの実行可能ファイルを既存launcher設定で指定して単独実行を成功させた。制限内の全体check（`40732`）はD1 binding試験で失敗し、局所検査（`65372`）もsecret検査の`spawnSync git EPERM`が発生した。これらを成功扱いにせず、子プロセスとlocalhost通信が可能な実行`43559`で全体を完走した。

## 未決事項と次のマイルストーン

#248の実装判断に関する未決事項はない。最新headのGitHub CI、npm ci、正式Codex Review、review threadと対象SHAの照合は監督側の次のマイルストーンであり、本報告のlocal成功をその完了証跡へ流用しない。Draft PR作成・full head SHAを指定した`@codex review`依頼まで行い、mergeしない。保存後に担当は終了し、終了後の自律監視・継続実行は登録しない。
