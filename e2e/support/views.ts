import { expect, type Page } from "@playwright/test";

/** Follow a bookmarked destination without reloading; exercise the normal hashchange router. */
export async function visitView(page: Page, id: string) {
  await page.evaluate((id) => { if (location.hash !== "#" + id) location.hash = id; }, id);
  await expect(page.locator("#" + id)).toBeVisible();
}
