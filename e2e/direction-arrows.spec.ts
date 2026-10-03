import { expect, test } from "@playwright/test";

const BOARD = /Bàn cờ \d người chơi/;
const center = (b: { x: number; y: number; width: number; height: number }) => ({
  x: b.x + b.width / 2,
  y: b.y + b.height / 2,
});

for (const players of [2, 3, 4]) {
  test(`${players} players: choosing a house puts one arrow on each side of it`, async ({ page }) => {
    await page.goto(`/play/bot?players=${players}&level=easy`);
    const board = page.getByRole("group", { name: BOARD });
    const houses = board.locator("button:not([disabled])");
    await expect(houses).toHaveCount(5);
    const vp = page.viewportSize()!;

    // (a few houses only: the 10 s turn clock keeps running while we look)
    for (const i of [0, 2, 4]) {
      const scrollBefore = await page.evaluate(() => window.scrollY);
      await houses.nth(i).click();
      const arrows = page.getByRole("group", { name: "Chọn hướng rải" }).getByRole("button");
      await expect(arrows).toHaveCount(2);

      const h = center((await board.locator("button[aria-pressed=true]").boundingBox())!);
      const houseW = (await board.locator("button[aria-pressed=true]").boundingBox())!.width;
      const a = await arrows.nth(0).boundingBox();
      const b = await arrows.nth(1).boundingBox();
      const va = { x: center(a!).x - h.x, y: center(a!).y - h.y };
      const vb = { x: center(b!).x - h.x, y: center(b!).y - h.y };
      // hugging the house, not floating elsewhere
      expect(Math.hypot(va.x, va.y), `house ${i}`).toBeLessThan(houseW + 20);
      expect(Math.hypot(vb.x, vb.y), `house ${i}`).toBeLessThan(houseW + 20);
      // on opposite sides of it
      expect(va.x * vb.x + va.y * vb.y, `house ${i}: arrows must be on opposite sides`).toBeLessThan(0);
      // fully on screen, and nothing scrolled
      for (const box of [a!, b!]) {
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(vp.width);
        expect(box.width).toBeGreaterThanOrEqual(36);
      }
      expect(await page.evaluate(() => window.scrollY)).toBe(scrollBefore);
    }
  });
}

test("on a horizontal row the arrows are left and right and point that way", async ({ page }) => {
  await page.goto("/play/local?players=2");
  const board = page.getByRole("group", { name: BOARD });
  await board.locator("button:not([disabled])").nth(2).click();
  const group = page.getByRole("group", { name: "Chọn hướng rải" });
  const left = group.getByRole("button", { name: "Rải theo chiều kim đồng hồ" });
  const right = group.getByRole("button", { name: "Rải ngược chiều kim đồng hồ" });
  const h = center((await board.locator("button[aria-pressed=true]").boundingBox())!);
  expect(center((await left.boundingBox())!).x).toBeLessThan(h.x);
  expect(center((await right.boundingBox())!).x).toBeGreaterThan(h.x);
  expect(Math.abs(center((await left.boundingBox())!).y - h.y)).toBeLessThan(4); // level with the house
  expect(await left.locator("svg").evaluate((el) => (el as SVGElement).style.transform)).toMatch(/rotate\(-?180deg\)/);
  expect(await right.locator("svg").evaluate((el) => (el as SVGElement).style.transform)).toMatch(/rotate\(-?0deg\)/);
});

test("there is no direction bar under the board; deselecting hides the arrows; picking plays the move", async ({ page }) => {
  await page.goto("/play/local?players=2");
  const board = page.getByRole("group", { name: BOARD });
  const arrows = page.getByRole("group", { name: "Chọn hướng rải" });
  await expect(arrows).toHaveCount(0);

  await board.locator("button:not([disabled])").nth(2).click();
  await expect(arrows).toBeVisible();
  await expect(page.getByRole("button", { name: /Rải/ })).toHaveCount(2); // only the two beside the house

  await board.locator("button[aria-pressed=true]").click(); // tap the same house again
  await expect(arrows).toHaveCount(0);

  await board.locator("button:not([disabled])").nth(2).click();
  await arrows.getByRole("button", { name: "Rải theo chiều kim đồng hồ" }).click();
  await expect(page.getByText("#1")).toBeVisible();
  await expect(arrows).toHaveCount(0);
});
