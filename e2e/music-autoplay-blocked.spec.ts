import { expect, test, type Page } from "@playwright/test";

// Real browsers (Safari, Chrome) reject play() until the user has interacted with the page.
// Chromium under Playwright always allows autoplay, so emulate the policy deterministically.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    let activated = false;
    for (const type of ["pointerdown", "keydown", "touchstart"])
      window.addEventListener(type, () => (activated = true), true);
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      return activated ? play.call(this) : Promise.reject(new DOMException("blocked", "NotAllowedError"));
    };
  });
});

const audio = (p: Page) => p.evaluate(() => ({ paused: document.querySelector("audio")!.paused }));
const toggle = (p: Page) => p.locator("[data-music-toggle]");

test("the music waits for a gesture, then starts", async ({ page }) => {
  await page.goto("/");
  await page.waitForTimeout(800);
  expect((await audio(page)).paused, "blocked before any gesture").toBe(true);
  await expect(toggle(page)).toHaveAccessibleName("Bật nhạc nền");
  await page.mouse.click(5, 5);
  await expect.poll(async () => (await audio(page)).paused, { timeout: 8_000 }).toBe(false);
  await expect(toggle(page)).toHaveAccessibleName("Tắt nhạc nền");
});

test("tapping the button as the very first gesture starts the music instead of muting it", async ({ page }) => {
  await page.goto("/");
  await page.waitForTimeout(800);
  expect((await audio(page)).paused).toBe(true);
  await toggle(page).click();
  await expect.poll(async () => (await audio(page)).paused, { timeout: 8_000 }).toBe(false);
  await expect(toggle(page)).toHaveAttribute("aria-pressed", "true");
  expect(await page.evaluate(() => localStorage.getItem("aq:music"))).not.toBe("off");
  // a second tap now mutes it
  await toggle(page).click();
  await expect.poll(async () => (await audio(page)).paused).toBe(true);
});

