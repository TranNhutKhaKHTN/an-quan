import { expect, test } from "@playwright/test";

const timer = (p: import("@playwright/test").Page) => p.getByTestId("turn-timer");
const houses = (p: import("@playwright/test").Page) => p.locator("[role=group] button:not([disabled])");

test("vs bot: a 10 s clock counts down, and when it runs out a move is played for you", async ({ page }) => {
  await page.goto("/play/bot?players=2&level=easy");
  await expect(timer(page)).toBeVisible();
  await expect(timer(page)).toHaveText(/⏱ (10|9)s/);
  await expect(page.getByRole("timer")).toHaveAttribute("aria-label", /Còn \d+ giây/);

  // it really counts down
  await expect(timer(page)).toHaveText(/⏱ [4-7]s/, { timeout: 8_000 });
  // last seconds turn urgent (red, pulsing)
  await expect(timer(page)).toHaveClass(/bg-red-600/, { timeout: 8_000 });

  // time is up: the first legal move is played automatically and flagged in the history (#1 ⏱)
  await expect(page.getByText("#1")).toBeVisible({ timeout: 8_000 });
  await expect(page.getByText(/⏱$/).first()).toBeVisible();
  // then the bot answers, and the human gets a fresh 10 s
  await expect(page.getByText("#2")).toBeVisible({ timeout: 10_000 });
  await expect(timer(page)).toHaveText(/⏱ (10|9)s/, { timeout: 10_000 });
});

test("vs bot: the clock is hidden while pieces move and while the bot plays, then returns for you", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" }); // real-length animations and bot pause
  await page.goto("/play/bot?players=2&level=easy");
  await expect(timer(page)).toBeVisible();
  await houses(page).first().click();
  await page.getByRole("button", { name: /Rải/ }).first().click();
  await expect(timer(page)).toHaveCount(0); // our pieces are moving
  await expect(page.getByText("#2")).toBeVisible({ timeout: 30_000 }); // the bot has played
  await expect(timer(page)).toBeVisible({ timeout: 30_000 }); // and the clock is back for us
  await expect(timer(page)).toHaveText(/⏱ (10|9|8)s/);
});

test("hotseat: every seat gets 10 s and the clock restarts after a move", async ({ page }) => {
  await page.goto("/play/local?players=2");
  await expect(timer(page)).toHaveText(/⏱ (10|9)s/);
  await page.waitForTimeout(3_000);
  await houses(page).first().click();
  await page.getByRole("button", { name: /Rải/ }).first().click();
  await expect(page.getByText("#1")).toBeVisible();
  await expect(timer(page)).toHaveText(/⏱ (10|9)s/); // second player starts from 10 again
});

test("the clock disappears when the game is over", async ({ page }) => {
  page.on("dialog", (d) => d.accept());
  await page.goto("/play/local?players=2");
  await expect(timer(page)).toBeVisible();
  await page.getByRole("button", { name: "Đầu hàng" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(timer(page)).toHaveCount(0);
});
