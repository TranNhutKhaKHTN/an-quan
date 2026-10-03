import { expect, test, type Browser, type Page, type TestInfo } from "@playwright/test";
import { Hub, installFakeSupabase } from "./support/fakeSupabase";

/** A separate browser context = a separate player (own storage, own guest identity). */
async function newPlayer(browser: Browser, testInfo: TestInfo, hub: Hub): Promise<Page> {
  const { defaultBrowserType: _ignored, ...use } = testInfo.project.use as Record<string, unknown>;
  void _ignored;
  const context = await browser.newContext({ ...use, baseURL: testInfo.project.use.baseURL });
  await installFakeSupabase(context, hub);
  const page = await context.newPage();
  page.on("pageerror", (e) => {
    throw new Error(`page error: ${e.message}`);
  });
  return page;
}

async function createRoom(host: Page, opts: { players?: 2 | 3; isPublic?: boolean; name?: string } = {}) {
  await host.goto("/");
  await host.getByRole("button", { name: "Tạo phòng" }).click();
  const dlg = host.getByRole("dialog");
  await dlg.getByLabel("Tên hiển thị").fill(opts.name ?? "Chủ nhà");
  if (opts.players === 3) await dlg.getByRole("button", { name: /^3 người/ }).click();
  if (opts.isPublic) await dlg.getByLabel(/Phòng công khai/).check();
  await dlg.getByRole("button", { name: "Tạo phòng" }).click();
  await host.waitForURL(/\/lobby\/[A-Z0-9]{6}$/);
  const code = (await host.getByTestId("room-code").innerText()).trim();
  const invite = await host.getByLabel("Đường dẫn mời", { exact: true }).inputValue();
  expect(invite).toContain(`/lobby/${code}`);
  return { code, invite };
}

async function joinViaLink(guest: Page, invite: string, name: string) {
  await guest.goto(invite);
  await guest.getByLabel("Tên hiển thị").fill(name);
  await guest.getByRole("button", { name: "Vào phòng" }).click();
  await expect(guest.getByRole("button", { name: /Sẵn sàng/ })).toBeVisible();
}

const enabledHouses = (p: Page) => p.locator("[role=group] button:not([disabled])");

/** Let whoever has the move play a (deterministic, varied) move until a result dialog shows. */
async function playToEnd(pages: Page[], maxMoves = 800) {
  for (let i = 0; i < maxMoves; i++) {
    for (const p of pages) {
      if (await p.getByRole("dialog").count()) return;
    }
    let moved = false;
    for (const p of pages) {
      const n = await enabledHouses(p).count();
      if (!n) continue;
      await enabledHouses(p).nth(i % n).click();
      await p.getByRole("button", { name: /Rải/ }).nth(i % 2).click();
      // wait for the server to accept the move and the turn to pass (or the game to end)
      await expect(async () => {
        const stillMine = await enabledHouses(p).count();
        const done = await p.getByRole("dialog").count();
        expect(stillMine === 0 || done > 0).toBe(true);
      }).toPass({ timeout: 10_000 });
      moved = true;
      break;
    }
    if (!moved) await pages[0].waitForTimeout(100);
  }
  throw new Error("game did not finish");
}

