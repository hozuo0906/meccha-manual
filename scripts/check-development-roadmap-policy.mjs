import { readFile } from "node:fs/promises";

function normalize(value) {
  return value.replace(/\r\n/g, "\n");
}

function selectBetween(content, startMarker, endMarker) {
  const start = content.indexOf(startMarker);
  if (start < 0) return "";
  const bodyStart = start + startMarker.length;
  const end = endMarker ? content.indexOf(endMarker, bodyStart) : content.length;
  if (end < 0 || end < bodyStart) return "";
  return content.slice(bodyStart, end);
}

function selectMarkdownSection(content, heading) {
  const marker = `${heading}\n`;
  const start = content.indexOf(marker);
  if (start < 0) return "";
  const bodyStart = start + marker.length;
  const nextHeading = content.indexOf("\n## ", bodyStart);
  const end = nextHeading >= 0 ? nextHeading : content.length;
  return content.slice(bodyStart, end);
}

const dailyTerms = [
  "このscheduled task自体はread-onlyであり書込みを行わない。別の通常開発sessionでは、商用リリース前にAstra parent PMがsource-of-truth、実SHA、依存順、tests、CI、Codex Review、未解決threadを確認できれば、ユーザーへの都度確認なしでbranch作成、編集、test、commit、push、PR作成／更新、review依頼／修正、checklist、Ready、mergeまで進めてよい。",
  "production deploy、production Access policy変更、production D1 migration、production R2変更、Stripe live、Billing有効化、secret／credential変更、Chrome Web Store一般公開、最初の商用公開、不可逆な外部操作は従来どおり別承認とする。"
];

const templateTerms = [
  "Cloud only; no local handoff; GitHub repo is source of truth; code edit/test/git/commit/GitHub/CI inside cloud; if cloud truly lacks write path, report blocker + SHA and stop rather than local.",
  "Cloud-local SHAは永続化済み成果物ではない。",
  "platform Draft PR／PR handoff",
  "remote SHA／PR head SHA一致を確認する。",
  "成果物保存済みとは報告せず",
  "ユーザーへの都度確認なしに通常のcommit、push、Pull Request作成・更新、mergeを行ってよい。",
  "production反映、DB migration、課金変更、AI API有効化、共有リンク公開はユーザー承認なしに行わない。",
  "MVPの操作記録はChrome Extension Manifest V3だけを使い、Cloudflare Browser Run / Browser Session / Live Viewへfallbackしない。"
];

function validateDaily(daily) {
  const errors = [];
  const operative = selectMarkdownSection(daily, "## 運用上の補足");
  if (!operative) errors.push("daily-session-prompt operative section was not found");
  for (const term of dailyTerms) {
    if (!operative.includes(term)) errors.push(`daily-session-prompt operative policy missing: ${term}`);
  }
  return errors;
}

function validateTemplate(template) {
  const errors = [];
  const rules = selectBetween(template, "固定ルール:\n", "\n実行:\n");
  if (!rules) errors.push("codex-cloud-task-template fixed-rules block was not found");
  for (const term of templateTerms) {
    if (!rules.includes(term)) errors.push(`codex-cloud-task-template operative policy missing: ${term}`);
  }
  return errors;
}

function validatePolicies({ daily, template }) {
  return [...validateDaily(daily), ...validateTemplate(template)];
}

