import { mkdir, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const suppliedUrl = process.argv[2];
const basePath = "/MSIS207.R11.CTTT.Week3.Hw3/";
const repoDir = fileURLToPath(new URL("..", import.meta.url));
const evidenceDir = join(repoDir, "evidence");
const evidencePrefix = suppliedUrl ? "deployed-site" : "production-preview";
const consoleErrors = [];
const checks = [];
let baseUrl = suppliedUrl ?? "";
let preview;
let browser;

async function findAvailablePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Could not reserve a local preview port.");
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return address.port;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
  checks.push({ check: message, passed: true });
}

async function waitForPreview(url) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // The Vite preview process may still be starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  throw new Error(`Vite preview did not become available at ${url}`);
}

async function expectText(locator, expected, description) {
  await locator.getByText(expected, { exact: true }).waitFor({ state: "visible", timeout: 5_000 });
  assert(true, description);
}

try {
  baseUrl ||= `http://127.0.0.1:${await findAvailablePort()}${basePath}`;
  if (!suppliedUrl) {
    const port = new URL(baseUrl).port;
    preview = spawn(process.execPath, [join(repoDir, "node_modules", "vite", "bin", "vite.js"), "preview", "--host", "127.0.0.1", "--port", port, "--strictPort"], {
      cwd: repoDir,
      stdio: "inherit",
      windowsHide: true,
    });
    preview.on("error", (error) => console.error("Preview process error:", error));
    await waitForPreview(baseUrl);
  }

  await mkdir(evidenceDir, { recursive: true });
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push({ type: "console", message: message.text() });
  });
  page.on("pageerror", (error) => consoleErrors.push({ type: "pageerror", message: error.message }));

  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: /DROP IN\./ }).waitFor();
  assert((await page.title()).includes("PUBG Vietnam"), "production page title and bundled app load");
  assert(await page.getByTestId("kill-feed-row").count() <= 26, "10,000-event feed renders only viewport plus overscan rows");
  assert((await page.getByTestId("drop-drop-warmup").locator(".drop-countdown strong").innerText()).startsWith("00:15"), "warmup countdown starts near fifteen seconds");

  await page.screenshot({ path: join(evidenceDir, `${evidencePrefix}-desktop.png`), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: join(evidenceDir, `${evidencePrefix}-mobile.png`), fullPage: true });
  const mobileWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  assert(mobileWidth <= 391, "mobile layout fits a 390 px viewport without horizontal overflow");
  await page.setViewportSize({ width: 1440, height: 1000 });

  const liveCard = page.getByTestId("drop-drop-live");
  const liveButton = liveCard.locator(".claim-button");
  await liveButton.click();
  await expectText(liveCard, "Đã nhận airdrop thành công.", "success claim reconciles service stock");
  assert((await liveCard.locator(".drop-stock").innerText()).includes("2"), "success leaves two of three mock units");

  await page.locator("#claim-scenario").selectOption("conflict");
  await liveButton.click();
  await expectText(liveCard, "409 mô phỏng: đội khác vừa nhận hết kho. Tồn kho đã đồng bộ.", "409 scenario reconciles the service snapshot");
  assert((await liveCard.locator(".drop-stock").innerText()).includes("0"), "409 does not restore stock blindly");

  await page.locator("#claim-scenario").selectOption("temporary-error");
  await page.getByRole("button", { name: /RESET DEMO/ }).click();
  await liveCard.locator(".claim-button").click();
  await expectText(liveCard, "Lỗi tạm thời. Tồn kho đã hoàn tác; bạn có thể thử lại.", "temporary error rolls back optimistic stock");
  assert((await liveCard.locator(".drop-stock").innerText()).includes("3"), "temporary failure preserves mock stock for retry");
  await page.locator("#claim-scenario").selectOption("success");
  await liveCard.locator(".claim-button").click();
  await expectText(liveCard, "Đã nhận airdrop thành công.", "retry succeeds with a fresh claim ID");
  await page.getByRole("button", { name: /RESET DEMO/ }).click();
  assert((await liveCard.locator(".drop-stock").innerText()).includes("3"), "reset restores the new demo session");

  const warmupCard = page.getByTestId("drop-drop-warmup");
  await warmupCard.locator(".phase-badge").getByText("SẮP MỞ").waitFor();
  await warmupCard.locator(".phase-badge").getByText("ĐANG MỞ").waitFor({ timeout: 20_000 });
  assert(true, "countdown reaches the AIRDROP_LIVE boundary without refresh");

  await page.getByLabel("Tìm đội trong bảng xếp hạng").fill("Cerberus");
  assert(await page.locator("#leaderboard tbody tr").count() === 1, "leaderboard search filters teams");
  await page.getByLabel("Tiêu chí sắp xếp").selectOption("killPts");
  await page.getByRole("button", { name: /Đang giảm dần/ }).click();
  await page.getByLabel("Tìm đội trong bảng xếp hạng").fill("");
  assert(await page.locator("#leaderboard tbody tr").count() === 4, "leaderboard sort and direction retain all seeded teams");

  await page.getByLabel("Lọc kill feed theo đội").selectOption("ROY");
  const viewport = page.getByTestId("kill-feed-viewport");
  await viewport.evaluate((element) => { element.scrollTop = 220_000; element.dispatchEvent(new Event("scroll")); });
  assert(await page.getByTestId("kill-feed-row").count() <= 26, "filtered mid-list window stays bounded");
  await viewport.evaluate((element) => { element.scrollTop = 1_000_000; element.dispatchEvent(new Event("scroll")); });
  assert(await page.getByTestId("kill-feed-row").count() <= 26, "filtered end-list window stays bounded");
  await page.getByLabel("Tìm nội dung kill feed").fill("không có nội dung này");
  await page.getByText("Không có sự kiện phù hợp với bộ lọc này.").waitFor();
  assert(true, "kill-feed search exposes an empty state");

  await page.getByLabel("Tìm nội dung kill feed").fill("");
  await page.getByLabel("Lọc kill feed theo đội").selectOption("all");
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: join(evidenceDir, `${evidencePrefix}-verified.png`), fullPage: true });
  assert(consoleErrors.length === 0, "no page or console errors during browser scenarios");

  const report = {
    testedAt: new Date().toISOString(),
    url: baseUrl,
    productionBuild: true,
    browser: "Playwright Chromium",
    checks,
    consoleErrors,
    screenshots: [`${evidencePrefix}-desktop.png`, `${evidencePrefix}-mobile.png`, `${evidencePrefix}-verified.png`],
  };
  await writeFile(join(evidenceDir, `${evidencePrefix}-browser.json`), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`Browser verification passed: ${checks.length} checks. Evidence: evidence/production-preview-browser.json`);
} catch (error) {
  console.error("Browser verification failed:", error);
  process.exitCode = 1;
  await writeFile(join(evidenceDir, `${evidencePrefix}-browser.json`), `${JSON.stringify({
    testedAt: new Date().toISOString(), url: baseUrl, checks, consoleErrors,
    error: error instanceof Error ? error.stack : String(error),
  }, null, 2)}\n`, "utf8").catch(() => undefined);
} finally {
  await browser?.close();
  if (preview && !preview.killed) preview.kill();
}
