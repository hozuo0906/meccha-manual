# ADR-0029: ファイル種別ごとのprovider marker検査契約を固定する

- Status: Proposed
- Date: 2026-08-24

## Context

PR #145のAzure OpenAI endpoint検査で、JavaScript用のコメント除去を全ファイルへ適用すると、shellなどのURLに含まれる`//`までコメントとして消えることが判明した。結果として、`https://tenant.openai.azure.com`を含む非JavaScriptのproduct fileが検査を迂回できる。PR #145は`acc7dc8b795fe6d2b215fa84e41cbe42da3c33d6`でfreezeし、production scannerの修正は後続Issueへ分離する。

このADRは、後続実装がファイル種別ごとのコメント・文字列境界を守り、診断情報から秘密値を漏らさないための設計だけを固定する。production scanner、fixture、依存追加はこのPRに含めない。

## Decision

### 1. 検査面とfile-kind inventory

拡張子だけでなく、既存のproduct-root、binary判定、generated/vendor除外を先に適用し、対象ファイルを次の契約へdispatchする。除外条件は既存の単一contractを再利用し、検査箇所ごとの散在した除外を追加しない。

| file kind | 代表拡張子 | コメント | 文字列・URLの扱い | parse/lex error |
|---|---|---|---|---|
| JavaScript/TypeScript | `.js` `.mjs` `.cjs` `.jsx` `.ts` `.tsx` | `//`、`/* */` | quote、template、escape内はopaque。`https://`は文字列値として保持 | fail closed |
| JSON/JSONC | `.json`、`.jsonc` | JSONはなし、JSONCだけ許可されたcomment | JSON string内の`//`は常に値 | fail closed |
| shell/env | `.sh` `.bash` `.zsh` `.env` | quote外の`#` | `//`は常にdata。quote内の`#`も値 | fail closed |
| YAML/TOML | `.yaml` `.yml` `.toml` | quote外の`#`（各形式の構文に従う） | quote内およびURLのseparatorは値 | fail closed |
| Markdown/plain | `.md` `.txt` | 文書の本文をcommentとは扱わない | URLを保持し、検査対象のmarkerを隠さない | fail closed |
| HTML | `.html` `.htm` | `<!-- -->` | attribute・text内のURLを保持 | fail closed |
| CSS | `.css` | `/* */` | quote、`url(...)`内のURLを保持 | fail closed |
| extensionless product asset | `_headers`（および将来の既知extensionless file） | 形式固有のcommentを推測しない | URLを保持し、未知形式として安全側に扱う | fail closed |
| unknown/binary | 未知拡張子またはbinary | 推測でstripしない | raw dataを解釈して迂回させない | fail closed |

現行contractのroot-only exclusionは`.github/workflows/business-os-codex.yml`、`scripts`、ADR-0026文書であり、nested exclusionは`node_modules`、`dist`、`build`、`generated`だけである。`vendor`やbinary専用の除外・classifierは現存しないため、このADRで追加しない。除外に一致しないunknown、binary、または形式不正なtextは、正常扱いしてpassさせず、AI禁止ruleの違反側へ倒す。

### 2. comment/string semantics

- JavaScript/TypeScriptだけで`//`をline commentとし、code stateでのみ適用する。quote、template literal、escape、正規表現の境界を文字列値から分離し、URLの`//`を消さない。
- JSON/JSONC、shell/env、YAML/TOMLでは、形式が許すcommentだけをその形式のlexer/parserで認識する。特にshell/envの`https://`の`//`をcomment markerにしない。
- shellではunquoted `#`をwordの先頭でだけcomment開始とし、`value=before#AI_PROVIDER_ENDPOINT`のようなword内の`#`とsuffixはdataとして保持する。`.env`は別grammarとして扱い、採用するdotenv契約のcomment境界をfixtureで固定する。
- Markdown/plain/unknownは汎用のcomment stripperを通さない。source commentの文脈を推測できないため、unknownはfail closedとする。
- comment内のprovider markerは検出しないが、文字列・assignment・mappingなどのdata内markerは検出する。ordinary Azure service hostとsuffix spoofはmatrixでpassを固定する。

### 3. parser/lexerの選定

既存の`pgsql-parser`はSQL AST専用であり、source fileのcomment/string semanticsには転用しない。設計段階で新しいproduction dependencyは追加しない。後続実装は、次のfile-kind dispatcherを入口に、各形式の既存parserまたはsyntax-aware lexerを選定し、license/version/ESM、error behavior、性能、fixture coverageを記録する。

