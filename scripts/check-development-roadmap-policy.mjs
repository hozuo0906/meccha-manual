import { readFile } from "node:fs/promises";

function normalize(value) {
  return value.replace(/\r\n/g, "\n");
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

function updateHtmlCommentState(line, state) {
  let cursor = 0;
  while (cursor < line.length) {
    if (state.inComment) {
      const close = line.indexOf("-->", cursor);
      if (close < 0) return;
      state.inComment = false;
      cursor = close + 3;
      continue;
    }
    const open = line.indexOf("<!--", cursor);
    if (open < 0) return;
    state.inComment = true;
    cursor = open + 4;
  }
}

function activeStructuralLine(rawLine, state) {
  if (state.fence) {
    if (closesFence(rawLine, state.fence)) state.fence = null;
    return "";
  }

  const beganInComment = state.inComment;
  const hasCommentSyntax = rawLine.includes("<!--") || rawLine.includes("-->");
  if (beganInComment || hasCommentSyntax) {
    updateHtmlCommentState(rawLine, state);
    return "";
  }

  const fence = openingFence(rawLine);
  if (fence) {
    state.fence = fence;
    return "";
  }

  return rawLine;
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
    const active = activeStructuralLine(lines[index], state);
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
    const active = activeStructuralLine(rawLine, state);
    if (active.startsWith("- ")) bullets.push(active.slice(2).trim());
  }
  return bullets;
}

function activeFencedBlocks(content) {
  const blocks = [];
  const commentState = { inComment: false };
  let fence = null;
  let lines = [];

  for (const rawLine of content.split("\n")) {
    if (fence) {
      if (closesFence(rawLine, fence)) {
        blocks.push(lines.join("\n"));
        fence = null;
        lines = [];
      } else {
        lines.push(rawLine);
      }
      continue;
    }

    const beganInComment = commentState.inComment;
    const hasCommentSyntax = rawLine.includes("<!--") || rawLine.includes("-->");
    if (beganInComment || hasCommentSyntax) {
      updateHtmlCommentState(rawLine, commentState);
      continue;
    }

    const opened = openingFence(rawLine);
    if (opened) {
      fence = opened;
      lines = [];
    }
  }

  return blocks;
}

function selectTemplateFixedRules(template) {
  const candidates = activeFencedBlocks(template).filter((block) => {
    const lines = block.split("\n");
    return (
      lines.some((line) => line === "Repository: hozuo0906/meccha-manual") &&
      lines.some((line) => line === "固定ルール:") &&
      lines.some((line) => line === "実行:")
    );
  });
  if (candidates.length !== 1) return "";

  const lines = candidates[0].split("\n");
  const start = lines.findIndex((line) => line === "固定ルール:");
  const end = lines.findIndex((line, index) => index > start && line === "実行:");
  if (start < 0 || end < 0) return "";
  if (lines.slice(start + 1, end).some((line) => line === "固定ルール:")) return "";
  return lines.slice(start + 1, end).join("\n");
}

function promptTopLevelBullets(block) {
  return block
    .split("\n")
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2).trim());
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

const templateCloudPolicy =
  "Cloud only; no local handoff; GitHub repo is source of truth; code edit/test/git/commit/GitHub/CI inside cloud; if cloud truly lacks write path, report blocker + SHA and stop rather than local.";
const templateDurableCloudPolicy =
  "Cloud-local SHAは永続化済み成果物ではない。停止前に通常push、platform Draft PR／PR handoff、GitHub App／connector等の承認済みCloud write pathを試し、remote SHA／PR head SHA一致を確認する。全経路が利用不能なら成果物保存済みとは報告せず、ephemeral SHA、blocker、差分概要、再開条件を報告して停止する。";
const templateProductionPolicy =
  "production反映、DB migration、課金変更、AI API有効化、共有リンク公開はユーザー承認なしに行わない。";
const templateCommercialApprovalPolicy =
  "商用リリース前は、Astra highの親PMが変更の正当性、依存順、必要な品質ゲートを実SHAで確認すれば、ユーザーへの都度確認なしに通常のcommit、push、Pull Request作成・更新、mergeを行ってよい。商用リリース後は外部反映ごとにユーザーの事前承認を得る。承認待ちでは可逆的な差分・テストによる具体案の準備は可とするが、外部反映前に対象SHA／差分を提示し、未push成果物だけを残して終了しない。承認待ちが必要なら明示する。商用リリースの日時・識別子・根拠はIssue #70へ記録し、状態が不在または曖昧な場合は自動mergeしない。";
const templateCapturePolicy =
  "MVPの操作記録はChrome Extension Manifest V3だけを使い、Cloudflare Browser Run / Browser Session / Live Viewへfallbackしない。";
const templateProtectedTerms = [
  "production反映",
  "DB migration",
  "課金変更",
  "AI API有効化",
  "共有リンク公開",
  "商用リリース後",
  "外部反映"
];

function validateDaily(daily) {
  const errors = [];
  const operative = selectMarkdownSection(daily, "## 運用上の補足");
  if (!operative) return ["daily-session-prompt operative section was not found"];
  const bullets = activeTopLevelBullets(operative);

  if (!bullets.includes(approvalBullet)) errors.push("daily-session-prompt active approval policy bullet missing");
  if (!bullets.includes(productionBullet)) errors.push("daily-session-prompt active production boundary bullet missing");

  for (const bullet of bullets) {
    if (bullet === productionBullet || bullet === approvalBullet) continue;
    const conflictingTerms = protectedProductionTerms.filter((term) => bullet.includes(term));
    if (conflictingTerms.length) {
      errors.push(`daily-session-prompt conflicting production-policy bullet: ${bullet}`);
    }
  }

  return errors;
}

