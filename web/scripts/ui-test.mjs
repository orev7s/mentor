import { chromium } from "playwright-core";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
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
// A failed run leaves a screenshot behind; a passing run should not keep it.
rmSync(join(SHOTS, "99-failure.png"), { force: true });

const browser = await chromium.launch({
  executablePath: CHROME,
  args: ["--no-sandbox", "--no-proxy-server"],
});
const context = await browser.newContext({ viewport: { width: 1280, height: 860 } });
const page = await context.newPage();

const log = (...args) => console.log("[ui]", ...args);
const openMenu = async () => {
  await page.getByRole("button", { name: "More options" }).click();
  await page.waitForSelector('[data-slot="menu-content"]');
  // The popup has a short enter animation; let it settle before clicking an item.
  await page.waitForTimeout(250);
};
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

  await page.click('[data-testid="new-chat-top"]');
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
  await page.waitForSelector('[data-slot="working"]', { timeout: 20000 }).catch(() => {});
  await page.screenshot({ path: join(SHOTS, "16-working.png") });
  log("working row captured");
  await page.waitForSelector('[data-slot="coding-agent"][data-chat-status="ready"]', {
    timeout: 240000,
  });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: join(SHOTS, "03-chat.png") });
  log("chat captured");

  for (const [item, file] of [
    ["menu-files", "04-files.png"],
    ["menu-changes", "05-changes.png"],
  ]) {
    await openMenu();
    const entry = page.locator(`[data-testid="${item}"]`);
    if (await entry.count()) {
      await entry.click();
      await page.waitForSelector('[data-slot="workspace-sheet"]');
      await page.waitForTimeout(500);
      await page.screenshot({ path: join(SHOTS, file) });
      log(`${item} sheet captured`);
      await page.getByRole("button", { name: "Close" }).last().click();
      await page.waitForTimeout(250);
    } else {
      log(`${item} not offered (nothing to show)`);
      await page.keyboard.press("Escape");
      await page.waitForTimeout(250);
    }
  }

  await openMenu();
  await page.locator('[data-testid="menu-files"]').click();
  await page.waitForSelector('[data-slot="workspace-sheet"]');
  await page.waitForTimeout(300);
  const rowCount = await page.locator('[data-slot="workspace-sheet"] li').count();
  if (rowCount === 0) log("no files listed (the model may not have written one)");
  else log(`${rowCount} file rows listed`);
  await page.getByRole("button", { name: "Close" }).last().click();
  await page.waitForTimeout(250);

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

  await openMenu();
  await page.locator('[data-testid="menu-model"]').click();
  await page.waitForSelector('[data-testid="model-search"]');
  await page.screenshot({ path: join(SHOTS, "07-model-picker.png") });
  await page.click('[data-testid="close-model-picker"]');
  log("model picker captured");

  await openMenu();
  await page.locator('[data-testid="menu-settings"]').click();
  await page.waitForSelector('[data-testid="close-settings"]');
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(SHOTS, "08-settings.png") });
  await page.click('[data-testid="close-settings"]');
  log("settings captured");

  // The workspace lives in one sheet now: open it, then close it again.
  await openMenu();
  await page.locator('[data-testid="menu-files"]').click();
  await page.waitForSelector('[data-slot="workspace-sheet"]');
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(SHOTS, "10-workspace-sheet.png") });
  await page.getByRole("button", { name: "Close" }).last().click();
  await page.waitForTimeout(300);
  log("workspace sheet opens and closes");

  // The sidebar: open on desktop, with search, the two inert rows and the chat list.
  await page.screenshot({ path: join(SHOTS, "11-sidebar.png") });
  const chatsButton = page.getByRole("button", { name: "Chats", exact: true });
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

  // The student's own turns can be copied and forked from.
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.waitForTimeout(600);
  const firstUser = page.locator('[data-slot="message"][data-role="user"]').first();
  await firstUser.hover();
  log(
    `user copy button: ${await firstUser.getByRole("button", { name: "Copy message" }).count()}`,
  );
  const lastAssistant = page.locator('[data-slot="message"][data-role="assistant"]').last();
  await lastAssistant.hover();
  const forkButton = lastAssistant.getByRole("button", { name: "Fork from here" });
  log(`assistant fork button: ${await forkButton.count()}`);
  await forkButton.click();
  await page.waitForTimeout(2500);
  const forkUsers = await page.locator('[data-slot="message"][data-role="user"]').count();
  const forkReplies = await page.locator('[data-slot="message"][data-role="assistant"]').count();
  log(`forked chat: ${forkUsers} user, ${forkReplies} assistant`);
  await page.screenshot({ path: join(SHOTS, "14-forked-chat.png") });

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