- JavaScript/TypeScript: AST全体の変換ではなく、comment/string/templateを認識するsyntax-aware lexical scanを第一候補とする。
- JSON/JSONC、YAML/TOML: 既存の形式parserが利用可能な場合はparse結果とsource位置を対応させ、未対応またはparse不能ならfail closedとする。
- shell/env、Markdown/plain: 形式固有の最小lexerを使い、未知構文を成功扱いしない。
- generic regexによる全file comment除去、または一つの言語のstripperの全file流用は採用しない。

依存を追加する場合は、後続Issueの小PRで候補比較と実lockfileを先に示し、Worker/runtimeへ不要な依存を接続しない。

### 4. diagnostics and exclusion

違反診断は既存の`rule ID + repo-relative path`だけとする。検出したURL、key、行内容、secret、絶対pathは出力しない。除外は現行contractのroot-only/nested exclusionだけを使い、file-kind dispatch側で意味を変えない。

### 5. production接続前のfixture matrix

このADRではfixtureを追加しない。後続のproduction接続Issueは、次の独立fixture/assertionを必須とする。

| fixture | 期待 | 固定する契約 |
|---|---|---|
| JS/TS comment control | pass | comment内markerは無視 |
| shell URL assignment | fail | `https://*.openai.azure.com`の`//`を保持 |
| JSON string endpoint | fail | string内URLをdataとして検出 |
| YAML endpoint | fail | mapping/string内URLを検出 |
| TOML endpoint | fail | value内URLを検出 |
| env endpoint | fail | assignment value内URLを検出 |
| ordinary Azure service | pass | Cognitive Services等のordinary hostを許可 |
| suffix spoof | pass | `openai.azure.com.attacker.example`等を許可しない誤検出にしない |
| unknown/malformed | fail closed | 推測でpassせずrule/path-only診断 |

### 6. Binary asset classification（Issue #160）

現時点で`apps/**`に存在するbinary product assetは、`apps/brand-site/public/assets/`配下のPNG 2件だけである。inventoryには値、URL、画像内容を記録せず、repo-relative path、拡張子、magic判定だけを証跡にする。fontや他のmediaは現在のinventoryに存在しないが、後続追加時の分類契約を先に固定する。

- known inert media/fontは、許可された拡張子と形式固有magic byteが一致した場合だけ、binary marker scanの対象外としてpassする。対象候補はPNG、JPEG、GIF、WebP、WOFF/WOFF2、TrueType/OpenTypeであり、SVGはtext fileとして扱う。拡張子だけではpassさせない。
- 拡張子とmagic byteのmismatch、unknown binary、archive（zip/tar/gzip等）、executable、config-like binaryはinert扱いせず、`product-source-runtime-config/binary-assets`のruleでfail closedする。`vendor`のような広域directory除外や新しいroot exclusionは導入しない。
- binary判定はread前のmetadataだけで成功扱いにせず、read failure、truncated header、decode/metadata検査failureも同じruleでfail closedにする。後続実装の上限は1ファイル8 MiB、画像decoded pixel 8192×8192以内とし、fontも8 MiB以内とする。上限値超過は内容を診断へ出さずfail closedする。
- diagnosticsは既存どおりrule IDとrepo-relative pathだけとし、magic、bytes、画像値、URL、secret、絶対pathを出力しない。

後続production接続Issueは、既存PNG clean pass、magic mismatch、unknown binary、media拡張子へ改名したtext、archive/executable control、read failure、size/decode上限を独立fixtureで固定する。rollbackはbinary policyを直前のADR/実装headへ戻し、production接続と新しい除外追加を行わない。

### 7. Boundary and recovery

本ADRは設計文書のみを対象にし、PR #145のproduction scanner、既存fixture、Azure markerの実装、binary classifier実装、他DDL、nested manifest、runtime/docs以外の変更を含めない。binary policyはIssue #160としてPR #158 freeze head `c01afebbb6e4d4123e23fada89556ebdbbca3c0c`から分離し、production接続はさらに後続の単一Issueで行う。親は非main feature branchとする。main、production、deploy、DB、credential、実データには接続しない。

## Consequences

- URLの`//`を言語横断のcomment markerとして扱う迂回を防げる。
- unknown・malformed fileを正常扱いしないため、誤ったallowより検査停止を優先できる。
- file-kindごとのlexer/parserとfixtureを後続PRで独立検証できる。
- 本PRではproduction接続を行わないため、ADR承認後も後続Issueの実装・CI証跡が必要である。
