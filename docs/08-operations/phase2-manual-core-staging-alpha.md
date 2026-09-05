# Phase 2 手順書コア・隔離staging内部alpha受入Runbook

Status: Superseded

実行禁止: ADR-0028、DEC-064、Issue #176により、本書は移行前Supabase/Auth/Postgres/RLS alpha runbookの履歴baselineである。新規資格情報、migration、remote write、live run、staging／内部alpha合格証跡の根拠にしない。後継はIssue #176 M4/M5。

Superseded by [ADR-0028](../03-architecture/adrs/ADR-0028-cloudflare-access-d1.md), [DEC-064](../09-delivery/decision-log.md), and Issue #176 M4/M5。本書はSupabase Auth/Postgres/RLS経路の移行前static preflight・受入観点としてのみ保持し、live実行、staging合格、内部alpha合格には使用しない。

Supabase test user、資格情報、migration、live runを追加せず、`phase2:manual-core:preflight`のPASSをAccess/D1/R2実証へ流用しない。Phase 2の正常系・越境・競合・再送・結果不明・途中失敗・atomic rollbackはIssue #176 M4、実immutable preview分離はM5で再構成する。

## 作成時点の停止状態（2026-08-24 JST）

Issue #92は `open / status:blocked / P0`、Issue #94は `open / status:blocked / P1` のため、本Runbookは実行前の品質ゲートとして保全する。この作成時点では、実Auth/RLS、owner/admin/editor/viewerの4 role、別tenant、anon、Workerから実DBへの統合操作、隔離staging live、`step_targets`のsynthetic fixtureはすべて未実施である。認証、資格情報、remote write、stagingへのlogin、migration適用、deploy、実データ操作は開始しない。Runbook品質PASSをinternal alpha合格やIssue #95完了へ丸めない。

## 目的と判定範囲

Issue #95で、Phase 2手順書コアの「公開版revisionを作成し、次のdraftへ安全に進められる」部分を、owner承認済みの隔離stagingで内部alphaとして実証する。ここで確認するのは、検証用アカウントからWorkerを通して実DBへ到達する認証・認可・tenant境界と、公開・次draft・アーカイブの不変条件である。

本Runbookの合格は、AC-010の部分証跡に限る。authenticated Worker経由で公開版revisionを作成できたことは示すが、未ログインの公開URL閲覧、公開URLの実装、外部公開、共有リンクの提供を示さず、AC-010完了とは扱わない。公開URL境界はIssue #79の対象外であり、Issue #59等の承認済み後続マイルストーンへ引き渡す。

既存文書との役割分担は次のとおりとする。

- `docs/04-data/phase2-manual-core-setup.md`: migrationの適用順、DB制約、RPCの設計正本。alphaの実DB適用承認そのものではない。
- `docs/07-quality/phase2-smoke-test.md`: remote write guard付きのPhase 2 smoke。alphaに必要な4 role、anon、archive、Worker経由の一体証跡までは定義しない。
- `docs/08-operations/environments-and-delivery.md`: 環境分離、候補SHA、staging承認、production非対象の共通ゲート。
- `docs/07-quality/acceptance-catalog.md` と `docs/01-product/requirements-traceability.md`: AC-010と、公開URLを後続へ分離するトレーサビリティの正本。
- `docs/08-operations/observability-and-runbook.md`: 障害時の一般Runbook。本書はPhase 2 alpha固有の受入判定を補う。

## 依存順と開始条件

次の順序を崩さない。前段が未完了なら、隔離stagingへ接続せずBlockedとする。

1. Issue #92のP0がowner承認済みの形で解除されていることを確認する。#95の証跡で#92を迂回、上書き、完了扱いにしない。
2. Issue #94のSQL・CI・最新reviewが完了していることを、同一の最新headに対して確認する。full `npm run check` の証跡が接続断等で完了していない場合は、成功扱いにしない。
3. ownerが、実顧客データを持たない隔離staging、検証専用workspace、検証専用account、必要な短命資格情報の使用を明示承認する。
4. alphaの候補SHAを固定し、workflowが検証するcommitと一致することを確認する。候補SHAはsecretではないため、実値をmanifest、承認記録、実行対象に明示し、三者を照合する。資格情報は記録せず、接続先の実URLとworkspace/accountの実IDは保護manifest内だけで照合し、本書・公開証跡・通知へ転記しない。

