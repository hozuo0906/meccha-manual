import { chromium as playwrightChromium } from "@playwright/test";

// CI may select Google's official Chrome for Testing binary. Local defaults
// remain Playwright's supported Chromium. No user's browser profile is used.
function optionsFor(options = {}) {
  const executablePath = process.env.MECCHA_TEST_CHROME_PATH;
  if (!executablePath) return options;
  const { channel: _channel, ...rest } = options;
  return { ...rest, executablePath, ...(process.env.MECCHA_TEST_HEADED === "1" ? { headless: false } : {}) };
}
export const chromium = new Proxy(playwrightChromium, {
  get(target, key) {
    if (key === "launch") return (options) => target.launch(optionsFor(options));
    if (key === "launchPersistentContext") return (profile, options) => target.launchPersistentContext(profile, optionsFor(options));
    const value = Reflect.get(target, key, target);
    return typeof value === "function" ? value.bind(target) : value;
  }
});
