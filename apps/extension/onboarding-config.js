// 配布環境を有効化するときは、この明示的な設定をレビュー済みの配布物へ反映する。
// Access未準備の限定版はpendingのままにし、登録originを生成しない。
export const ONBOARDING_CONFIG = Object.freeze({
  status: "pending",
  origin: null
});

export function getOnboardingOrigin(config = ONBOARDING_CONFIG) {
  if (config?.status !== "ready" || config.origin !== "https://meccha-manual.meccha-iiyatsu.com") return null;
  return config.origin;
}