owner承認、対象環境、候補SHAの実値、実行者、開始時刻のいずれかを承認記録で確認・照合できない場合、実行しない。

## Preflight（実環境へ接続する前）

Preflightとlive実証を同じ成功ログへ混在させない。Preflightはrepositoryと承認状態の確認だけを行う。

- `npm ci`、`npm run check`、`git diff --check`、docs/harness、sensitive-values、encoding、migration ordering/safetyの最新CI結果が、固定候補SHAで成功している。
- Phase 1の認証・RLS前提、Phase 2 migrationの適用順、publication/archive migrationの前提が静的検査で一致している。
- stagingのschema migration historyが必要なmigrationと一致している。不足・不一致ならalpha内で適用せず停止する。staging migrationはownerの別明示承認、backup/rollbackまたはforward-fix、検証手順が揃った別マイルストーンでのみ行い、production migrationは禁止する。
- Workerの対象SHA、staging Environment、Supabaseの論理環境、database migration履歴の対象が一致し、productionのroute、database、bucket、課金設定へ到達する経路がない。
- liveはmutableなstaging alias/endpointへ暗黙追従しない。保護workflow内で候補SHAに対応するimmutable Worker deployment versionまたは同等のimmutable artifact digestを固定し、live開始直前と終了直後にcandidate SHA・artifact digest・deployment versionの同一性を照合する。途中でversionが変化したら停止する。実URLとCloudflare resource IDは保護manifest内だけに置き、公開証跡へ再掲しない。Preview URLも再掲しない。
- alpha用のowner、admin、editor、viewerの検証アカウントと、別tenantの検証アカウントが準備されている。実ユーザー、実顧客workspace、実業務データは使わない。
- anon roleの拒否を、認証済みCookieやprivileged credentialの代用で検査しない。service role等の特権資格情報は使用しない。
- Workerが直接table DMLを迂回せず、認証・workspace認可・承認済みRPC・実DBの順で処理することを、値を表示しないリクエスト種別と結果codeで記録できる。
- 失敗、timeout、応答消失、返却ID不一致の際に自動再送せず、再取得で結果を照合する既存契約を確認する。
- 公開証跡の出力先が、秘密値、入力値、Cookie、Authorization、接続先の実URL、実ID、Live View URL、個人情報を出力しない設定になっている。候補SHA、artifact digest、deployment version、PASS/FAIL、集合hashは記録できる。

Preflightが一つでも欠ける場合はliveを開始せず、`Blocked: preflight incomplete`として停止する。

## Live実証（隔離stagingのみ）

全操作は検証用workspace/accountだけで行い、値非表示の結果（pass/fail、分類code、件数、状態遷移）だけを証跡に残す。

### 認証・role・tenant・anon

- 検証用owner、admin、editor、viewerがそれぞれ実AuthでWorkerへログインできる。
- owner/admin/editorは同一tenantの承認済みmutationを実行でき、viewerはreadだけが許可されmutationを拒否される。

