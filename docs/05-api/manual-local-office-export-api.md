# 端末Office出力契約

Status: Accepted

## 容量とZIP32の境界

flatten後に保持する編集済み画像の合計は64 MiB以下、生成するOfficeアーカイブは80 MiB以下とする。画像またはアーカイブが上限を超える場合は画像を省略せず、日本語で画像を小さくするか手順書を分けて再試行するよう案内する。ZIP32のentry数、各サイズ、offset、中央ディレクトリの値は32-bit範囲を検証し、値の切り詰めで生成を続行しない。

## 対象

[ADR-0040](../03-architecture/adrs/ADR-0040-explicit-image-privacy-and-local-office-export.md)に従い、Chrome拡張のeditorからWord／PowerPointを端末へ生成・保存する境界を定める。ファイル生成は端末内で行うが、選択時は既存output gateの認証・workspace claimを経る。claimによるcloud保存と、Office生成成功だけでは行わない共有リンク作成・公開権限変更を分けて扱う。

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

`buildDocx`／`buildPptx`は生成した`Uint8Array`を返す。ブラウザはOffice MIME typeのBlobを一度だけdownloadし、生成bytes・入力画像・元画像をcloud API、Access、workspace、analyticsへ送信しない。Word／PowerPointボタンは既存output gateから認証・workspace claimへ進み、完了後に選択した形式へ戻る。認証済みsessionでは再ログインを要求しない。

PDFはFR-014の認証・bootstrap・claim後output gateを維持する。Office生成の成功だけでcloud保存、公開、共有リンク作成、公開権限変更を行わない。認証済みhandoffの形式・fingerprint・期限・送信元を照合し、一度だけ同じ下書きから生成する。共有リンクはデフォルトOFFを維持する。

## 状態と失敗

生成開始時にタイトル、説明、手順順序、画像参照、annotation・maskを含むdraft fingerprintをsnapshotする。画像render中または生成前にfingerprintが変わった場合は生成を中止し、古い内容のファイルをdownloadしない。画像decode／flatten／生成の失敗は日本語の失敗理由と再試行操作を表示し、手順や画像を黙って欠落させない。

## 確認

`tests/extension-office-wiring.test.mjs`でUIの認証gate導線、edited画像契約、snapshot変更と画像欠落の拒否を確認する。生成器自身のOOXML、複数画像、長文は専用testで確認し、editor配線は認証済みhandoff stubを通したChrome browser download証跡で確認する。実際のWord／PowerPointアプリでの読込・描画は今回の検証範囲外で未実行と記録する。
