import { expect, test, type Page } from "@playwright/test";

const audio = (p: Page) =>
  p.evaluate(() => {
    const a = document.querySelector("audio")!;
    return { paused: a.paused, loop: a.loop, volume: a.volume, time: a.currentTime, src: new URL(a.src).pathname };
  });
const toggle = (p: Page) => p.locator("[data-music-toggle]");

test("background music loops, starts on the first tap, and uses the music file", async ({ page }) => {
  await page.goto("/");
  await expect(toggle(page)).toBeVisible();
  await page.mouse.click(5, 5); // first gesture
  await expect.poll(async () => (await audio(page)).paused, { timeout: 8_000 }).toBe(false);
  const a = await audio(page);
  expect(a.src).toBe("/audio.m4a");
  expect(a.loop).toBe(true);
  expect(a.volume).toBeLessThan(0.6); // background level
  await expect(toggle(page)).toHaveAttribute("aria-pressed", "true");
  await expect(toggle(page)).toHaveAccessibleName("Tắt nhạc nền");
  // it is actually advancing
  await expect.poll(async () => (await audio(page)).time, { timeout: 8_000 }).toBeGreaterThan(0.3);
});

test("the button turns the music off and on, and the choice is remembered", async ({ page }) => {
  await page.goto("/");
  await page.mouse.click(5, 5);
  await expect.poll(async () => (await audio(page)).paused, { timeout: 8_000 }).toBe(false);

  await toggle(page).click();
  await expect.poll(async () => (await audio(page)).paused).toBe(true);
  await expect(toggle(page)).toHaveAttribute("aria-pressed", "false");
  await expect(toggle(page)).toHaveAccessibleName("Bật nhạc nền");
  expect(await page.evaluate(() => localStorage.getItem("aq:music"))).toBe("off");

  // stays off after a reload, even after tapping around
  await page.reload();
  await page.mouse.click(5, 5);
  await page.waitForTimeout(800);
  expect((await audio(page)).paused).toBe(true);
  await expect(toggle(page)).toHaveAccessibleName("Bật nhạc nền");

  await toggle(page).click();
  await expect.poll(async () => (await audio(page)).paused, { timeout: 8_000 }).toBe(false);
  expect(await page.evaluate(() => localStorage.getItem("aq:music"))).toBe("on");
});

test("the music keeps playing without restarting when you move between pages", async ({ page }) => {
  await page.goto("/");
  await page.mouse.click(5, 5);
  await expect.poll(async () => (await audio(page)).time, { timeout: 8_000 }).toBeGreaterThan(0.5);
  await page.evaluate(() => ((document.querySelector("audio") as HTMLAudioElement & { __m?: number }).__m = 1));
  const before = (await audio(page)).time;

  await page.getByRole("link", { name: /Bạn \+ 1 máy/ }).click();
  await expect(page.getByRole("group", { name: /Bàn cờ 2 người chơi/ })).toBeVisible();

  const same = await page.evaluate(() => (document.querySelector("audio") as HTMLAudioElement & { __m?: number }).__m);
  expect(same, "same <audio> element: no remount").toBe(1);
  const after = await audio(page);
  expect(after.paused).toBe(false);
  expect(after.time).toBeGreaterThanOrEqual(before);
});

test("the button never covers the board controls on a phone", async ({ page }) => {
  await page.goto("/play/bot?players=2&level=easy");
  const box = await toggle(page).boundingBox();
  const vp = page.viewportSize()!;
  expect(box!.x + box!.width).toBeLessThanOrEqual(vp.width);
  expect(box!.y + box!.height).toBeLessThanOrEqual(vp.height);
  // the board's own houses stay clickable (no overlay on top of them)
  await page.locator("[role=group] button:not([disabled])").first().click();
  await expect(page.getByRole("button", { name: /Rải/ }).first()).toBeVisible();
});
