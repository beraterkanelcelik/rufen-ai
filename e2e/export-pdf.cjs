// Export the reveal.js pitch deck to a paginated PDF (one slide per page).
// Usage: serve the deck (python3 -m http.server 8088) then: node export-pdf.cjs
const { chromium } = require("@playwright/test");

const BASE = process.env.DECK_URL || "http://localhost:8088/pitch/index.html";
const OUT = "../pitch/Outbound-Autopilot-Rufen-Cara8.pdf";
const SLIDES = 8;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 2,
  });

  const shots = [];
  for (let i = 0; i < SLIDES; i++) {
    await page.goto(`${BASE}#/${i}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(800);
    const buf = await page.screenshot({ type: "png" });
    shots.push(buf.toString("base64"));
  }

  const imgs = shots
    .map((s) => `<img src="data:image/png;base64,${s}"/>`)
    .join("");
  const html = `<!doctype html><html><head><style>
    @page { size: 1280px 720px; margin: 0; }
    html, body { margin: 0; padding: 0; background: #0a0a0a; }
    img { display: block; width: 1280px; height: 720px; page-break-after: always; }
  </style></head><body>${imgs}</body></html>`;

  const printer = await browser.newPage();
  await printer.setContent(html, { waitUntil: "networkidle" });
  await printer.pdf({ path: OUT, width: "1280px", height: "720px", printBackground: true });

  await browser.close();
  console.log("PDF written →", OUT);
})();
