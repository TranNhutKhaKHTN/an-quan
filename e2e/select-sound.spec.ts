import { expect, test, type Page } from "@playwright/test";

/** Records every AudioBuffer playback (the recorded select sound); oscillator effects are not counted. */
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __sfx: number[] };
    w.__sfx = [];
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...args) {
      w.__sfx.push(this.buffer?.duration ?? -1);
      return start.apply(this, args);
    };
  });
});

const plays = (p: Page) => p.evaluate(() => (window as unknown as { __sfx: number[] }).__sfx);
const houses = (p: Page) => p.locator("[role=group] button:not([disabled])");
/** The effect is decoded in the background after load; wait until the first tap can be heard. */
const ready = async (p: Page) => {
  await p.waitForFunction(() => fetch("/sfx/select.wav").then((r) => r.ok));
  await p.waitForTimeout(600);
};

test("the select sound is served as a short, decodable audio file", async ({ page }) => {
  await page.goto("/");
  const info = await page.evaluate(async () => {
    const res = await fetch("/sfx/select.wav");
    const ctx = new AudioContext();
    const buf = await ctx.decodeAudioData(await res.arrayBuffer());
    return { ok: res.ok, type: res.headers.get("content-type"), duration: buf.duration, channels: buf.numberOfChannels };
  });
  expect(info.ok).toBe(true);
  expect(info.type).toMatch(/audio|wav/);
  expect(info.duration).toBeGreaterThan(0.5);
  expect(info.duration).toBeLessThan(1.5);
});

test("choosing a game mode on the home page plays the select sound", async ({ page }) => {
  await page.goto("/");
  await ready(page);
  expect(await plays(page)).toHaveLength(0);
  await page.getByRole("link", { name: /Bạn \+ 1 máy/ }).click();
  await expect(page.getByRole("group", { name: /Bàn cờ 2 người chơi/ })).toBeVisible();
  const p = await plays(page);
  expect(p).toHaveLength(1);
  expect(p[0]).toBeGreaterThan(0.5);
});

test("choosing a house is silent (only modes and settings have the select sound)", async ({ page }) => {
  await page.goto("/play/bot?players=2&level=easy");
  await ready(page);
  await houses(page).nth(0).click();
  await houses(page).nth(1).click();
  expect(await plays(page)).toHaveLength(0);
});

test("changing difficulty or player count also plays the select sound", async ({ page }) => {
  await page.goto("/play/bot?players=2&level=medium");
  await ready(page);
  await page.getByRole("navigation", { name: "Độ khó" }).getByRole("link", { name: "Khó" }).click();
  await expect(page).toHaveURL(/level=hard/);
  expect(await plays(page)).toHaveLength(1);
  await page.getByRole("navigation", { name: "Số người chơi" }).getByRole("link", { name: "3 người" }).click();
  await expect(page).toHaveURL(/players=3/);
  expect(await plays(page)).toHaveLength(2);
});

test("the Âm thanh switch silences it, and the choice survives a reload", async ({ page }) => {
  const players = (n: number) =>
    page.getByRole("navigation", { name: "Số người chơi" }).getByRole("link", { name: `${n} người` });
  await page.goto("/play/bot?players=2&level=easy");
  await ready(page);
  await page.getByRole("button", { name: "Âm thanh" }).click();
  await expect(page.getByRole("button", { name: "Âm thanh" })).toHaveAttribute("aria-pressed", "false");
  await players(3).click();
  await expect(page).toHaveURL(/players=3/);
  expect(await plays(page)).toHaveLength(0);
  expect(await page.evaluate(() => localStorage.getItem("aq:sfx"))).toBe("off");

  await page.reload();
  await ready(page);
  await expect(page.getByRole("button", { name: "Âm thanh" })).toHaveAttribute("aria-pressed", "false");
  await players(4).click();
  await expect(page).toHaveURL(/players=4/);
  expect(await plays(page)).toHaveLength(0);

  await page.getByRole("button", { name: "Âm thanh" }).click(); // back on
  await players(2).click();
  await expect(page).toHaveURL(/players=2/);
  expect(await plays(page)).toHaveLength(1);
});
