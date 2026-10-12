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
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
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
    launchOptions: {
      args: [
        "--autoplay-policy=no-user-gesture-required",
        // The voice recorder is tested against Chromium's built-in fake microphone;
        // the site still only asks for it when the learner presses "开始录音".
        "--use-fake-device-for-media-stream",
        "--use-fake-ui-for-media-stream",
      ],
    },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npm run build && npx vinext start -p ${PORT} -H 127.0.0.1`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
