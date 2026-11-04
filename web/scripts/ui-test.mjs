import { chromium } from "playwright-core";
import { mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const CHROME = join(
  homedir(),
  ".cache/ms-playwright/chromium-1248/chrome-linux64/chrome",
);
const WEB = process.env.WEB_URL ?? "http://127.0.0.1:4173";
const SERVER = process.env.SERVER_URL ?? "http://127.0.0.1:8790";
const DATA_DIR = process.env.MENTOR_DATA_DIR ?? join(homedir(), ".mentor-dev");
const SHOTS = "/home/ubuntu/projects/mentor/docs/screenshots";
const TOKEN = readFileSync(join(DATA_DIR, "config.json"), "utf8")
  .match(/"token":\s*"([^"]+)"/)[1];

mkdirSync(SHOTS, { recursive: true });

const browser = await chromium.launch({
  executablePath: CHROME,
  args: ["--no-sandbox", "--no-proxy-server"],
});
const context = await browser.newContext({
  viewport: { width: 1280, height: 860 },
  deviceScaleFactor: 1,
});
const page = await context.newPage();

const log = (...args) => console.log("[ui]", ...args);

try {
  await page.goto(WEB, { waitUntil: "networkidle" });
  await page.screenshot({ path: join(SHOTS, "01-connect.png") });
  log("connect screen captured");

  await page.fill('[data-testid="server-url"]', SERVER);
  await page.fill('[data-testid="server-token"]', TOKEN);
  await page.click('[data-testid="connect-button"]');
  await page.waitForSelector('[data-testid="model-chip"]', { timeout: 30000 });
  log("connected");

  // Start a fresh chat.
  await page.click('[data-testid="new-chat"]');
  await page.waitForTimeout(800);

  // Ask something that produces prose plus a code block, to exercise markdown.
  await page.fill('[data-testid="composer-input"]', "Explain recursion in two sentences, then show a tiny Python example in a code block.");
  await page.click('[data-testid="send-button"]');
  log("prompt sent, waiting for the model");

  await page.waitForFunction(
    () => {
      const messages = document.querySelectorAll(".mentor-markdown");
      const busy = document.querySelector('[data-testid="stop-button"]');
      return messages.length > 0 && !busy;
    },
    null,
    { timeout: 120000 },
  );
  await page.waitForTimeout(1500);
  await page.screenshot({ path: join(SHOTS, "02-chat.png") });
  log("chat captured");

  await page.click('[data-testid="model-chip"]');
  await page.waitForSelector('[data-testid="model-search"]');
  await page.click('button:has-text("Show all")');
  await page.waitForTimeout(600);
  await page.screenshot({ path: join(SHOTS, "03-model-picker.png") });
  log("model picker captured");
  await page.click('[data-testid="close-model-picker"]');
  await page.waitForSelector('[data-testid="model-search"]', { state: "hidden" });

  await page.click('[data-testid="open-settings"]');
  await page.waitForSelector('[data-testid="close-settings"]');
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(SHOTS, "04-settings.png") });
  log("settings captured");
  await page.click('[data-testid="close-settings"]');

  // Phone-shaped shot of the chat.
  await page.setViewportSize({ width: 412, height: 915 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: join(SHOTS, "05-chat-phone.png") });
  log("phone chat captured");

  console.log("UI TEST PASSED");
} catch (error) {
  await page.screenshot({ path: join(SHOTS, "99-failure.png") }).catch(() => {});
  console.error("UI TEST FAILED:", error);
  process.exitCode = 1;
} finally {
  await browser.close();
}
