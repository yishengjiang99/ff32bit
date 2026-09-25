#!/usr/bin/env node
// Plays the demo against `vite preview` and expects the status to leave "Loading".
// Requires playwright and a Chromium build with a working audio device:
//   npm install --no-save playwright
//   npx playwright install chromium
//   npm run build && node playtest.cjs

const { spawn } = require("child_process");
const http = require("http");
const path = require("path");

const PORT = Number(process.env.PORT || 4173);
const BASE = process.env.BASE_URL || `http://127.0.0.1:${PORT}/`;

function loadChromium() {
  try {
    return require("playwright").chromium;
  } catch {
    console.error("playwright is not installed. Run: npm install --no-save playwright && npx playwright install chromium");
    process.exit(1);
  }
}

function ping(url) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      res.resume();
      resolve(res.statusCode >= 200 && res.statusCode < 500);
    });
    req.on("error", () => resolve(false));
    req.setTimeout(1000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function waitFor(url, tries = 40) {
  for (let i = 0; i < tries; i++) {
    if (await ping(url)) return;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`preview did not start at ${url}`);
}

async function main() {
  const chromium = loadChromium();
  let preview = null;
  if (!(await ping(BASE))) {
    preview = spawn("npx", ["vite", "preview", "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"], {
      cwd: path.resolve(__dirname),
      stdio: "inherit",
    });
    await waitFor(BASE);
  }

  const browser = await chromium.launch({
    headless: process.env.HEADLESS !== "0",
    args: ["--autoplay-policy=no-user-gesture-required", "--no-sandbox"],
  });
  const page = await browser.newPage();
  const logs = [];
  page.on("console", (msg) => logs.push(`CONSOLE ${msg.type()}: ${msg.text()}`));
  page.on("pageerror", (err) => logs.push(`PAGEERROR ${err}`));
  page.on("requestfailed", (req) => logs.push(`REQFAIL ${req.url()} ${req.failure()?.errorText}`));
  const ranges = [];
  page.on("request", (req) => {
    if (req.url().includes(".wav")) ranges.push(`${req.method()} range=${req.headers()["range"] || "-"}`);
  });
  page.on("response", (res) => {
    if (res.url().includes(".wav")) {
      logs.push(`WAV ${res.status()} cr=${res.headers()["content-range"] || ""} len=${res.headers()["content-length"] || ""}`);
    }
  });

  try {
    await page.goto(BASE, { waitUntil: "networkidle" });
    await page.click("#play");
    try {
      await page.waitForFunction(() => {
        const t = document.querySelector("#status")?.textContent || "";
        return /Playing|fail|Error|HTTP|error|did not load/i.test(t);
      }, { timeout: 20000 });
    } catch {
      logs.push("TIMEOUT waiting for status");
    }
    const status = await page.textContent("#status");
    console.log("STATUS:", status);
    console.log("RANGES:", ranges.slice(0, 8).join(" | "));
    if (logs.length) console.log(logs.join("\n"));
    if (!String(status).includes("Playing")) process.exitCode = 2;
  } finally {
    await browser.close();
    if (preview) preview.kill("SIGTERM");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
