import { chromium } from "playwright-core";
import { mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const CHROME = join(homedir(), ".cache/ms-playwright/chromium-1248/chrome-linux64/chrome");
const WEB = process.env.WEB_URL ?? "http://127.0.0.1:8790";
const DATA_DIR = process.env.MENTOR_DATA_DIR ?? join(homedir(), ".mentor-dev");
const SHOTS = process.env.SHOTS_DIR ?? "/tmp/opencode";
const TOKEN = JSON.parse(readFileSync(join(DATA_DIR, "config.json"), "utf8")).token;

mkdirSync(SHOTS, { recursive: true });

const browser = await chromium.launch({
  executablePath: CHROME,
  args: ["--no-sandbox", "--no-proxy-server"],
});
const page = await browser.newPage({ viewport: { width: 412, height: 915 } });
const errors = [];
page.on("console", (msg) => {
  if (msg.type() === "error") errors.push(msg.text());
});
page.on("pageerror", (err) => errors.push(err.message));

try {
  await page.goto(WEB, { waitUntil: "networkidle" });
  await page.fill('[data-testid="server-url"]', WEB);
  await page.fill('[data-testid="server-token"]', TOKEN);
  await page.click('[data-testid="connect-button"]');
  await page.waitForSelector('textarea[aria-label="Message"]', { timeout: 30000 });
  await page.click('[data-testid="new-chat-top"]');
  await page.waitForTimeout(700);

  await page.fill(
    'textarea[aria-label="Message"]',
    "Call the ask_student tool right now with two multiple-choice questions about photosynthesis, two options each. Do not explain anything first. Wait for my answers.",
  );
  await page.press('textarea[aria-label="Message"]', "Enter");
  console.log("prompt sent");

  await page.waitForSelector('[data-slot="ask-student"]', { timeout: 120000 });
  console.log("ask card shown");
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(SHOTS, "ask-before.png") });

  const card = page.locator('[data-slot="ask-student"]').last();
  const questionCount = await card.locator('[data-slot="ask-question"]').count();
  console.log("questions:", questionCount);
  for (let q = 0; q < questionCount; q += 1) {
    await card.locator(`button[data-question="${q}"]`).first().click();
  }
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(SHOTS, "ask-picked.png") });

  const send = card.getByRole("button", { name: "Send answers" });
  console.log("send enabled:", await send.isEnabled());
  await send.click();
  await page.waitForTimeout(1200);
  console.log("after send:", await card.locator("text=Answers sent").count());
  await page.screenshot({ path: join(SHOTS, "ask-sent.png") });

  await page.waitForSelector('[data-slot="coding-agent"][data-chat-status="ready"]', {
    timeout: 180000,
  });
  await page.waitForTimeout(800);
  await page.screenshot({ path: join(SHOTS, "ask-done.png") });
  console.log("agent continued and settled");
  if (errors.length) console.warn("console errors:", errors.slice(0, 5));
  console.log("ASK TEST PASSED");
} catch (error) {
  await page.screenshot({ path: join(SHOTS, "ask-failure.png") });
  console.error("ASK TEST FAILED:", error.message);
  if (errors.length) console.warn("console errors:", errors.slice(0, 8));
  process.exitCode = 1;
} finally {
  await browser.close();
}