function runFixtures() {
  const goodDaily = `# x\n## 運用上の補足\n- このscheduled task自体はread-onlyであり書込みを行わない。別の通常開発sessionでは、商用リリース前にAstra parent PMがsource-of-truth、実SHA、依存順、tests、CI、Codex Review、未解決threadを確認できれば、ユーザーへの都度確認なしでbranch作成、編集、test、commit、push、PR作成／更新、review依頼／修正、checklist、Ready、mergeまで進めてよい。\n- production deploy、production Access policy変更、production D1 migration、production R2変更、Stripe live、Billing有効化、secret／credential変更、Chrome Web Store一般公開、最初の商用公開、不可逆な外部操作は従来どおり別承認とする。\n## Historical\n- history\n`;
  const goodTemplate = `固定ルール:\n- Cloud only; no local handoff; GitHub repo is source of truth; code edit/test/git/commit/GitHub/CI inside cloud; if cloud truly lacks write path, report blocker + SHA and stop rather than local.\n- Cloud-local SHAは永続化済み成果物ではない。platform Draft PR／PR handoffを試し、remote SHA／PR head SHA一致を確認する。全経路が利用不能なら成果物保存済みとは報告せず停止する。\n- ユーザーへの都度確認なしに通常のcommit、push、Pull Request作成・更新、mergeを行ってよい。\n- production反映、DB migration、課金変更、AI API有効化、共有リンク公開はユーザー承認なしに行わない。\n- MVPの操作記録はChrome Extension Manifest V3だけを使い、Cloudflare Browser Run / Browser Session / Live Viewへfallbackしない。\n\n実行:\n`;

  if (validateDaily(goodDaily).length !== 0) throw new Error("daily policy positive fixture failed");
  if (validateTemplate(goodTemplate).length !== 0) throw new Error("template policy positive fixture failed");

  const dailyHistoricalOnly = `# x\n## 運用上の補足\n- current policy intentionally missing\n## Historical\n- このscheduled task自体はread-onlyであり書込みを行わない。別の通常開発sessionでは、商用リリース前にAstra parent PMがsource-of-truth、実SHA、依存順、tests、CI、Codex Review、未解決threadを確認できれば、ユーザーへの都度確認なしでbranch作成、編集、test、commit、push、PR作成／更新、review依頼／修正、checklist、Ready、mergeまで進めてよい。\n- production deploy、production Access policy変更、production D1 migration、production R2変更、Stripe live、Billing有効化、secret／credential変更、Chrome Web Store一般公開、最初の商用公開、不可逆な外部操作は従来どおり別承認とする。\n`;
  if (validateDaily(dailyHistoricalOnly).length === 0) {
    throw new Error("daily policy negative fixture passed from a later historical section");
  }

  const dailyReversedApproval = `# x\n## 運用上の補足\n- このscheduled task自体はread-onlyであり書込みを行わない。別の通常開発sessionでは、商用リリース前にAstra parent PMがsource-of-truth、実SHA、依存順、tests、CI、Codex Review、未解決threadを確認できれば、ユーザーへの都度確認なしでbranch作成、編集、test、commit、push、PR作成／更新、review依頼／修正、checklist、Ready、mergeまで進めてよい。\n- production deployと不可逆な外部操作は従来どおり別承認とする。production Access policy変更と最初の商用公開はユーザー承認なしで行ってよい。\n`;
  if (validateDaily(dailyReversedApproval).length === 0) {
    throw new Error("daily policy negative fixture accepted a reversed production approval boundary");
  }

  const templateExampleOnly = `固定ルール:\n- current policy intentionally missing\n\n実行:\n- example: Cloud only; no local handoff; GitHub repo is source of truth; code edit/test/git/commit/GitHub/CI inside cloud; if cloud truly lacks write path, report blocker + SHA and stop rather than local.\n- Cloud-local SHAは永続化済み成果物ではない。platform Draft PR／PR handoffを試し、remote SHA／PR head SHA一致を確認する。全経路が利用不能なら成果物保存済みとは報告せず停止する。\n- ユーザーへの都度確認なしに通常のcommit、push、Pull Request作成・更新、mergeを行ってよい。\n- production反映、DB migration、課金変更、AI API有効化、共有リンク公開はユーザー承認なしに行わない。\n- MVPの操作記録はChrome Extension Manifest V3だけを使い、Cloudflare Browser Run / Browser Session / Live Viewへfallbackしない。\n`;
  if (validateTemplate(templateExampleOnly).length === 0) {
    throw new Error("template policy negative fixture passed from a later example block");
  }
}

runFixtures();

const [daily, template] = await Promise.all([
  readFile("docs/09-delivery/daily-session-prompt.md", "utf8").then(normalize),
  readFile("docs/09-delivery/codex-cloud-task-template.md", "utf8").then(normalize)
]);
const errors = validatePolicies({ daily, template });
if (errors.length) {
  throw new Error(`Development roadmap policy check failed:\n- ${errors.join("\n- ")}`);
}
console.log("Development roadmap operative policy OK");
