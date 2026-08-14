import { readFile, writeFile } from "node:fs/promises";

function replaceOnce(source, find, replacement, label) {
  const index = source.indexOf(find);
  if (index < 0) throw new Error(`Missing replacement target: ${label}`);
  if (source.indexOf(find, index + find.length) >= 0) {
    throw new Error(`Replacement target is not unique: ${label}`);
  }
  return `${source.slice(0, index)}${replacement}${source.slice(index + find.length)}`;
}

let definitions = await readFile("docs/04-data/table-definitions.md", "utf8");
definitions = replaceOnce(
  definitions,
  "| `manuals` | `workspace_id`, `folder_id`, `title`, `status`, `current_draft_revision_id`, `current_published_revision_id`, `owner_id`, `archived_at` | メンバー閲覧。作成・draft metadata・公開状態変更はSECURITY DEFINER RPCのみ。raw `title`は1〜64文字、ECMAScript `trim()`相当後に空でないことをDBで強制し、authenticated direct writeをrevoke |",
  "| `manuals` | `workspace_id`, `folder_id`, `title`, `status`, `current_draft_revision_id`, `current_published_revision_id`, `owner_id`, `archived_at` | メンバー閲覧。作成・draft metadata・公開状態変更はSECURITY DEFINER RPCのみ。`manuals.title`はraw 1〜64文字、ECMAScript `trim()`相当後に空でないことを`manuals_title_length` / `manuals_title_nonblank`で強制し、authenticated direct writeをrevoke |",
  "manual constraint names"
);
definitions = replaceOnce(
  definitions,
  "| `manual_revisions` | `workspace_id`, `manual_id`, `revision_no`, `state`, `title`, `description`, `source_url`, `cover_asset_id`, `published_at` | メンバー閲覧、公開版は不変。draft更新・作成・公開はRPCのみ。titleは1〜64文字・空白のみ拒否、descriptionは10,000文字以内をDBで強制し、authenticated direct writeをrevoke |",
  "| `manual_revisions` | `workspace_id`, `manual_id`, `revision_no`, `state`, `title`, `description`, `source_url`, `cover_asset_id`, `published_at` | メンバー閲覧、公開版は不変。draft更新・作成・公開はRPCのみ。`manual_revisions.title`はraw 1〜64文字・空白のみ拒否を`manual_revisions_title_length` / `manual_revisions_title_nonblank`で強制し、descriptionは`manual_revisions_description_length`で10,000文字以内、authenticated direct writeをrevoke |",
  "revision constraint names"
);
definitions = replaceOnce(
  definitions,
  "| `manual_steps` | `workspace_id`, `revision_id`, `position`, `type`, `title`, `instruction`, `action_type`, `target_text`, `url`, `asset_id`, `annotation`, `masking` | メンバー閲覧、公開版更新禁止。authenticated direct DMLをrevokeし、同じdraft revision lockを取る4 RPCだけで変更。title 128、instruction 4,000、target 256、URL 2,048文字以内をDBで強制 |",
  "| `manual_steps` | `workspace_id`, `revision_id`, `position`, `type`, `title`, `instruction`, `action_type`, `target_text`, `url`, `asset_id`, `annotation`, `masking` | メンバー閲覧、公開版更新禁止。authenticated direct DMLをrevokeし、同じdraft revision lockを取る4 RPCだけで変更。`manual_steps_title_*`、`manual_steps_instruction_length`、`manual_steps_target_text_*`、`manual_steps_url_length`で本文上限を強制 |",
  "step constraint names"
);
definitions = replaceOnce(
  definitions,
  "## 手順書タイトル制約\n\n- `manuals.title` と `manual_revisions.title` は1〜64文字。\n- Workerはtrim後のUnicode code point数を検証し、DBは `char_length(title) between 1 and 64` を最終防衛線とする。\n- forward migrationは既存タイトルを切り詰めない。65文字以上の既存行がある場合はvalidationを失敗させ、運用者が対象行を確認する。\n- 認証済みeditorがRLSを通る直接INSERT/UPDATEを行っても、65文字以上はDB constraintで拒否される。",
  "## 手順書編集制約\n\n- `manuals.title` と `manual_revisions.title` はraw 1〜64文字で、`manuals_title_length` / `manual_revisions_title_length` が `char_length(title) between 1 and 64` を強制する。\n- `manuals_title_nonblank` / `manual_revisions_title_nonblank` はECMAScript `trim()`相当後に空となるtitleを拒否する。\n- `manual_revisions_description_length` と `manual_steps_*` constraintはDEC-052の本文上限を強制する。\n- forward migrationは既存値を切り詰めない。互換性がない既存行ではvalidationを失敗させ、対象行を確認する。\n- authenticatedのmanual/revision/step direct writeはrevokeし、SECURITY DEFINER RPCだけを利用する。",
  "manual edit constraint section"
);
await writeFile("docs/04-data/table-definitions.md", definitions, "utf8");
