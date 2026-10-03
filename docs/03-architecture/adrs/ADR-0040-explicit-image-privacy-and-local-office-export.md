# ADR-0040: 利用者明示の画像保護と端末Office出力

Status: Accepted

## Office出力の容量境界

flatten後に保持する編集済み画像の合計を64 MiB以下、生成するOfficeアーカイブを80 MiB以下に制限する。ZIP32のentry数、サイズ、offset、中央ディレクトリは範囲検証し、上限超過時は画像を欠落させず、日本語の再試行案内で生成を中止する。

Date: 2026-10-03

## 背景

記録時の自動alias・自動maskは、利用者が何を保存したかを確認しにくく、画像の保護状態と元画像の保持境界を混同しやすい。PDF・クラウド保存・共有に加え、Word／PowerPointも認証後のoutput gateを通す一方、認証済みsessionでは再ログインを求めず、認証前の編集体験は維持する。

## 決定

- 新規記録は画面を自動で置換・黒塗りせず、取得した画像を端末の下書きへ保持する。入力値そのもの、Cookie、Authorization、対象URLの機密部分は操作文・event・metadataへ保存しない。
- 個人情報の置換と黒塗りは、画像編集で利用者が対象範囲を選び、適用結果を確認した明示操作として扱う。手動maskを継続し、mask・注釈・差し替え画像を同じ描画順でflattenする。
- 個人情報置換の氏名・カナは、固定した5組の架空人物候補から選ぶ。既存replacement注釈の既知の架空値は同じ組へ復元し、候補変更時は編集中の氏名・カナ注釈だけを同じ組へ揃える。元値、OCR、対応表、追加metadataは保存しない。rasterへ焼き込み済みの架空人物は自動判定せず、編集画面で候補選択を案内する。
- 失敗画像、処理中画像、要確認画像は出力から黙って省かない。対象画像を最新のannotation・mask・replacement込みでflattenできない場合は出力を中止し、次の操作を日本語で案内する。
- Word／PowerPoint出力は既存output gateの認証・workspace claimを経て、claimの処理で手順書と画像をworkspaceへ保存した後、Office bytesを端末内で一度だけ生成する。Cloudflare Access、workspace claim以外のcloud保存、共有リンク、公開権限変更をOffice生成成功だけで追加実行しない。output intentに `officeFormat=docx|pptx` を保持し、形式、draft fingerprint、期限、送信元を照合して同じ下書きから一度だけ生成する。認証済みsessionでは再ログインを要求しない。出力はsnapshotを作ってから画像を順にrenderし、編集中のfingerprintが変わった場合は生成物を破棄して再試行を案内する。
- claimの`completed`やcloudRefだけでは、閉じたeditorのOffice生成を自動再開しない。認証成功画面で利用者が復帰ボタンを押した場合だけ、同じhandoff／launch／draft fingerprint／形式へ束縛した30秒以内の一回限りreceiptを発行し、editorが既存draft lockで消費してから生成する。receiptのない古いcompleted、期限切れ、形式・fingerprint不一致、別senderからのconsumeは拒否する。
- PDF出力はFR-014の既存output gateを維持する。共有リンクはADR-0008に従いデフォルトOFFで、認証・claim後の明示操作だけで作成する。

## API契約

Office生成器は`buildDocx`または`buildPptx`を呼び、`Uint8Array`を返す。入力は`{title, description, steps}`で、各stepは`instruction`を必須とし、画像がある場合は`{kind: "edited", bytes, mimeType, width, height}`を渡す。`kind: "original"`、原画像fallback、URL取得、元画像metadataの引き渡しは拒否する。ブラウザは生成済みbytesをBlob downloadへ渡すだけで、server APIへ送信しない。

## 帰結と確認

旧alias契約と自動mask前提の文書は履歴としてSupersededにする。0.1.9 native受入では、無加工画像の端末保持、操作文への入力値非収集、手動maskの焼き込み、画像欠落拒否、Office生成bytesのbrowser download、PDF／cloud／shareの認証境界を別々に確認する。原画像と編集済み画像の対応表は保存・ログ・出力へ含めない。
