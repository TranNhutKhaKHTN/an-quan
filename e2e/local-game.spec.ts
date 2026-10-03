import { expect, test, type Page } from "@playwright/test";

async function playUntilFinished(page: Page, maxMoves = 600) {
  for (let i = 0; i < maxMoves; i++) {
    if (await page.getByRole("dialog").count()) return i;
    const houses = page.locator("[role=group] button:not([disabled])");
    const n = await houses.count();
    if (!n) {
      await page.waitForTimeout(30);
      continue;
    }
    await houses.nth(i % n).click();
    await page.getByRole("button", { name: /Rải/ }).nth(i % 2).click();
    await expect(page.getByText("Đang rải")).toHaveCount(0);
  }
  throw new Error("game did not finish");
}

for (const players of [2, 3, 4]) {
  test(`local ${players}-player game plays to the end and can rematch`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`/play/local?players=${players}`);
    await expect(page.getByRole("group", { name: new RegExp(`${players} người chơi`) })).toBeVisible();
    // only the current seat's non-empty houses are interactive at the start
    await expect(page.locator("[role=group] button:not([disabled])")).toHaveCount(5);

    await playUntilFinished(page);
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText(/chiến thắng|Hòa/);
    await dialog.getByRole("button", { name: "Chơi lại" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.locator("[role=group] button:not([disabled])")).toHaveCount(5);
    expect(errors).toEqual([]);
  });
}

test("rules dialog opens from the game screen", async ({ page }) => {
  await page.goto("/play/local?players=2");
  await page.getByRole("button", { name: "Luật chơi" }).click();
  await expect(page.getByRole("dialog")).toContainText("Luật chơi Ô Ăn Quan");
});

test("surrender ends a 2-player game", async ({ page }) => {
  page.on("dialog", (d) => d.accept());
  await page.goto("/play/local?players=2");
  await page.getByRole("button", { name: "Đầu hàng" }).click();
  await expect(page.getByRole("dialog")).toContainText("Người chơi 2 chiến thắng");
});

test("board fits the viewport without horizontal scroll", async ({ page }) => {
  for (const p of [2, 3, 4]) {
    await page.goto(`/play/local?players=${p}`);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  }
});
