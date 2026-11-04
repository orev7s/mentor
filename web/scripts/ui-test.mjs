import { chromium } from "playwright-core";
import { mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const CHROME = join(homedir(), ".cache/ms-playwright/chromium-1248/chrome-linux64/chrome");
const WEB = process.env.WEB_URL ?? "http://127.0.0.1:8790";
const DATA_DIR = process.env.MENTOR_DATA_DIR ?? join(homedir(), ".mentor-dev");
const SHOTS = process.env.SHOTS_DIR ?? "/home/ubuntu/projects/mentor/docs/screenshots";
const TOKEN = JSON.parse(readFileSync(join(DATA_DIR, "config.json"), "utf8")).token;
const PROMPT =
  process.env.PROMPT ??
  "Use todo_write to plan three steps for solving 2x + 3 = 11, then solve it. " +
    "Write the solution to notes/answer.md with the write tool, run `cat notes/answer.md` with bash, " +
    'call share_file for notes/answer.md with label "Your solution", ' +
    "and finish with a two sentence explanation.";

mkdirSync(SHOTS, { recursive: true });

const browser = await chromium.launch({
  executablePath: CHROME,
  args: ["--no-sandbox", "--no-proxy-server"],
});
const context = await browser.newContext({ viewport: { width: 1280, height: 860 } });
const page = await context.newPage();

const log = (...args) => console.log("[ui]", ...args);
const errors = [];
page.on("console", (msg) => {
  if (msg.type() === "error") errors.push(msg.text());
});
page.on("pageerror", (err) => errors.push(err.message));

try {
  await page.goto(WEB, { waitUntil: "networkidle" });
  await page.screenshot({ path: join(SHOTS, "01-connect.png") });
  log("connect screen captured");

  await page.fill('[data-testid="server-url"]', WEB);
  await page.fill('[data-testid="server-token"]', TOKEN);
  await page.click('[data-testid="connect-button"]');
  await page.waitForSelector('textarea[aria-label="Message"]', { timeout: 30000 });
  log("connected");

  await page.click('[data-testid="new-chat"]');
  await page.waitForTimeout(700);
  await page.screenshot({ path: join(SHOTS, "02-empty.png") });
  log("empty state captured");

  await page.fill('textarea[aria-label="Message"]', PROMPT);
  await page.press('textarea[aria-label="Message"]', "Enter");
  log("prompt sent");

  await page.waitForSelector('[data-slot="coding-agent"][data-chat-status="streaming"]', {
    timeout: 45000,
  });
  log("run started");
  await page.waitForSelector('[data-slot="coding-agent"][data-chat-status="ready"]', {
    timeout: 240000,
  });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: join(SHOTS, "03-chat.png") });
  log("chat captured");

  for (const [tab, file] of [
    ["Files", "04-files.png"],
    ["Changes", "05-changes.png"],
    ["Terminal", "06-terminal.png"],
  ]) {
    const button = page.getByRole("tab", { name: new RegExp(`^${tab}`) }).last();
    if (await button.count()) {
      await button.click();
      await page.waitForTimeout(500);
      await page.screenshot({ path: join(SHOTS, file) });
      log(`${tab} tab captured`);
    }
  }

  await page.getByRole("tab", { name: /^Files/ }).last().click();
  await page.waitForTimeout(300);
  const rowCount = await page.locator('[data-slot="coding-agent"] li').count();
  if (rowCount === 0) log("no files listed (the model may not have written one)");
  else log(`${rowCount} file rows listed`);

  const artifacts = page.locator('[data-slot="run-artifacts"]');
  const artifactCount = await artifacts.count();
  log(`artifacts blocks: ${artifactCount}`);
  if (artifactCount === 0) log("WARNING: no automatic artifacts block");
  const shareCards = await page.getByText("Your solution", { exact: false }).count();
  log(`agent share cards: ${shareCards}`);
  if (artifactCount > 0) {
    try {
      const downloadPromise = page.waitForEvent("download", { timeout: 15000 });
      await artifacts.locator("button", { hasText: "Download" }).first().click();
      const download = await downloadPromise;
      log(`download works: ${download.suggestedFilename()}`);
    } catch (error) {
      log(`WARNING: download check failed: ${error.message}`);
    }
  }

  await page.click('[data-testid="model-chip"]');
  await page.waitForSelector('[data-testid="model-search"]');
  await page.screenshot({ path: join(SHOTS, "07-model-picker.png") });
  await page.click('[data-testid="close-model-picker"]');
  log("model picker captured");

  await page.click('[data-testid="open-settings"]');
  await page.waitForSelector('[data-testid="close-settings"]');
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(SHOTS, "08-settings.png") });
  await page.click('[data-testid="close-settings"]');
  log("settings captured");

  // Desktop and tablet can fold the workspace and the chat list away.
  const workspaceToggle = page.locator('[data-testid="workspace-toggle"]');
  if (await workspaceToggle.count()) {
    await workspaceToggle.click();
    await page.waitForTimeout(400);
    const tabsLeft = await page.getByRole("tab", { name: /^Changes/ }).count();
    log(`workspace closed (changes tab gone: ${tabsLeft === 0})`);
    await page.screenshot({ path: join(SHOTS, "10-workspace-hidden.png") });
    await workspaceToggle.click();
    await page.waitForTimeout(300);
  } else {
    log("WARNING: no workspace toggle on desktop");
  }

  const chatsButton = page.getByRole("button", { name: "Chats" });
  await chatsButton.click();
  await page.waitForTimeout(400);
  const railGone = await page.getByTestId("session-rail").count();
  log(`sidebar closed (rail gone: ${railGone === 0})`);
  await page.screenshot({ path: join(SHOTS, "11-sidebar-hidden.png") });
  await chatsButton.click();
  await page.waitForTimeout(300);

  // 11.2 inch 3:2 tablet, landscape and portrait.
  await page.setViewportSize({ width: 1194, height: 834 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: join(SHOTS, "12-tablet-landscape.png") });
  await page.setViewportSize({ width: 834, height: 1194 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: join(SHOTS, "13-tablet-portrait.png") });
  log("tablet captured");

  await page.setViewportSize({ width: 412, height: 915 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: join(SHOTS, "09-chat-phone.png") });
  log("phone chat captured");

  if (errors.length) {
    console.warn("[ui] console errors:", errors.slice(0, 8));
  }
  console.log("UI TEST PASSED");
} catch (error) {
  await page.screenshot({ path: join(SHOTS, "99-failure.png") }).catch(() => {});
  console.error("UI TEST FAILED:", error);
  process.exitCode = 1;
} finally {
  await browser.close();
}