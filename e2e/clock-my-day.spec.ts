import { expect, openApp, test } from "./support/app.ts";
import { MY_DAY_KEY } from "../app/my-day-state.ts";

test("a temporarily earlier local date leaves the saved day untouched and shows how to continue", async ({ page, context }) => {
  const today = new Date("2026-11-22T12:00:00+09:00");
  await page.clock.setFixedTime(today);
  await openApp(page, "/#my-day");
  for (let i = 0; i < 2; i++) {
    await page.getByTestId("day-letter-reveal").click();
    await page.getByTestId("day-letter-good").click();
  }
  await expect(page.locator("#my-day .day-eyebrow span")).toHaveText("3 / 6");
  const raw = await page.evaluate(key => localStorage.getItem(key), MY_DAY_KEY);
  expect(raw).not.toBeNull();
  const other = await context.newPage();
  await other.clock.setFixedTime(new Date("2026-11-21T12:00:00+09:00"));
  await other.addInitScript(key => {
    const write = Storage.prototype.setItem;
    Storage.prototype.setItem = function(k, v) {
      if (k === key) document.documentElement.dataset.notebookWrite = "yes";
      return write.call(this, k, v);
    };
  }, MY_DAY_KEY);
  await openApp(other, "/#my-day");
  const guard = other.getByTestId("day-clock-guard");
  await expect(guard).toContainText("2026-11-22");
  await expect(guard).toContainText("2 / 6");
  await expect(other.getByTestId("day-letter-card")).toHaveCount(0);
  await guard.getByRole("link", { name: "去 40 音自由练习" }).click();
  await expect(other.locator("#learn")).toBeVisible();
  expect(await other.evaluate(key => localStorage.getItem(key), MY_DAY_KEY)).toBe(raw);
  expect(await other.locator("html").getAttribute("data-notebook-write")).toBeNull();
  await other.clock.setFixedTime(today);
  await openApp(other, "/");
  await other.locator("#home-day").click();
  await expect(other.locator("#my-day .day-eyebrow span")).toHaveText("3 / 6");
  expect(await other.evaluate(key => localStorage.getItem(key), MY_DAY_KEY)).toBe(raw);
});
