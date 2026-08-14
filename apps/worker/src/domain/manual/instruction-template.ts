export type ManualActionType = "click" | "input" | "select" | "navigate" | "wait" | "other";

export interface ManualInstructionSuggestionInput {
  targetText: string | null | undefined;
  actionType: ManualActionType;
}

const ACTION_PHRASES: Record<ManualActionType, { particle: "を" | "に"; verb: string }> = {
  click: { particle: "を", verb: "クリック" },
  input: { particle: "に", verb: "入力" },
  select: { particle: "を", verb: "選択" },
  navigate: { particle: "を", verb: "開き" },
  wait: { particle: "を", verb: "待ち" },
  other: { particle: "を", verb: "操作" }
};

function normalizeTargetText(value: string | null | undefined): string {
  return String(value ?? "")
    .trim()
    .replace(/\s+/gu, " ");
}

/**
 * AIや外部APIを使わず、targetとactionだけから編集開始用の日本語文を提案する。
 *
 * この戻り値はあくまで初期提案であり、保存済みinstructionを上書きする用途には使わない。
 * 入力値そのものは受け取らず、対象名だけを文章化する。
 */
export function suggestManualInstruction(
  input: ManualInstructionSuggestionInput
): string | null {
  const target = normalizeTargetText(input.targetText);
  if (!target) return null;

  const phrase = ACTION_PHRASES[input.actionType];
  return `${target}${phrase.particle}${phrase.verb}します。`;
}