test("2 players: create, share the invite link, join, play to the end and rematch", async ({ browser }, testInfo) => {
  const hub = new Hub();
  const host = await newPlayer(browser, testInfo, hub);
  const guest = await newPlayer(browser, testInfo, hub);

  const { code, invite } = await createRoom(host);
  await expect(host.getByTestId("player-count")).toHaveText("1/2 người");
  await expect(host.getByRole("button", { name: "Bắt đầu ván đấu" })).toBeDisabled();

  await joinViaLink(guest, invite, "Khách");
  // realtime: the host sees the newcomer without reloading
  await expect(host.getByTestId("player-count")).toHaveText("2/2 người");
  await expect(host.getByText("Khách")).toBeVisible();
  await expect(host.getByRole("button", { name: "Bắt đầu ván đấu" })).toBeDisabled(); // guest not ready yet

  await guest.getByRole("button", { name: "Sẵn sàng" }).click();
  const start = host.getByRole("button", { name: "Bắt đầu ván đấu" });
  await expect(start).toBeEnabled();
  if (process.env.SHOTS) {
    await host.screenshot({ path: `${process.env.SHOTS}/lobby-host-${testInfo.project.name}.png`, fullPage: true });
    await guest.screenshot({ path: `${process.env.SHOTS}/lobby-guest-${testInfo.project.name}.png`, fullPage: true });
  }
  await start.click();

  await Promise.all([host, guest].map((p) => p.waitForURL(new RegExp(`/game/${code}$`))));
  for (const p of [host, guest]) await expect(p.getByRole("group", { name: /Bàn cờ 2 người chơi/ })).toBeVisible();
  // only the player on turn (the host, seat 1) can act
  await expect(enabledHouses(host)).toHaveCount(5);
  await expect(enabledHouses(guest)).toHaveCount(0);

  if (process.env.SHOTS) await host.screenshot({ path: `${process.env.SHOTS}/game-host-${testInfo.project.name}.png`, fullPage: true });
  await playToEnd([host, guest]);
  for (const p of [host, guest]) await expect(p.getByRole("dialog")).toContainText(/chiến thắng|Hòa/);
  // both players see identical results
  expect(await host.getByRole("dialog").innerText()).toEqual(await guest.getByRole("dialog").innerText());

  // rematch needs both players
  await host.getByRole("dialog").getByRole("button", { name: "Chơi lại" }).click();
  await expect(host.getByRole("dialog").getByRole("button", { name: /Đang chờ đối thủ \(1\/2\)/ })).toBeDisabled();
  await guest.getByRole("dialog").getByRole("button", { name: "Chơi lại" }).click();
  for (const p of [host, guest]) await expect(p.getByRole("dialog")).toHaveCount(0);
  await expect(enabledHouses(host)).toHaveCount(5);
  await expect(host.getByText("Chưa có nước đi nào.")).toBeVisible();
});

test("3 players: the room fills up, a 4th person is turned away, and all three play", async ({ browser }, testInfo) => {
  const hub = new Hub();
  const [host, a, b, late] = await Promise.all([0, 1, 2, 3].map(() => newPlayer(browser, testInfo, hub)));
  const { code, invite } = await createRoom(host, { players: 3 });

  await joinViaLink(a, invite, "An");
  await expect(host.getByTestId("player-count")).toHaveText("2/3 người");
  await expect(host.getByText("Cần thêm 1 người chơi.")).toBeVisible();
  await joinViaLink(b, invite, "Bình");
  await expect(host.getByTestId("player-count")).toHaveText("3/3 người");

  await late.goto(invite);
  await expect(late.getByText("Phòng đã đủ người.")).toBeVisible();
  await expect(late.getByRole("button", { name: "Vào phòng" })).toHaveCount(0);

  await a.getByRole("button", { name: "Sẵn sàng" }).click();
  await expect(host.getByRole("button", { name: "Bắt đầu ván đấu" })).toBeDisabled();
  await b.getByRole("button", { name: "Sẵn sàng" }).click();
  await host.getByRole("button", { name: "Bắt đầu ván đấu" }).click();

  const players = [host, a, b];
  await Promise.all(players.map((p) => p.waitForURL(new RegExp(`/game/${code}$`))));
  for (const p of players) await expect(p.getByRole("group", { name: /Bàn cờ 3 người chơi/ })).toBeVisible();

  await playToEnd(players);
  for (const p of players) await expect(p.getByRole("dialog")).toContainText(/chiến thắng|Hòa/);
});

test("public rooms are listed and can be joined from the home page", async ({ browser }, testInfo) => {
  const hub = new Hub();
  const host = await newPlayer(browser, testInfo, hub);
  const guest = await newPlayer(browser, testInfo, hub);
  const priv = await newPlayer(browser, testInfo, hub);

  // the server's memory is shared by every test in the run, so names must be unique per project
  const hostName = `Chủ công khai ${testInfo.project.name}`;
  await createRoom(priv, { name: `Phòng riêng ${testInfo.project.name}` });
  const { code } = await createRoom(host, { isPublic: true, name: hostName });

  await guest.goto("/");
  await guest.getByRole("button", { name: "Vào phòng" }).click();
  const list = guest.getByRole("dialog").getByRole("region", { name: "Phòng công khai" });
  await expect(list.getByText(hostName)).toBeVisible();
  await expect(list.getByText("Phòng riêng")).toHaveCount(0);
  await list.getByText(hostName).click();
  await guest.waitForURL(new RegExp(`/lobby/${code}$`));
  await expect(guest.getByText("Bạn được mời vào phòng")).toBeVisible();
});