| resource | same-tenant active member read | viewer | cross-tenant | anon | authenticated direct INSERT・UPDATE・DELETE | approved mutation path | archive後 |
|---|---|---|---|---|---|---|---|
| `manuals` | owner/admin/editor/viewerのcanonical RLS/Worker list/detail readを許可 | read可、mutation拒否 | list/detail/readは0 rowsまたはdeny。存在推測不可 | list/detail/readは0 rowsまたはdeny。全mutation RPC拒否 | owner/admin/editor/viewer全roleでdirect I/U/D拒否 | Worker + SECURITY DEFINER RPC: `create_manual`、draft metadata更新、publish、次draft作成、archive | authenticated direct SELECTと通常Worker取得から非表示。DB row、pointer、内容、`archived_at`、監査を保持 |
| `manual_revisions` | owner/admin/editor/viewerのcanonical RLS/Worker readを許可。publishedは不変 | read可、mutation拒否 | list/detail/readは0 rowsまたはdeny。存在推測不可 | list/detail/readは0 rowsまたはdeny。全mutation RPC拒否 | owner/admin/editor/viewer全roleでdirect I/U/D拒否 | Worker + SECURITY DEFINER RPC: 作成、draft metadata更新、publish、次draft作成。published/supersededの本文更新経路なし | authenticated direct SELECTと通常Worker取得から非表示。DB row、state、pointer、内容、`published_at`を保持 |
| `manual_steps` | owner/admin/editor/viewerのcanonical RLS/Worker readを許可。publishedは変更不可 | read可、mutation拒否 | list/detail/readは0 rowsまたはdeny。存在推測不可 | list/detail/readは0 rowsまたはdeny。全mutation RPC拒否 | owner/admin/editor/viewer全roleでdirect I/U/D拒否 | Worker + SECURITY DEFINERの4 step mutation RPC。draftだけ変更可、publish/next draft/archiveはmanual/revision RPC | authenticated direct SELECTと通常Worker取得から非表示。DB row、step内容、revision pointer、監査を保持 |
| `step_targets` | active manualのrevision権限を継承するcanonical RLS範囲のみ。通常のWorker detailには内部targetを公開しない | 許可されたread範囲のみ、mutation拒否 | list/detail/readは0 rowsまたはdeny。存在推測不可 | list/detail/readは0 rowsまたはdeny。mutation経路なし | owner/admin/editor/viewer全roleでdirect I/U/D拒否 | 専用mutation RPC未実装。alphaでは作成・更新せず、許可経路を捏造しない | authenticated direct SELECTと通常Worker取得から非表示。DB row、target、pointer、contentを保持。owner承認済みsynthetic fixtureが事前存在する場合だけ保護DB assertionでinvariant確認し、なければ未実施としてalpha全体完了にしない |

表のreadは「active所属かつmanualを閲覧できる」canonical RLS/Worker境界を意味し、全role一律拒否ではない。anonとcross-tenant actorはlist/detail/readを0 rowsまたはdenyとし、存在を推測できる情報を返さない。anon用の拒否とauthenticated direct DML拒否は別条件として検査する。`step_targets`のsynthetic fixtureはalpha中にdirect seed、service-role actor代用、専用RPCの仮実装で作成しない。
- owner/admin/editor/viewerのrole判定をUI表示だけで合格にせず、Worker応答と実DBの拒否結果を突き合わせる。

### Worker→実DBの手順書フロー

1. editorがWorker経由で検証用manualとdraftを作成する。
2. editorがWorker経由でdraftへstepを2件以上追加する。追加したstepのうち1件を表示時version付きで更新し、保存済みinstructionを保持できることを確認する。
3. editorがWorker経由でactive step全件を指定して並べ替える。重複・欠落・越境IDは拒否され、成功時の順序だけが再取得結果へ反映されることを確認する。step IDは保護manifest内だけで扱い、公開証跡へ出さない。
4. editorがWorker経由で1件をsoft deleteする。物理DELETEを発生させず、削除stepが通常のactive一覧から除外され、残りのactive stepだけを全件指定した再orderで連番化できることを確認する。表示中draftのcontent versionを再取得する。
5. editorが表示中draftのrevision条件と機密情報確認を添えて公開する。
6. 実DBでmanualがpublishedになり、published revisionのpointerと本文が作成時の値で固定されることを、Workerの再取得結果と突き合わせる。
7. Worker経由で公開版から次のdraftを作成する。metadataとactive stepsが複製されるが、published revisionの本文・タイトル・説明・stepは変化しないことを、公開前後の再取得で確認する。
8. 次draftを編集してもpublished revisionが不変であり、古い期待revision条件では公開・次draft作成が拒否されることを確認する。
9. 検証用manualを表示中の更新時刻条件でアーカイブする。返却manual IDが対象と一致し、`status`と`archived_at`が更新され、再アーカイブとstale `updated_at`/versionは拒否されることを確認する。draft、published revision、step、`step_targets`、revision pointer、内容、target、監査結果は保持され、archive後はauthenticated direct SELECTと通常Worker取得から4 resourceすべてが非表示になることを確認する。`step_targets`のinvariantは、owner承認済みstaging-only synthetic fixtureが事前に存在する場合だけ保護DB assertionで確認する。

直接SQLでだけ成功した結果、repository fixtureだけの結果、Workerを経由しない結果は、alphaの受入証跡に数えない。

## 証跡と合格条件

