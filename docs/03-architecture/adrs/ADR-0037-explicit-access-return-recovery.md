# ADR-0037: 通常Web遷移からのAccess復帰は明示意図に限定する

Status: Accepted

## Context

`/onboarding/continue` の `sessionStorage` handoff を同じtabで再表示したとき、Web画面の通常hashless navigationだけを根拠に `handoff.access-return` を送ると、Access認証後の復帰と通常の画面遷移を区別できない。fragmentの再付与は対象tabへ状態を戻す副作用を持つため、利用者の復帰意図が確認できない自動遷移からは実行しない。

初回AccessでWeb側JavaScriptが一度も実行されない場合のDEC-092 payloadなしcontent script経路は、このWeb画面の判定より前に必要な初回復帰を担うため維持する。

## Decision

- 通常Web経路では、hashlessページの表示だけで `handoff.access-return` を送らない。
- 保存済みhandoffがあるhashless画面では、「保存を再開する」または結果回収状態の「保存状況を確認する」を利用者が押した場合だけ、既存の固定origin、top-level frame、tab ID、handoff、launch、extension、operation、action、draft fingerprint、元の期限、ready record検証を通してfragment再付与を要求する。
- DEC-092の固定staging `/onboarding/continue` content scriptによる初回Accessのpayloadなし復帰は自動で許可する。tabs、all_urls、Access origin、query payload、本文、画像、credential、共有tokenの境界は追加しない。
- 期限切れ通常handoffの書き込み、期限延長、未確定結果の新operation発行は行わない。`finalize-pending`／`completion-pending`は既存のGET専用結果回収だけを維持し、復帰に失敗してもlocal原本を保持する。

## Consequences

fragment再付与後に旧documentの`hashchange`が`history.replaceState`後へ遅着した場合は、`event.newURL`のfragmentと現在の`location.hash`が一致しないため再読込しない。現在のfragmentと一致するhash-only遷移は従来どおりCTAを無効化して再読込し、遷移先を再検証する。

通常navigationでは復帰副作用が0回になり、明示クリック後だけ既存の検証済み復帰を試行する。初回Accessのnative 302でJSが未実行となる経路は、Web側の明示クリックを要求せずDEC-092のcontent scriptが回収する。

## Verification

controlled regressionでは、fragment復帰後にhashを除去した同一documentへ遅着`HashChangeEvent`を送ってもdocument reloadとclaim副作用が発生せず、その後のbootstrapとD1/R2再取得が完了することを確認する。通常の新しいfragment遷移では従来の再読込と不正fragmentのfail closedを確認する。

実MV3回帰で、初回Accessのnative 302／hashless return、通常hashless navigationの復帰0回、明示クリックによる同一handoff復帰、期限切れ結果回収、claim完了、local原本削除と再読込後状態を確認する。