test("manual code entry, unknown rooms and invalid codes", async ({ browser }, testInfo) => {
  const hub = new Hub();
  const host = await newPlayer(browser, testInfo, hub);
  const guest = await newPlayer(browser, testInfo, hub);
  const { code } = await createRoom(host);

  await guest.goto("/");
  await guest.getByRole("button", { name: "Vào phòng" }).click();
  const dlg = guest.getByRole("dialog");
  await dlg.getByLabel("Mã phòng").fill("abc");
  await expect(dlg.getByRole("button", { name: "Vào", exact: true })).toBeDisabled();
  await dlg.getByLabel("Mã phòng").fill(code.toLowerCase());
  await dlg.getByRole("button", { name: "Vào", exact: true }).click();
  await guest.waitForURL(new RegExp(`/lobby/${code}$`));

  await guest.goto("/lobby/ZZZZZZ");
  await expect(guest.getByText("Không tìm thấy phòng ZZZZZZ")).toBeVisible();
  const bad = await guest.goto("/lobby/NOPE");
  expect(bad?.status()).toBe(404);
});

test("leaving the lobby frees the seat and hands the room over", async ({ browser }, testInfo) => {
  const hub = new Hub();
  const host = await newPlayer(browser, testInfo, hub);
  const guest = await newPlayer(browser, testInfo, hub);
  const { invite } = await createRoom(host);
  await joinViaLink(guest, invite, "Khách");
  await expect(host.getByTestId("player-count")).toHaveText("2/2 người");

  await host.getByRole("button", { name: "Rời phòng" }).click();
  await host.waitForURL("/");
  await expect(guest.getByTestId("player-count")).toHaveText("1/2 người");
  await expect(guest.getByRole("button", { name: "Bắt đầu ván đấu" })).toBeVisible(); // guest is now the host
});

test("reconnecting: dropped realtime catches up, and a new browser reclaims its seat with the session token", async ({
  browser,
}, testInfo) => {
  const hub = new Hub();
  const host = await newPlayer(browser, testInfo, hub);
  const guest = await newPlayer(browser, testInfo, hub);
  const { code, invite } = await createRoom(host);
  await joinViaLink(guest, invite, "Khách");
  await guest.getByRole("button", { name: "Sẵn sàng" }).click();
  await host.getByRole("button", { name: "Bắt đầu ván đấu" }).click();
  await Promise.all([host, guest].map((p) => p.waitForURL(new RegExp(`/game/${code}$`))));
  await expect(enabledHouses(host)).toHaveCount(5);

  // 1) both sockets drop; the host moves while the guest is "offline"
  hub.dropAll();
  await enabledHouses(host).first().click();
  await host.getByRole("button", { name: /Rải/ }).first().click();
  await expect(enabledHouses(host)).toHaveCount(0);
  // after realtime-js reconnects, the guest re-reads the authoritative state and can move
  await expect(enabledHouses(guest)).not.toHaveCount(0, { timeout: 30_000 });
  await expect(guest.getByText("#1")).toBeVisible();

  // 2) the guest's browser loses its identity (cleared auth) but still has the session token
  await guest.evaluate(() => localStorage.removeItem("aq-auth"));
  await guest.reload();
  await expect(guest.getByRole("group", { name: /Bàn cờ/ })).toBeVisible({ timeout: 20_000 });
  await expect(guest.getByText("(bạn)")).toBeVisible();
  await expect(enabledHouses(guest)).not.toHaveCount(0);
  await expect(guest.getByText("#1")).toBeVisible();

  // and it can still play from the reclaimed seat
  await enabledHouses(guest).first().click();
  await guest.getByRole("button", { name: /Rải/ }).first().click();
  await expect(host.getByText("#2")).toBeVisible();
});

test("surrender ends the game for everyone", async ({ browser }, testInfo) => {
  const hub = new Hub();
  const host = await newPlayer(browser, testInfo, hub);
  const guest = await newPlayer(browser, testInfo, hub);
  const { code, invite } = await createRoom(host);
  await joinViaLink(guest, invite, "Khách");
  await guest.getByRole("button", { name: "Sẵn sàng" }).click();
  await host.getByRole("button", { name: "Bắt đầu ván đấu" }).click();
  await Promise.all([host, guest].map((p) => p.waitForURL(new RegExp(`/game/${code}$`))));

  guest.once("dialog", (d) => d.accept());
  await guest.getByRole("button", { name: "Đầu hàng" }).click();
  for (const p of [host, guest]) await expect(p.getByRole("dialog")).toContainText("Chủ nhà chiến thắng");
});
