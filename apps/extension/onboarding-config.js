// このbranchの配布物は、owner限定staging pilotだけへ接続する。
// production、preview、localhostなどのoriginは配布設定へ入れない。
export const STAGING_ONBOARDING_ORIGIN = "https://meccha-manual-staging.meccha-iiyatsu.com";

export const ONBOARDING_CONFIG = Object.freeze({
  status: "ready",
  origin: STAGING_ONBOARDING_ORIGIN
});

export function getOnboardingOrigin(config = ONBOARDING_CONFIG) {
  if (config?.status !== "ready" || config.origin !== STAGING_ONBOARDING_ORIGIN) return null;
  return config.origin;
}
