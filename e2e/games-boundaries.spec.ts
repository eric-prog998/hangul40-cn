import { audioLog, delayConsoleVisibility, expect, openApp, test } from "./support/app.ts";

test("Shift+3 then immediate Enter starts one phrase without waiting for a delayed viewport report", async ({ page }) => {
  await delayConsoleVisibility(page, "phrase-quiz-panel");
  await openApp(page);
  await expect(page.locator("html")).toHaveAttribute("data-offscreen-console", "phrase-quiz-panel");
  await page.keyboard.press("Shift+Digit3");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("phrase-choice-0")).toBeEnabled({ timeout: 5000 });
  expect(await audioLog(page)).toHaveLength(1);
  await expect(page.locator("#phrase-quiz-panel")).toBeFocused();
  // Starting is not synonymous with replay: a second Enter during this
  // unanswered round should neither restart it nor replay its prompt.
  await page.keyboard.press("Enter");
  expect(await audioLog(page)).toHaveLength(1);
  // Under the same stale observer report, a shortcut from the page header
  // must not be mistaken for an event targeted at the focused quiz console.
  await page.getByRole("button", { name: "打开键盘快捷键帮助" }).focus();
  await page.keyboard.press("F8");
  expect(await audioLog(page)).toHaveLength(1);
});
