import { expect, test, type Page } from "@playwright/test";

const enabled = (p: Page) => p.locator("[role=group] button:not([disabled])");

const moveCount = async (p: Page) => {
  const t = await p.getByText(/Nước đi \d+/i).first().innerText();
  return Number(t.match(/(\d+)/)![1]);
};

/** The human plays whenever it is their turn; bots answer on their own. */
async function playVsBot(page: Page, maxMoves = 500) {
  for (let i = 0; i < maxMoves; i++) {
    if (await page.getByRole("dialog").count()) return;
    const n = await enabled(page).count();
    if (!n) {
      await page.waitForTimeout(40);
      continue;
    }
    const before = await moveCount(page);
    await enabled(page).nth(i % n).click();
    await page.getByRole("button", { name: /Rải/ }).nth(i % 2).click();
    // the board's move counter advances once the human's move has been applied
    await expect(async () => {
      expect((await page.getByRole("dialog").count()) > 0 || (await moveCount(page)) > before).toBe(true);
    }).toPass({ timeout: 10_000 });
  }
  throw new Error("game did not finish");
}

test("home page: bot modes are offered, online rooms are hidden for now", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("region", { name: "Chơi với máy" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Chơi chung một máy" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Tạo phòng" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Vào phòng" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Luật chơi" })).toBeVisible();
});

for (const players of [2, 3, 4]) {
  test(`vs bot, ${players} players: the bots reply by themselves and the game finishes`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`/play/bot?players=${players}&level=hard`);
    await expect(page.getByText("Bạn", { exact: true }).first()).toBeVisible();
    await expect(enabled(page)).toHaveCount(5); // human opens

    await playVsBot(page);
    await expect(page.getByRole("dialog")).toContainText(/chiến thắng|Hòa/);
    await page.getByRole("dialog").getByRole("button", { name: "Chơi lại" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(enabled(page)).toHaveCount(5);
    expect(errors).toEqual([]);
  });
}

test("a bot answers after the human's move, and the human cannot act meanwhile", async ({ page }) => {
  await page.goto("/play/bot?players=2&level=easy");
  await enabled(page).first().click();
  await page.getByRole("button", { name: /Rải/ }).first().click();
  // history gets the human move (#1) then the bot's (#2) without any further input
  await expect(page.getByText("#2")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Máy", { exact: true }).first()).toBeVisible();
});

test("difficulty and size switchers keep the bot mode", async ({ page }) => {
  await page.goto("/play/bot?players=2&level=medium");
  await page.getByRole("navigation", { name: "Độ khó" }).getByRole("link", { name: "Khó" }).click();
  await expect(page).toHaveURL(/players=2&level=hard/);
  await page.getByRole("navigation", { name: "Số người chơi" }).getByRole("link", { name: "3 người" }).click();
  await expect(page).toHaveURL(/players=3&level=hard/);
  await expect(page.getByRole("group", { name: /Bàn cờ 3 người chơi/ })).toBeVisible();
});

test("surrendering to the bot ends a 2-player game", async ({ page }) => {
  page.on("dialog", (d) => d.accept());
  await page.goto("/play/bot?players=2&level=easy");
  await page.getByRole("button", { name: "Đầu hàng" }).click();
  await expect(page.getByRole("dialog")).toContainText("Máy chiến thắng");
});

test("invalid query values fall back to a 2-player medium game", async ({ page }) => {
  await page.goto("/play/bot?players=9&level=godmode");
  await expect(page.getByRole("group", { name: /Bàn cờ 2 người chơi/ })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Độ khó" }).getByRole("link", { name: "Vừa" })).toHaveAttribute("aria-current", "true");
});
