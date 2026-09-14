function touch(draft) {
  draft.updatedAt = new Date().toISOString();
  draft.steps.forEach((step, index) => { step.order = index + 1; });
  return draft;
}

export function addStep(draft, instruction = "新しい手順") {
  const step = {
    id: crypto.randomUUID(),
    order: draft.steps.length + 1,
    instruction: String(instruction).slice(0, 500)
  };
  draft.steps.push(step);
  touch(draft);
  return step;
}

export function updateStepInstruction(draft, stepId, instruction) {
  const step = draft.steps.find((candidate) => candidate.id === stepId);
  if (step) step.instruction = String(instruction).slice(0, 500);
  return touch(draft);
}

export function deleteStep(draft, stepId) {
  draft.steps = draft.steps.filter((step) => step.id !== stepId);
  return touch(draft);
}

export function moveStep(draft, stepId, direction) {
  const index = draft.steps.findIndex((step) => step.id === stepId);
  const target = direction === "up" ? index - 1 : index + 1;
  if (index >= 0 && target >= 0 && target < draft.steps.length) [draft.steps[index], draft.steps[target]] = [draft.steps[target], draft.steps[index]];
  return touch(draft);
}

export function normalizeMaskRegion(region) {
  const values = [region.x, region.y, region.width, region.height].map(Number);
  if (values.some((value) => !Number.isFinite(value) || value < 0 || value > 1)) throw new TypeError("マスク範囲が不正です");
  const [x, y, width, height] = values;
  if (!width || !height || x + width > 1 || y + height > 1) throw new TypeError("マスク範囲が不正です");
  return { id: crypto.randomUUID(), x, y, width, height };
}

export function addMask(draft, screenshotId, region) {
  const screenshot = draft.screenshots.find((item) => item.id === screenshotId);
  if (!screenshot) throw new TypeError("画像が見つかりません");
  screenshot.masks ||= [];
  screenshot.masks.push(normalizeMaskRegion(region));
  return touch(draft);
}

export function removeMask(draft, screenshotId, maskId) {
  const screenshot = draft.screenshots.find((item) => item.id === screenshotId);
  if (screenshot) screenshot.masks = (screenshot.masks || []).filter((mask) => mask.id !== maskId);
  return touch(draft);
}
