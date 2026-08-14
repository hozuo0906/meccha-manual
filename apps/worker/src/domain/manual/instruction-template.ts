export type ManualActionType = "click" | "input" | "select" | "navigate" | "wait" | "other";

export interface ManualInstructionSuggestionInput {
  targetText: string | null | undefined;
  actionType: ManualActionType;
}

const ACTION_SUFFIXES: Record<ManualActionType, string> = {
  click: "をクリックします。",
  input: "に入力します。",
  select: "を選択します。",
  navigate: "を開きます。",
  wait: "を待ちます。",
  other: "を操作します。"
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

  return `${target}${ACTION_SUFFIXES[input.actionType]}`;
}
