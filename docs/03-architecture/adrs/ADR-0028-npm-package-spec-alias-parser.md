# ADR-0028: npm package-spec alias parser候補の選定

- Status: Proposed
- Date: 2026-08-24
- Scope: Issue #130 / PR129 follow-up only

## 背景

PR129ではnpm aliasのpackage-spec semanticsが2 review cycle続けて再発し、standing ruleにより停止した。凍結した親headはd4c46da76dbc7f95bb9f5cc22ea8123380ebf153である。次の実装ではhandwrittenのnpmAliasTargetPackage regexを増築しない。本ADRはread-only候補spikeの記録であり、production scannerへparserを接続しない。

## 候補比較

| 候補 | alias/protocolとinvalid specの扱い | module/licenseの証跡 | 依存とruntimeへの影響 | 判断 |
|---|---|---|---|---|
| npm-package-arg 13.0.2 | npm bundled parserとしてlowercase、uppercase、mixed-caseのnpm: aliasを認識し、alias subSpecのnameとversion/range/tagを公開する。name欠落と不正なscoped targetはrejectする | ISC、CommonJS main（lib/npa.js） | 現在のrepoの依存ではない。exact devDependencyを直接追加すると4つの宣言依存がpackage-lockへ加わるが、Worker/runtime importは不要 | 次のintegration PRの唯一の候補として選定する。exact lockfile更新は次PRで行う |
| 既存handwritten regex | 少数の例はmatchできるが、npm protocol normalization、optional spec、parser error semanticsを所有しない | 外部license/依存なし | lockfile変更はないが、既にbypassが再発した | 却下 |
| package-lock metadataのみ | standard v3のpackageInfo.nameはinstalled target metadataには有用だが、package.jsonのalias declarationやmalformed specをparseできない | parser依存なし | runtime影響なし | package-spec parserではなく、独立したlockfile検査面としてのみ利用する |

npm bundledのnpm-package-arg 13.0.2 metadataをread-only probeした。licenseはISC、CommonJS mainで、依存はhosted-git-info、proc-log、semver、validate-npm-package-nameである。代表入力ではnpm:openai@4.0.0、NPM:openai@4.0.0、npm:openai、npm:@openai/core、npm:openai@^4からalias subSpecのnameを取得でき、npm:とnpm:@openaiはfail closedした。値そのものはspikeの証跡であり、scannerの診断には出力しない。

## 決定

1. 次の小さなintegration PRのpackage-spec parser候補を、exact pinned versionのnpm-package-argだけに固定する。
2. 採用を承認する場合だけ、direct devDependencyを1件追加し、同じPRでpackage-lockを更新してexact dependency treeを記録する。Worker/runtime dependencyやbundle pathには追加しない。
3. parserから取り出すのはalias type、subSpec package name、受理されたversion/tag/rangeという構造fieldだけとし、parser errorはこのcontractでは禁止側へ倒す。
4. standard package-lock v3のpackageInfo.nameとroot dependency declarationは別のscanner入力として保持し、parserで置換しない。
5. npmAliasTargetPackageは拡張せず、採用PRでparser呼出しへ置換する。case、target、spec、invalidのfixtureとpath-only diagnosticsをそのintegration PRへ追加する。

## 境界

production runtime、Worker bundle、SQL/materialized-view handling、migration、AI provider/runtime、deploy、preview access、credential、secret、real data、billing、PC変更は含めない。
