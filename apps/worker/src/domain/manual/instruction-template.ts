export type ManualActionType = "click" | "input" | "select" | "navigate" | "wait" | "other";

export interface ManualInstructionSuggestionInput {
  targetText: string | null | undefined;
  actionType: ManualActionType;
}

function normalizeTargetText(value: string | null | undefined): string {
  return String(value ?? "")
    .trim()
    .replace(/\s+/gu, " ");
}

function actionSuffix(actionType: ManualActionType): string | null {
  switch (actionType) {
    case "click":
      return "をクリックします。";
    case "input":
      return "に入力します。";
    case "select":
      return "を選択します。";
    case "navigate":
      return "を開きます。";
    case "wait":
      return "を待ちます。";
    case "other":
      return "を操作します。";
    default:
      return null;
  }
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

  const suffix = actionSuffix(input.actionType);
  if (!suffix) return null;

  return `［${target}］${suffix}`;
}
