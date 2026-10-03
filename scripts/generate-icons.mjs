// Draws the app icon (a wooden pit holding the golden quan) and writes the files Next.js picks up
// automatically: src/app/icon.png, apple-icon.png and favicon.ico (16/32/48 px).
// Usage: node scripts/generate-icons.mjs
import { chromium } from "@playwright/test";
import { writeFileSync } from "node:fs";

const svg = (full) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="100%" height="100%">
<defs>
  <linearGradient id="wood" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#d9aa6a"/><stop offset="1" stop-color="#a06a32"/></linearGradient>
  <radialGradient id="pit" cx="50%" cy="38%" r="65%"><stop offset="0" stop-color="#a5733d"/><stop offset=".6" stop-color="#7a4f27"/><stop offset="1" stop-color="#4f3014"/></radialGradient>
  <radialGradient id="gold" cx="36%" cy="30%" r="75%"><stop offset="0" stop-color="#fff4b0"/><stop offset=".55" stop-color="#e8aa14"/><stop offset="1" stop-color="#a86b05"/></radialGradient>
</defs>
<rect width="512" height="512" rx="${full ? 0 : 112}" fill="url(#wood)"/>
${full ? "" : '<rect x="6" y="6" width="500" height="500" rx="108" fill="none" stroke="#fff3d6" stroke-opacity=".55" stroke-width="8"/>'}
<circle cx="256" cy="262" r="186" fill="url(#pit)"/>
<circle cx="256" cy="262" r="186" fill="none" stroke="#3a220d" stroke-opacity=".5" stroke-width="10"/>
<ellipse cx="270" cy="318" rx="96" ry="30" fill="#000" fill-opacity=".28"/>
<circle cx="256" cy="246" r="104" fill="url(#gold)"/>
<circle cx="256" cy="246" r="104" fill="none" stroke="#8a5503" stroke-opacity=".55" stroke-width="7"/>
<ellipse cx="222" cy="206" rx="34" ry="20" fill="#fff" fill-opacity=".6" transform="rotate(-28 222 206)"/>
</svg>`;

const browser = await chromium.launch();
const page = await browser.newPage();
async function render(size, full = false) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<body style="margin:0;background:transparent">${svg(full)}</body>`);
  return page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
}

writeFileSync("src/app/icon.png", await render(512));
writeFileSync("src/app/apple-icon.png", await render(180, true)); // iOS rounds the corners itself

// ICO with embedded PNGs (supported by every current browser)
const sizes = [16, 32, 48];
const pngs = await Promise.all(sizes.map((s) => render(s)));
const header = Buffer.alloc(6);
header.writeUInt16LE(1, 2); // type: icon
header.writeUInt16LE(sizes.length, 4);
let offset = 6 + 16 * sizes.length;
const entries = sizes.map((s, i) => {
  const e = Buffer.alloc(16);
  e.writeUInt8(s, 0);
  e.writeUInt8(s, 1);
  e.writeUInt16LE(1, 4); // planes
  e.writeUInt16LE(32, 6); // bits per pixel
  e.writeUInt32LE(pngs[i].length, 8);
  e.writeUInt32LE(offset, 12);
  offset += pngs[i].length;
  return e;
});
writeFileSync("src/app/favicon.ico", Buffer.concat([header, ...entries, ...pngs]));
await browser.close();
console.log("wrote src/app/icon.png, apple-icon.png, favicon.ico");
