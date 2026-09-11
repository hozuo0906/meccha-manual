# Chrome拡張first MVP受入条件

Status: Accepted

## 目的

Chrome拡張オンリー、PC/スマホ/タブレット表示、guest-first onboarding、output時signupの現行MVP受入条件を一箇所に固定する。

既存 `acceptance-catalog.md` のBrowser Run関連ACは過去契約・将来再導入用として保持できるが、本書の条件を現行MVPのcapture / onboarding Gateとする。

| ID | Given | When | Then |
|---|---|---|---|
| MVP-AC-001 | Chrome拡張未導入のguest | LPから最初のmanual作成を開始する | アカウント登録を先に要求せず、Chrome拡張導入へ進める |
| MVP-AC-002 | 拡張導入済みguest | PC表示で記録を開始する | 利用者の明示操作により現在タブだけが記録対象となり、別タブを勝手に収集しない |
| MVP-AC-003 | 拡張導入済みguest | smartphoneまたはtablet表示を選ぶ | responsive viewportへwindowを調整し、portrait/landscapeで記録でき、終了・取消・失敗時に元window状態へ戻る |
| MVP-AC-004 | guest記録中 | password、カード、token、個人番号、Cookie、Authorization等を扱う | 入力値・秘密値はguest local data、Product Event、D1、R2、ログへ保存されない |
| MVP-AC-005 | guest | 記録を終了する | ローカルだけで編集可能なmanual draftが生成され、D1/R2 writeは0回のまま |
| MVP-AC-006 | guest local draftがある | タイトル・説明・step・並べ替え・マスキングを編集する | アカウント作成なしで編集内容をローカル保持できる |
| MVP-AC-007 | guest local draftがある | 保存、共有、PDF出力のいずれかを選ぶ | 初めてoutput gateを表示し、アカウント作成／ログインを要求する。キャンセルすればlocal draftを失わず編集へ戻れる |
| MVP-AC-008 | 未登録だが検証済みhuman Access actor | self-service bootstrapを実行する | issuer+subjectを正本にidentity/profile/Personal Workspace/active owner membershipをatomicかつ冪等に一度だけ作成する |
| MVP-AC-009 | 同じemailのdisabled/retired identityが存在する | 別subjectまたはemail一致だけでbootstrapしようとする | email一致だけで既存identityを移動・復活・統合せず、安全に拒否または新identity境界として処理する |
| MVP-AC-010 | bootstrap済みactorとguest draft | guest claimを実行する | 同じoperation/fingerprintからmanualを一度だけ作成し、claim確定までlocal原本を消さない |
| MVP-AC-011 | guest claimの応答が失われた | 同operationIdで再試行する | 二重manualを作らず同じ結果を照合・返却する |
| MVP-AC-012 | guestがshareを選んで認証・claim完了 | 共有リンクを発行する | デフォルトOFF、期限、パスコード、権限範囲を設定したlinkだけ発行され、無効化できる |
| MVP-AC-013 | guestがoutput gateでsave/share/exportを選択済み | signup/bootstrap/claimが成功する | 利用者に同じ操作を押し直させず、元のoutputを自動再開する |
| MVP-AC-014 | guest draftがある | 拡張削除またはブラウザデータ削除前の通常利用 | local-onlyであることと削除時に復元不能なことを必要な場面で案内する |
| MVP-AC-015 | smartphone/tablet responsive mode | viewport依存の代表Webサービスを操作する | responsive layoutの主要操作を記録できる。UA/touch/DPR依存で実機と差がある場合は完全再現を主張しない |
| MVP-AC-016 | MVP build | 拡張permissionを確認する | Manifest V3、`activeTab`、`scripting`中心で、`debugger`と常時`<all_urls>`を必須にしない |
| MVP-AC-017 | Product Eventを送信する | guest期間または認証後eventを処理する | `product-events.md` のallowlist/payloadだけを受け、入力値・URL本文・スクリーンショットをanalyticsへ送らない |
| MVP-AC-018 | output時signupを完了したcreator | 7日以内に2本目を作る | Second Manual Rateを一貫したProduct Event契約で集計できる |

## Browser Run legacy ACの扱い

既存 `AC-020`, `AC-022`, `AC-023`, `AC-024`, `AC-025` 等のBrowser Run / egress契約は削除しない。

ただしBrowser Runが製品runtimeで無効な間は、これらのlive実証未完了をChrome拡張MVPのリリースブロッカーにしない。Browser Runを再導入するときだけ再び必須Gateへ昇格する。

## MVP Gate

初回商用MVPは最低限次がすべて成功した場合だけ合格とする。

- MVP-AC-001〜018のうち対象機能の全条件。
- 既存Access/D1 tenant negative test。
- private R2 / share失効。
- guest contentの認証前server write 0件。
- PC / smartphone / tabletでの実Chrome E2E。
- 代表Webサービスでのcapture互換性。
