import { expect, openApp, test } from "./support/app.ts";

test("all four menus and the first lesson can be reached on a laptop without scrolling", async ({ page }, testInfo) => {
  for (const width of [1280, 1024]) {
    await page.setViewportSize({width, height: 800});
    await openApp(page);
    const destinations = page.getByRole("navigation", {name: "主要导航"}).getByRole("link");
    await expect(destinations).toHaveCount(4);
    for (const link of await destinations.all()) {
      await expect(link).toBeInViewport({ratio: 1});
      expect(await link.evaluate(el => {
        const r = el.getBoundingClientRect();
        return el.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2));
      })).toBe(true);
    }
    await expect(page.locator("#home-day")).toBeInViewport({ratio: 1});
    await expect(page.locator("#home-continue")).toBeVisible();
    if (width === 1280) await page.screenshot({path: testInfo.outputPath("desktop-home.png")});
  }
});

test("desktop home does not load hidden lessons' recordings before a lesson opens", async ({ page }) => {
  const files = new Set<string>();
  page.on("request", req => {
    const path = new URL(req.url()).pathname;
    if (path.startsWith("/audio/")) files.add(path);
  });
  await openApp(page);
  await page.locator("#home-day").focus();
  expect([...files]).toEqual([]);
  await page.getByRole("navigation", { name: "主要导航" }).getByRole("link", { name: "练习" }).click();
  await page.locator("#listen-start").click();
  await expect.poll(() => files.size).toBeGreaterThan(0);
  await expect(page.getByTestId("listen-choice-0")).toBeEnabled();
});
