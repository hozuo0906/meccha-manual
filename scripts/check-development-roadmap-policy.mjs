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

function openingFence(line) {
  const match = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
  if (!match) return null;
  const run = match[1];
  const rest = match[2];
  if (run[0] === "`" && rest.includes("`")) return null;
  return { char: run[0], length: run.length };
}

function closesFence(line, fence) {
  const match = line.match(/^ {0,3}(`+|~+)[ \t]*$/);
  if (!match) return false;
  const run = match[1];
  return run[0] === fence.char && run.length >= fence.length;
}

function stripHtmlComments(line, state) {
  let cleaned = "";
  let cursor = 0;

  while (cursor < line.length) {
    if (state.inComment) {
      const close = line.indexOf("-->", cursor);
      if (close < 0) return cleaned;
      state.inComment = false;
      cursor = close + 3;
      continue;
    }

    const open = line.indexOf("<!--", cursor);
    if (open < 0) {
      cleaned += line.slice(cursor);
      break;
    }

    cleaned += line.slice(cursor, open);
    state.inComment = true;
    cursor = open + 4;
  }

  return cleaned;
}

function activeMarkdownLine(rawLine, state) {
  if (state.fence) {
    if (closesFence(rawLine, state.fence)) state.fence = null;
    return "";
  }

  const cleaned = stripHtmlComments(rawLine, state);
  if (state.inComment && cleaned.length === 0) return "";

  const fence = openingFence(cleaned);
  if (fence) {
    state.fence = fence;
    return "";
  }

  return cleaned;
}

function h2Text(line) {
  const match = line.match(/^ {0,3}##(?!#)[ \t]+(.+?)[ \t]*$/);
  if (!match) return null;
  return match[1].replace(/[ \t]+#+[ \t]*$/, "").trim();
}

function selectMarkdownSection(content, heading) {
  const lines = content.split("\n");
  const state = { inComment: false, fence: null };
  const target = heading.replace(/^##[ \t]+/, "").trim();
  let startLine = -1;

  for (let index = 0; index < lines.length; index += 1) {
    const active = activeMarkdownLine(lines[index], state);
    const headingText = h2Text(active);
    if (headingText === null) continue;

    if (startLine < 0) {
      if (headingText === target) startLine = index + 1;
      continue;
    }

    return lines.slice(startLine, index).join("\n");
  }

  return startLine >= 0 ? lines.slice(startLine).join("\n") : "";
}

function activeTopLevelBullets(section) {
  const bullets = [];
  const state = { inComment: false, fence: null };

  for (const rawLine of section.split("\n")) {
    const active = activeMarkdownLine(rawLine, state);
    if (active.startsWith("- ")) bullets.push(active.slice(2).trim());
  }

  return bullets;
}

const approvalBullet =
  "このscheduled task自体はread-onlyであり書込みを行わない。別の通常開発sessionでは、商用リリース前にAstra parent PMがsource-of-truth、実SHA、依存順、tests、CI、Codex Review、未解決threadを確認できれば、ユーザーへの都度確認なしでbranch作成、編集、test、commit、push、PR作成／更新、review依頼／修正、checklist、Ready、mergeまで進めてよい。";
const productionBullet =
  "production deploy、production Access policy変更、production D1 migration、production R2変更、Stripe live、Billing有効化、secret／credential変更、Chrome Web Store一般公開、最初の商用公開、不可逆な外部操作は従来どおり別承認とする。";
const protectedProductionTerms = [
  "production deploy",
  "production Access policy変更",
  "production D1 migration",
  "production R2変更",
  "Stripe live",
  "Billing有効化",
  "secret／credential変更",
  "Chrome Web Store一般公開",
  "最初の商用公開",
  "不可逆な外部操作"
];

const templateExactPolicies = [
  "Cloud only; no local handoff; GitHub repo is source of truth; code edit/test/git/commit/GitHub/CI inside cloud; if cloud truly lacks write path, report blocker + SHA and stop rather than local.",
  "production反映、DB migration、課金変更、AI API有効化、共有リンク公開はユーザー承認なしに行わない。",
  "MVPの操作記録はChrome Extension Manifest V3だけを使い、Cloudflare Browser Run / Browser Session / Live Viewへfallbackしない。"
];

const templateGroupedPolicies = [
  [
    "Cloud-local SHAは永続化済み成果物ではない。",
    "platform Draft PR／PR handoff",
    "remote SHA／PR head SHA一致を確認する。",
    "成果物保存済みとは報告せず"
  ],
  [
    "商用リリース前は",
    "ユーザーへの都度確認なしに通常のcommit、push、Pull Request作成・更新、mergeを行ってよい。",
    "商用リリース後は外部反映ごとにユーザーの事前承認を得る。"
  ]
];

function validateDaily(daily) {
  const errors = [];
  const operative = selectMarkdownSection(daily, "## 運用上の補足");
  if (!operative) return ["daily-session-prompt operative section was not found"];
  const bullets = activeTopLevelBullets(operative);

  if (!bullets.includes(approvalBullet)) {
    errors.push(`daily-session-prompt active policy bullet missing: ${approvalBullet}`);
  }
  if (!bullets.includes(productionBullet)) {
    errors.push(`daily-session-prompt active policy bullet missing: ${productionBullet}`);
  }

  for (const bullet of bullets) {
    if (bullet === productionBullet) continue;
    const conflictingTerms = protectedProductionTerms.filter((term) => bullet.includes(term));
    if (conflictingTerms.length) {
      errors.push(
        `daily-session-prompt has conflicting active production-policy bullet (${conflictingTerms.join(", ")}): ${bullet}`
      );
    }
  }

  return errors;
}

function validateTemplate(template) {
  const errors = [];
  const rules = selectBetween(template, "固定ルール:\n", "\n実行:\n");
  if (!rules) return ["codex-cloud-task-template fixed-rules block was not found"];
  const bullets = activeTopLevelBullets(rules);
  for (const policy of templateExactPolicies) {
    if (!bullets.includes(policy)) errors.push(`codex-cloud-task-template active policy bullet missing: ${policy}`);
  }
  for (const fragments of templateGroupedPolicies) {
    if (!bullets.some((bullet) => fragments.every((fragment) => bullet.includes(fragment)))) {
      errors.push(`codex-cloud-task-template grouped policy missing from one active bullet: ${fragments.join(" | ")}`);
    }
  }
  return errors;
}

function validatePolicies({ daily, template }) {
  return [...validateDaily(daily), ...validateTemplate(template)];
}

function runFixtures() {
  const goodDaily = `# x\n## 運用上の補足\n- ${approvalBullet}\n- ${productionBullet}\n## Historical\n- history\n`;
  const goodTemplate = `固定ルール:\n- Cloud only; no local handoff; GitHub repo is source of truth; code edit/test/git/commit/GitHub/CI inside cloud; if cloud truly lacks write path, report blocker + SHA and stop rather than local.\n- Cloud-local SHAは永続化済み成果物ではない。platform Draft PR／PR handoffを試し、remote SHA／PR head SHA一致を確認する。全経路が利用不能なら成果物保存済みとは報告せず停止する。\n- 商用リリース前は確認後、ユーザーへの都度確認なしに通常のcommit、push、Pull Request作成・更新、mergeを行ってよい。商用リリース後は外部反映ごとにユーザーの事前承認を得る。\n- production反映、DB migration、課金変更、AI API有効化、共有リンク公開はユーザー承認なしに行わない。\n- MVPの操作記録はChrome Extension Manifest V3だけを使い、Cloudflare Browser Run / Browser Session / Live Viewへfallbackしない。\n\n実行:\n`;

  if (validateDaily(goodDaily).length !== 0) throw new Error("daily policy positive fixture failed");
  if (validateTemplate(goodTemplate).length !== 0) throw new Error("template policy positive fixture failed");

  const reversedBullet =
    "production deployと不可逆な外部操作は従来どおり別承認とする。production Access policy変更と最初の商用公開はユーザー承認なしで行ってよい。";

  const dailyHistoricalOnly = `# x\n## 運用上の補足\n- current policy intentionally missing\n## Historical\n- ${approvalBullet}\n- ${productionBullet}\n`;
  if (validateDaily(dailyHistoricalOnly).length === 0) {
    throw new Error("daily policy negative fixture passed from a later historical section");
  }

  const dailyReversedApproval = `# x\n## 運用上の補足\n- ${approvalBullet}\n- ${reversedBullet}\n`;
  if (validateDaily(dailyReversedApproval).length === 0) {
    throw new Error("daily policy negative fixture accepted a reversed production approval boundary");
  }

  const dailyContradiction = `# x\n## 運用上の補足\n- ${approvalBullet}\n- ${productionBullet}\n- ${reversedBullet}\n`;
  if (validateDaily(dailyContradiction).length === 0) {
    throw new Error("daily policy negative fixture accepted contradictory production bullets");
  }

  const dailyCommentOnly = `# x\n## 運用上の補足\n- ${approvalBullet}\n<!-- - ${productionBullet} -->\n- ${reversedBullet}\n`;
  if (validateDaily(dailyCommentOnly).length === 0) {
    throw new Error("daily policy negative fixture accepted a commented-out approval boundary");
  }

  const dailyUnterminatedComment = `# x\n## 運用上の補足\n- ${approvalBullet}\n<!-- disabled policy\n- ${productionBullet}\n`;
  if (validateDaily(dailyUnterminatedComment).length === 0) {
    throw new Error("daily policy negative fixture accepted an unterminated-comment policy");
  }

  const dailyFencedPolicy = `# x\n## 運用上の補足\n- ${approvalBullet}\n\`\`\`text\n- ${productionBullet}\n\`\`\`\n- ${reversedBullet}\n`;
  if (validateDaily(dailyFencedPolicy).length === 0) {
    throw new Error("daily policy negative fixture accepted a fenced-code approval boundary");
  }

  const dailyLongFence = `# x\n## 運用上の補足\n- ${approvalBullet}\n\`\`\`\`text\n\`\`\`\n- ${productionBullet}\n\`\`\`\`\n- ${reversedBullet}\n`;
  if (validateDaily(dailyLongFence).length === 0) {
    throw new Error("daily policy negative fixture closed a long fence with a shorter delimiter");
  }

  const dailyFencedFakeHeading = `# x\n\`\`\`text\n## 運用上の補足\n- ${approvalBullet}\n- ${productionBullet}\n\`\`\`\n## 運用上の補足\n- ${approvalBullet}\n- ${reversedBullet}\n`;
  if (validateDaily(dailyFencedFakeHeading).length === 0) {
    throw new Error("daily policy negative fixture selected an operative heading from fenced code");
  }

  const templateExampleOnly = `固定ルール:\n- current policy intentionally missing\n\n実行:\n- Cloud only; no local handoff; GitHub repo is source of truth; code edit/test/git/commit/GitHub/CI inside cloud; if cloud truly lacks write path, report blocker + SHA and stop rather than local.\n- Cloud-local SHAは永続化済み成果物ではない。platform Draft PR／PR handoffを試し、remote SHA／PR head SHA一致を確認する。全経路が利用不能なら成果物保存済みとは報告せず停止する。\n- 商用リリース前は確認後、ユーザーへの都度確認なしに通常のcommit、push、Pull Request作成・更新、mergeを行ってよい。商用リリース後は外部反映ごとにユーザーの事前承認を得る。\n- production反映、DB migration、課金変更、AI API有効化、共有リンク公開はユーザー承認なしに行わない。\n- MVPの操作記録はChrome Extension Manifest V3だけを使い、Cloudflare Browser Run / Browser Session / Live Viewへfallbackしない。\n`;
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
