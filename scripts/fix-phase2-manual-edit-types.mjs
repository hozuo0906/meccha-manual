import { readFile, writeFile } from "node:fs/promises";

function replaceOnce(source, find, replacement, label) {
  const index = source.indexOf(find);
  if (index < 0) throw new Error(`Missing replacement target: ${label}`);
  if (source.indexOf(find, index + find.length) >= 0) {
    throw new Error(`Replacement target is not unique: ${label}`);
  }
  return `${source.slice(0, index)}${replacement}${source.slice(index + find.length)}`;
}

let router = await readFile("apps/worker/src/manual-edit-router.ts", "utf8");
router = replaceOnce(
  router,
  `  const typed = steps as ManualStep[];
  for (let index = 1; index < typed.length; index += 1) {
    if (typed[index].position <= typed[index - 1].position) {
      throw new ManualError(502, "MANUAL_STEPS_RESPONSE_INVALID", "手順を確認できませんでした。時間をおいて、もう一度お試しください。");
    }
  }`,
  `  const typed = steps as ManualStep[];
  for (let index = 1; index < typed.length; index += 1) {
    const current = typed[index];
    const previous = typed[index - 1];
    if (!current || !previous || current.position <= previous.position) {
      throw new ManualError(502, "MANUAL_STEPS_RESPONSE_INVALID", "手順を確認できませんでした。時間をおいて、もう一度お試しください。");
    }
  }`,
  "strict indexed step access"
);
router = replaceOnce(
  router,
  `    if (reorderMatch) {
      const ids = routeIds(reorderMatch[1], reorderMatch[2]);`,
  `    if (reorderMatch) {
      const ids = routeIds(reorderMatch[1] ?? "", reorderMatch[2] ?? "");`,
  "reorder route captures"
);
router = replaceOnce(
  router,
  `    } else if (draftMatch) {
      const ids = routeIds(draftMatch[1], draftMatch[2]);`,
  `    } else if (draftMatch) {
      const ids = routeIds(draftMatch[1] ?? "", draftMatch[2] ?? "");`,
  "draft route captures"
);
router = replaceOnce(
  router,
  `    } else if (stepsMatch) {
      const ids = routeIds(stepsMatch[1], stepsMatch[2]);`,
  `    } else if (stepsMatch) {
      const ids = routeIds(stepsMatch[1] ?? "", stepsMatch[2] ?? "");`,
  "steps route captures"
);
router = replaceOnce(
  router,
  `    } else if (stepMatch) {
      const ids = routeIds(stepMatch[1], stepMatch[2], stepMatch[3]);`,
  `    } else if (stepMatch) {
      const ids = routeIds(stepMatch[1] ?? "", stepMatch[2] ?? "", stepMatch[3] ?? "");`,
  "single step route captures"
);
router = replaceOnce(
  router,
  `    } else if (detailMatch) {
      const ids = routeIds(detailMatch[1], detailMatch[2]);`,
  `    } else if (detailMatch) {
      const ids = routeIds(detailMatch[1] ?? "", detailMatch[2] ?? "");`,
  "detail route captures"
);
await writeFile("apps/worker/src/manual-edit-router.ts", router, "utf8");
