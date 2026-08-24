# ADR-0028: npm package-spec alias parser候補の選定

- Status: Accepted
- Date: 2026-08-24
- Scope: Issue #134 / PR129 follow-up only

## 背景

PR129ではnpm aliasのpackage-spec semanticsが2 review cycle続けて再発し、standing ruleにより停止した。凍結後の親branchはdesign統合SHA 1ad1204e18afd151246a8eb1a31af1ca183dc70cである。Issue #134ではhandwrittenのnpmAliasTargetPackage regexを増築せず、選定済みparserをAI禁止scannerへ接続する。

## 候補比較

| 候補 | alias/protocolとinvalid specの扱い | module/licenseの証跡 | 依存とruntimeへの影響 | 判断 |
|---|---|---|---|---|
| npm-package-arg 13.0.2 | npm bundled parserとしてlowercase、uppercase、mixed-caseのnpm: aliasを認識し、alias subSpecのnameとversion/range/tagを公開する。name欠落と不正なscoped targetはrejectする | ISC、CommonJS main（lib/npa.js） | exact direct devDependencyとして追加し、実lockfile tree（5新規node package）を固定した。Worker/runtime importはない | 採用し、scannerへ接続する |
| 既存handwritten regex | 少数の例はmatchできるが、npm protocol normalization、optional spec、parser error semanticsを所有しない | 外部license/依存なし | lockfile変更はないが、既にbypassが再発した | 却下 |
| package-lock metadataのみ | standard v3のpackageInfo.nameはinstalled target metadataには有用だが、package.jsonのalias declarationやmalformed specをparseできない | parser依存なし | runtime影響なし | package-spec parserではなく、独立したlockfile検査面としてのみ利用する |

npm bundledのnpm-package-arg 13.0.2 metadataをread-only probeした後、exact 13.0.2をdirect devDependencyへ追加した。実lockfileにはnpm-package-arg、hosted-git-info、lru-cache、proc-log、validate-npm-package-nameだけが追加され、既存semverは再利用された。scannerはalias subSpec.nameだけをknown provider package判定へ渡し、npm: protocolの大文字小文字、target、version/tag/rangeを同一semanticsとして扱う。npm:とnpm:@openaiはfail closedし、診断にはspec値を出力しない。

## 決定

1. exact pinned versionのnpm-package-argをpackage-spec parserとして採用し、AI禁止scannerへ接続する。
2. direct devDependencyを1件だけ追加し、同じPRで実lockfile treeを固定した。Worker/runtime dependencyやbundle pathには追加しない。
3. parserから取り出すのはalias type、subSpec package name、受理されたversion/tag/rangeという構造fieldだけとし、parser errorはこのcontractでは禁止側へ倒す。
4. standard package-lock v3のpackageInfo.nameとroot dependency declarationは別のscanner入力として保持し、parserで置換しない。
5. handwrittenのnpmAliasTargetPackage regexはparser呼出しへ置換した。case、target、spec、invalidのfixtureとpath-only diagnosticsを実装した。

## 境界

production runtime、Worker bundle、SQL/materialized-view handling、migration、AI provider/runtime、deploy、preview access、credential、secret、real data、billing、PC変更は含めない。
