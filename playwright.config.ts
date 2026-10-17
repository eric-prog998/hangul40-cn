import { defineConfig, devices } from "@playwright/test";

/**
 * Real-browser tests: they build the site, open it in Chromium and play it the
 * way a learner would. Run with `npm run test:e2e`.
 */
const PORT = Number(process.env.E2E_PORT ?? 4173);
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  // On GitHub Actions, "github" also turns each failure into an annotation on the run and the PR,
  // so the failing test and line are visible without downloading the log or the report.
  reporter: process.env.CI ? [["list"], ["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: BASE_URL,
    locale: "zh-CN",
    // Local-calendar features (daily XP, review schedule, backup file name) are
    // tested against a fixed zone so results do not depend on the machine.
    timezoneId: "Asia/Seoul",
    trace: "retain-on-failure",
    // The site jumps instead of gliding to a section when the visitor asks for less motion.
    // Tests use that so a click never lands on a button that is still moving.
    contextOptions: { reducedMotion: "reduce" },
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"], launchOptions: { args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] } } },
    // Targeted WebKit coverage is not a claim of real Safari/device/IME acceptance.
    { name: "webkit-audio", testMatch: /(?:audio-guide|media-compat|daily-plan|recall)\.spec\.ts/, use: { ...devices["Desktop Safari"] } },
  ],
  webServer: {
    command: `npm run build && npx vinext start -p ${PORT} -H 127.0.0.1`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
