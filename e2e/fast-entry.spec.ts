import { audioLog, delayConsoleVisibility, expect, openApp, test } from "./support/app.ts";

test("F2 then immediate Enter starts one audible question before the observer catches up", async ({ page }) => {
  await delayConsoleVisibility(page, "keyboard-game-console");
  await openApp(page, "/#phrases");
  await expect(page.locator("html")).toHaveAttribute("data-offscreen-console", "keyboard-game-console");
  await page.keyboard.press("F2");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("listen-round")).toHaveText("第 1 / 10 题");
  await expect(page.getByTestId("listen-choice-0")).toBeEnabled();
  expect(await audioLog(page)).toHaveLength(1);
  await expect(page.locator("#keyboard-game-console")).toBeFocused();
  // F2 while already playing should not restart or replay the current question.
  await page.keyboard.press("F2");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("listen-round")).toHaveText("第 1 / 10 题");
  expect(await audioLog(page)).toHaveLength(1);
});

test("a newly focused console leaves composing and held Enter alone; the native Start button still works once", async ({ page }) => {
  await delayConsoleVisibility(page, "keyboard-game-console");
  await openApp(page);
  await expect(page.locator("html")).toHaveAttribute("data-offscreen-console", "keyboard-game-console");
  await page.keyboard.press("F2");
  const console = page.locator("#keyboard-game-console");
  await expect(console).toBeFocused();
  for (const key of [{ isComposing: true }, { keyCode: 229 }, { repeat: true }]) {
    await console.dispatchEvent("keydown", { key: "Enter", code: "Enter", bubbles: true, cancelable: true, ...key });
  }
  const start = page.locator("#listen-start");
  await expect(start).toBeVisible();
  expect(await audioLog(page)).toHaveLength(0);
  await start.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("listen-choice-0")).toBeEnabled();
  expect(await audioLog(page)).toHaveLength(1);
});