候補SHAの実値、artifact digest、deployment version、owner承認済み隔離staging、preflight結果、role/tenant/anonのpass/fail、Worker request分類、実DBの状態遷移、公開版不変、次draft複製、アーカイブ保持、監査有無、停止判定をmanifestへまとめる。候補SHAの実値を記録し、資格情報・実URL・workspace/account実ID・個人情報だけを非表示にしたmanifestとする。公開証跡は候補SHA、PASS/FAIL、集合hashに限定する。必要な照合は承認済みworkflowと保護された実行環境内で行う。

次をすべて満たしたときだけ「Issue #95 internal alpha: partial evidence accepted」と判定する。

- 依存順とowner承認が満たされている。
- 固定候補SHAと実行対象が一致している。
- candidate SHA、artifact digest、deployment versionがlive開始直前と終了直後に一致し、途中でmutable alias/endpointのversion変化がない。
- Preflightとlive実証が分離され、最新CIとreviewの未完了を成功扱いにしていない。
- 実Authのowner/admin/editor/viewer、別tenant、anon negativeがすべてpassしている。
- Workerから実DBまでのpublish、次draft作成、公開版不変、archive保持がすべてpassしている。
- 資格情報・実URL・実ID・個人情報を非表示にした証跡に欠落、矛盾、未確認の成功表示がない。候補SHAの実値は非表示にしない。
- AC-010の公開URL閲覧を未実施・非対象として明記している。

## 停止条件と未完了の扱い

次のいずれかに該当した時点でlive実証を停止し、alphaをAcceptedにしない。

- #92 P0が未解除、#94のSQL/CI/latest reviewが未完了、またはcandidate SHAが不一致。
- candidate SHAに対応するartifact digest/deployment versionが固定できない、三者の照合に失敗する、またはlive中にversionが変化する。
- staging schema migration historyが不足・不一致である、またはalpha内でmigrationを適用しようとする。
- production、実顧客、実業務データ、未承認の外部環境、productionまたは実ユーザー資格情報への到達が疑われる。
- owner/admin/editor/viewer、別tenant、anonのいずれかで期待と異なる許可・拒否が発生する。
- Workerを迂回するdirect DML、古いRPC、越境可能なquery、特権資格情報が確認される。
- published revisionが編集・公開・次draft・archiveの前後で変化する、次draftが独立しない、archiveの`archived_at`・返却manual ID・監査・pointer/content保持が確認できない、再アーカイブまたはstale versionが拒否されない。
- 応答消失や不明結果を自動再送した、または同一操作の重複結果を確定できない。
- productionまたは実ユーザー資格情報、入力値、Cookie、Authorization、実URL、実ID、個人情報が証跡へ出力された。
- 公開URL閲覧、外部公開、共有リンク、deploy、migrationの追加適用をこのalphaで開始しようとした。

停止後は、確認できた範囲をBlocked/Failedとして資格情報・実URL・実ID・個人情報を非表示にして記録し、候補SHAの実値と照合結果は保持する。未確認項目を成功へ丸めない。P0/P1は次のmilestoneへ持ち越さず、ownerの判断と正本更新を待つ。P2は担当・期限・影響が決まるまでalpha完了としない。

## 非対象と次の1マイルストーン

本書では、公開URLの実装・未ログイン閲覧、外部公開、共有リンク、production migration/deploy、実顧客データ、課金、Browser Runの実起動、外部AI API、物理削除・復元を扱わない。

Issue #95の判定後は、未確認の失敗原因をIssue #92/#94やopen questionsへ正しく戻し、次はownerが承認した1マイルストーンだけを選ぶ。Issue #79は公開URLの実装およびAC-010完了を対象外とし、公開URLの実装・閲覧をIssue #79へ戻さない。公開URLはIssue #59等の別承認済み後続でのみ扱う。

## Static preflightの値非表示境界

Runbook品質PASSとinternal alpha PASSは別の判定である。checkerは設定名・集合・件数・合否・ISO 8601時刻・candidate SHAだけを許可し、token、secret、email、実ID、URL、入力値、実データ値、結果不明を拒否する。archive後はpointer、content、auditの保持を個別に判定し、未完了の#92/#94や不明結果をalpha PASSへ丸めない。