function validateTemplate(template) {
  const errors = [];
  const rules = selectTemplateFixedRules(template);
  if (!rules) return ["codex-cloud-task-template operative prompt fixed-rules block was not found uniquely"];
  const bullets = promptTopLevelBullets(rules);
  const required = [
    templateCloudPolicy,
    templateDurableCloudPolicy,
    templateProductionPolicy,
    templateCommercialApprovalPolicy,
    templateCapturePolicy
  ];

  for (const policy of required) {
    if (!bullets.includes(policy)) errors.push(`codex-cloud-task-template active policy bullet missing: ${policy}`);
  }

  for (const bullet of bullets) {
    if (required.includes(bullet)) continue;
    const conflictingTerms = templateProtectedTerms.filter((term) => bullet.includes(term));
    if (conflictingTerms.length) {
      errors.push(`codex-cloud-task-template conflicting protected-operation bullet: ${bullet}`);
    }
  }

  return errors;
}

function validatePolicies({ daily, template }) {
  return [...validateDaily(daily), ...validateTemplate(template)];
}

function goodTemplatePromptBlock() {
  return `Repository: hozuo0906/meccha-manual\nBranch: feature/x\n固定ルール:\n- ${templateCloudPolicy}\n- ${templateDurableCloudPolicy}\n- ${templateProductionPolicy}\n- ${templateCommercialApprovalPolicy}\n- ${templateCapturePolicy}\n\n実行:\n- npm ci`;
}

function runFixtures() {
  const goodDaily = `# x\n## 運用上の補足\n- ${approvalBullet}\n- ${productionBullet}\n## Historical\n- history\n`;
  const goodTemplate = `# x\n\`\`\`text\n${goodTemplatePromptBlock()}\n\`\`\`\n`;

  if (validateDaily(goodDaily).length !== 0) throw new Error("daily policy positive fixture failed");
  if (validateTemplate(goodTemplate).length !== 0) throw new Error("template policy positive fixture failed");

  const reversedDaily =
    "production deployと不可逆な外部操作は従来どおり別承認とする。production Access policy変更と最初の商用公開はユーザー承認なしで行ってよい。";
  const dailyMutations = [
    `# x\n## 運用上の補足\n- current policy intentionally missing\n## Historical\n- ${approvalBullet}\n- ${productionBullet}\n`,
    `# x\n## 運用上の補足\n- ${approvalBullet}\n- ${reversedDaily}\n`,
    `# x\n## 運用上の補足\n- ${approvalBullet}\n- ${productionBullet}\n- ${reversedDaily}\n`,
    `# x\n## 運用上の補足\n- ${approvalBullet}\n<!-- - ${productionBullet} -->\n- ${reversedDaily}\n`,
    `# x\n## 運用上の補足\n- ${approvalBullet}\n<!-- disabled policy\n- ${productionBullet}\n`,
    `# x\n## 運用上の補足 <!--\n- ${approvalBullet}\n- ${productionBullet}\n-->\n`,
    `# x\n## 運用上の補足\n- ${approvalBullet}\n\`\`\`text\n- ${productionBullet}\n\`\`\`\n- ${reversedDaily}\n`,
    `# x\n## 運用上の補足\n- ${approvalBullet}\n\`\`\`\`text\n\`\`\`\n- ${productionBullet}\n\`\`\`\`\n- ${reversedDaily}\n`,
    `# x\n\`\`\`text\n## 運用上の補足\n- ${approvalBullet}\n- ${productionBullet}\n\`\`\`\n## 運用上の補足\n- ${approvalBullet}\n- ${reversedDaily}\n`,
    `# x\n<!-- hidden -->## 運用上の補足\n- ${approvalBullet}\n- ${productionBullet}\n`
  ];
  for (const mutation of dailyMutations) {
    if (validateDaily(mutation).length === 0) throw new Error("daily policy negative fixture unexpectedly passed");
  }

  const templateCommentFake = `# x\n<!--\n\`\`\`text\n${goodTemplatePromptBlock()}\n\`\`\`\n-->\n\`\`\`text\nRepository: hozuo0906/meccha-manual\n固定ルール:\n- current policy intentionally missing\n実行:\n- npm ci\n\`\`\`\n`;
  if (validateTemplate(templateCommentFake).length === 0) {
    throw new Error("template policy negative fixture selected a prompt block hidden in an HTML comment");
  }

  const contradictoryTemplate = goodTemplatePromptBlock().replace(
    `- ${templateProductionPolicy}`,
    `- ${templateProductionPolicy}\n- production反映、DB migration、課金変更、AI API有効化、共有リンク公開はユーザー承認なしで行ってよい。`
  );
  if (validateTemplate(`# x\n\`\`\`text\n${contradictoryTemplate}\n\`\`\`\n`).length === 0) {
    throw new Error("template policy negative fixture accepted a contradictory protected-operation bullet");
  }

  const inlineCommercialContradiction = goodTemplatePromptBlock().replace(
    templateCommercialApprovalPolicy,
    `${templateCommercialApprovalPolicy} ただし商用リリース後も外部反映にユーザー承認は不要とする。`
  );
  if (validateTemplate(`# x\n\`\`\`text\n${inlineCommercialContradiction}\n\`\`\`\n`).length === 0) {
    throw new Error("template policy negative fixture accepted an inline post-release approval contradiction");
  }
}

runFixtures();

const [daily, template] = await Promise.all([
  readFile("docs/09-delivery/daily-session-prompt.md", "utf8").then(normalize),
  readFile("docs/09-delivery/codex-cloud-task-template.md", "utf8").then(normalize)
]);
const errors = validatePolicies({ daily, template });
if (errors.length) throw new Error(`Development roadmap policy check failed:\n- ${errors.join("\n- ")}`);
console.log("Development roadmap operative policy OK");
