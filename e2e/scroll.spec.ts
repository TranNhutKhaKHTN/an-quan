import { expect, test } from "@playwright/test";

// Regression: after each turn the page used to scroll down to the move history / player cards.
test("the page does not scroll after moves (vs bot and hotseat)", async ({ page }) => {
  for (const url of ["/play/bot?players=2&level=easy", "/play/local?players=2"]) {
    await page.goto(url);
    const enabled = page.locator("[role=group] button:not([disabled])");
    await expect(enabled).toHaveCount(5);
    for (let i = 0; i < 4; i++) {
      if (await page.getByRole("dialog").count()) break; // game already over
      const before = await page.evaluate(() => window.scrollY);
      await expect(enabled.first()).toBeVisible();
      await enabled.first().click();
      await page.getByRole("button", { name: /Rải/ }).first().click();
      await expect(page.getByText(`#${i * (url.includes("bot") ? 2 : 1) + 1}`)).toBeVisible();
      await page.waitForTimeout(300);
      expect(await page.evaluate(() => window.scrollY), `${url} move ${i + 1}`).toBe(before);
      // wait for our turn again (or the end of the game)
      await expect(async () => {
        expect((await enabled.count()) > 0 || (await page.getByRole("dialog").count()) > 0).toBe(true);
      }).toPass({ timeout: 15_000 });
    }
  }
});

test("the page keeps its scroll position when the player is scrolled down a bit", async ({ page }) => {
  await page.goto("/play/local?players=2");
  await page.evaluate(() => window.scrollTo(0, 120));
  const before = await page.evaluate(() => window.scrollY);
  await page.locator("[role=group] button:not([disabled])").first().click();
  await page.getByRole("button", { name: /Rải/ }).first().click();
  await expect(page.getByText("#1")).toBeVisible();
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.scrollY)).toBe(before);
});
