// Renders the social-share image (1200x630) with Chromium so Vietnamese diacritics are exact.
// Usage: node scripts/generate-og-image.mjs   (re-run after changing the design below)
import { chromium } from "@playwright/test";
import { copyFileSync } from "node:fs";

const pit = (n) => {
  const dots = Array.from({ length: n }, (_, i) => {
    const a = i * 2.4;
    const r = 6 + 9 * Math.sqrt((i + 0.5) / 5);
    return `<i style="left:${50 + r * 3.1 * Math.cos(a)}%;top:${50 + r * 3.1 * Math.sin(a)}%"></i>`;
  }).join("");
  return `<div class="pit">${dots}</div>`;
};
const row = `${pit(5)}${pit(5)}${pit(5)}${pit(5)}${pit(5)}`;

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box;margin:0}
body{width:1200px;height:630px;overflow:hidden;font-family:"Helvetica Neue",Arial,sans-serif;
 background:radial-gradient(900px 500px at 25% 0%,#fff8e1,transparent 70%),#fbf5e6;color:#3b2a1a;display:flex}
.left{width:620px;padding:62px 0 0 72px}
.badge{display:inline-flex;gap:10px;align-items:center;background:#2f6f4e;color:#fffaf0;border-radius:999px;padding:10px 22px;font-size:26px;font-weight:600}
h1{font-size:116px;line-height:1.02;margin-top:26px;color:#6b4423;font-weight:900;letter-spacing:-3px}
p{font-size:31px;margin-top:20px;color:#7a6246;line-height:1.35;max-width:480px}
.chips{display:flex;gap:12px;margin-top:28px}
.chips span{background:#f1e4c8;border-radius:999px;padding:10px 22px;font-size:26px;font-weight:600;color:#5a3d22}
.right{position:relative;width:580px}
.board{position:absolute;left:18px;top:170px;width:520px;height:290px;border-radius:56px;transform:rotate(-5deg);
 background:repeating-linear-gradient(95deg,rgba(0,0,0,.035) 0 2px,transparent 2px 9px),linear-gradient(135deg,#c99a5b,#a8743a);
 border:8px solid rgba(107,68,35,.75);box-shadow:inset 0 3px 0 rgba(255,255,255,.25),inset 0 -10px 22px rgba(0,0,0,.25),0 40px 60px -20px rgba(60,35,10,.6)}
.rows{position:absolute;left:96px;right:96px;top:30px;bottom:30px;display:flex;flex-direction:column;justify-content:space-between}
.r{display:grid;grid-template-columns:repeat(5,1fr);gap:10px}
.pit{position:relative;aspect-ratio:1;border-radius:50%;background:radial-gradient(circle at 50% 35%,#9a6a38,#7a4f27 55%,#5a3818);
 box-shadow:inset 0 6px 12px rgba(0,0,0,.45),0 1px 0 rgba(255,255,255,.25)}
.pit i{position:absolute;width:15%;height:15%;margin:-7.5% 0 0 -7.5%;border-radius:50%;background:radial-gradient(circle at 35% 30%,#fff,#e8d9b5 70%);box-shadow:0 2px 3px rgba(0,0,0,.5)}
.quan{position:absolute;top:50%;width:96px;height:96px;margin-top:-48px;border-radius:50%;
 background:radial-gradient(circle at 50% 35%,#9a6a38,#7a4f27 55%,#5a3818);box-shadow:inset 0 6px 12px rgba(0,0,0,.45)}
.quan b{position:absolute;inset:17px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#fff1a8,#e0a416 60%,#a86f06);box-shadow:0 5px 9px rgba(0,0,0,.4),inset 0 -5px 8px rgba(0,0,0,.25)}
</style></head><body>
<div class="left">
  <span class="badge">♜ Trò chơi dân gian Việt Nam</span>
  <h1>Ô Ăn<br>Quan</h1>
  <p>Chơi với máy hoặc cùng bạn bè, ngay trên trình duyệt.</p>
  <div class="chips"><span>2 người</span><span>3 người</span><span>4 người</span></div>
</div>
<div class="right"><div class="board">
  <div class="quan" style="left:-4px"><b></b></div><div class="quan" style="right:-4px"><b></b></div>
  <div class="rows"><div class="r">${row}</div><div class="r">${row}</div></div>
</div></div>
</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.setContent(html);
await page.screenshot({ path: "src/app/opengraph-image.png" });
await browser.close();
copyFileSync("src/app/opengraph-image.png", "src/app/twitter-image.png");
console.log("wrote src/app/opengraph-image.png and twitter-image.png");
