# 端末Office出力契約

Status: Accepted

## 対象

[ADR-0040](../03-architecture/adrs/ADR-0040-explicit-image-privacy-and-local-office-export.md)に従い、Chrome拡張のeditorからWord／PowerPointを端末へ保存する境界を定める。これはPDF出力、cloud保存、共有リンクとは別のlocal-only操作である。

## 入力

生成器へ渡す値は次の形に正規化する。

```js
{
  title: string,
  description: string,
  steps: [{
    number: number,
    instruction: string,
    image: null | {
      kind: "edited",
      bytes: Uint8Array,
      mimeType: "image/png" | "image/jpeg",
      width: number,
      height: number
    }
  }]
}
```

`steps`は1〜200件とし、各`instruction`は空文字にしない。入力契約に違反した場合は生成器がOfficeファイルを作らず、画面は「手順Nの説明を入力してください」または「手順は200件以内にしてください」と示し、該当手順または手順一覧を修正してから再試行できるようにする。

`title`は空にせず、`instruction`は各手順で必須とする。画像を参照する手順は、現在の下書きに保存されたdata URLをdecodeし、最新のannotation・mask・replacementを`drawScreenshot`でflattenしてからPNG bytesへ変換する。原画像、URL、元画像へのfallback、処理中・失敗・要確認画像の省略は許可しない。画像なしを意図した`none`状態だけ`image: null`を許可する。

## 出力と認証境界

`buildDocx`／`buildPptx`は生成した`Uint8Array`を返す。ブラウザはOffice MIME typeのBlobを一度だけdownloadし、生成bytes・入力画像・元画像をcloud API、Access、workspace、analyticsへ送信しない。Word／PowerPointボタンはログインなしで利用できる。

PDFはFR-014の認証・bootstrap・claim後のoutput gateを維持する。Office生成の成功だけでcloud保存、公開、共有リンク作成、公開権限変更を行わない。共有リンクはデフォルトOFFを維持する。

## 状態と失敗

生成開始時にタイトル、説明、手順順序、画像参照、annotation・maskを含むdraft fingerprintをsnapshotする。画像render中または生成前にfingerprintが変わった場合は生成を中止し、古い内容のファイルをdownloadしない。画像decode／flatten／生成の失敗は日本語の失敗理由と再試行操作を表示し、手順や画像を黙って欠落させない。

## 確認

`tests/extension-office-wiring.test.mjs`でUIのlocal-only導線、edited画像契約、snapshot変更と画像欠落の拒否を確認する。生成器自身のOOXML、複数画像、長文は専用testで確認し、editor配線はSSOなしのChrome browser download証跡で確認する。実際のWord／PowerPointアプリでの読込・描画は今回の検証範囲外で未実行と記録する。
