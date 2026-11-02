import { mkdir, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";

const suppliedUrl = process.argv[2];
const basePath = "/MSIS207.R11.CTTT.Week3.Hw3/";
const repoDir = fileURLToPath(new URL("..", import.meta.url));
const evidenceDir = join(repoDir, "evidence");
const evidencePrefix = suppliedUrl ? "deployed-site" : "production-preview";
const consoleErrors = [];
const httpErrors = [];
const axeResults = {};
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

async function auditAccessibility(page, viewportName) {
  const results = await new AxeBuilder({ page }).analyze();
  axeResults[viewportName] = {
    violations: results.violations.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      description: violation.description,
      help: violation.help,
      nodes: violation.nodes.map((node) => ({ target: node.target, summary: node.failureSummary })),
    })),
    incomplete: results.incomplete.map((item) => ({ id: item.id, impact: item.impact, nodeCount: item.nodes.length })),
  };
  assert(
    results.violations.length === 0,
    `${viewportName} axe audit reports zero violations${results.violations.length ? `: ${results.violations.map((item) => item.id).join(", ")}` : ""}`,
  );
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
  page.on("requestfailed", (request) => httpErrors.push({ type: "requestfailed", url: request.url(), error: request.failure()?.errorText }));
  page.on("response", (response) => {
    if (response.status() >= 400) httpErrors.push({ type: "http", status: response.status(), url: response.url() });
  });

  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: /DROP IN\./ }).waitFor();
  assert((await page.title()).includes("PUBG Vietnam"), "production page title and bundled app load");
  assert(await page.getByTestId("kill-feed-row").count() <= 26, "10,000-event feed renders only viewport plus overscan rows");
  assert((await page.getByTestId("drop-drop-warmup").locator(".drop-countdown strong").innerText()).startsWith("00:15"), "warmup countdown starts near fifteen seconds");
  assert(await page.getByTestId("drop-drop-live").getByRole("heading", { name: "PVS Grand Finals VIP Tickets" }).isVisible(), "PVS VIP ticket is visible");
  assert(await page.getByTestId("drop-drop-live").getByText("1 vé VIP mô phỏng").isVisible(), "PVS reward quantity is explicitly labeled as simulated");
  assert(await page.getByTestId("drop-drop-live").locator(".phase-badge").getByText("ĐANG MỞ").isVisible(), "PVS VIP countdown/phase is live with stock");
  assert(/^\d{2}:\d{2}$/.test(await page.getByTestId("drop-drop-live").locator(".drop-countdown strong").innerText()), "PVS VIP displays a live close countdown");
  assert((await page.getByTestId("drop-drop-live").locator(".drop-price").innerText()).includes("₫"), "PVS VIP price is formatted in VND");
  assert(await page.getByTestId("drop-drop-gcoin").getByRole("heading", { name: "G-Coin Crate" }).isVisible(), "G-Coin crate is visible");
  assert(await page.getByTestId("drop-drop-gcoin").getByText("2.000 G-Coin mô phỏng").isVisible(), "G-Coin simulated amount is displayed");
  assert(await page.getByTestId("drop-drop-gcoin").locator(".phase-badge").getByText("ĐANG MỞ").isVisible(), "G-Coin countdown/phase is live with stock");
  assert(/^\d{2}:\d{2}$/.test(await page.getByTestId("drop-drop-gcoin").locator(".drop-countdown strong").innerText()), "G-Coin crate displays a live close countdown");
  assert((await page.getByTestId("drop-drop-gcoin").locator(".drop-price").innerText()).includes("₫"), "G-Coin crate price is formatted in VND");
  await auditAccessibility(page, "desktop");

  await page.screenshot({ path: join(evidenceDir, `${evidencePrefix}-desktop.png`), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await auditAccessibility(page, "mobile");
  await page.screenshot({ path: join(evidenceDir, `${evidencePrefix}-mobile.png`), fullPage: true });
  const mobileWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  assert(mobileWidth <= 391, "mobile layout fits a 390 px viewport without horizontal overflow");
  await page.setViewportSize({ width: 1440, height: 1000 });

  const ticketCard = page.getByTestId("drop-drop-live");
  const gcoinCard = page.getByTestId("drop-drop-gcoin");
  for (const [rewardName, card] of [["PVS VIP", ticketCard], ["G-Coin", gcoinCard]]) {
    await card.locator(".claim-button").click();
    assert((await card.locator(".drop-stock").innerText()).includes("2"), `${rewardName} optimistic claim deducts one unit`);
    await expectText(card, "Đã nhận airdrop thành công.", `${rewardName} success reconciles service stock`);
    assert((await card.locator(".drop-stock").innerText()).includes("2"), `${rewardName} successful snapshot leaves two units`);
  }

  await page.locator("#claim-scenario").selectOption("conflict");
  for (const [rewardName, card] of [["PVS VIP", ticketCard], ["G-Coin", gcoinCard]]) {
    await card.locator(".claim-button").click();
    assert((await card.locator(".drop-stock").innerText()).includes("1"), `${rewardName} optimistic 409 attempt deducts one unit while pending`);
    await expectText(card, "409 mô phỏng: đội khác vừa nhận hết kho. Tồn kho đã đồng bộ.", `${rewardName} 409 reconciles the service snapshot`);
    assert((await card.locator(".drop-stock").innerText()).includes("0"), `${rewardName} 409 does not restore stock blindly`);
  }

  for (const [rewardName, card] of [["PVS VIP", ticketCard], ["G-Coin", gcoinCard]]) {
    await page.locator("#claim-scenario").selectOption("temporary-error");
    await page.getByRole("button", { name: /RESET DEMO/ }).click();
    const button = card.locator(".claim-button");
    await button.click();
    assert((await card.locator(".drop-stock").innerText()).includes("2"), `${rewardName} temporary-error claim shows one optimistic unit deduction`);
    assert(await button.isDisabled(), `${rewardName} button stays disabled while the claim is pending`);
    await expectText(card, "Đang xác nhận với kho mô phỏng…", `${rewardName} pending message is visible`);
    await page.locator("#claim-scenario").selectOption("success");
    assert(await button.isDisabled(), `${rewardName} remains disabled after changing scenario while pending`);
    await expectText(card, "Đang xác nhận với kho mô phỏng…", `${rewardName} pending message survives scenario change`);
    await expectText(card, "Lỗi tạm thời. Tồn kho đã hoàn tác; bạn có thể thử lại.", `${rewardName} request uses the scenario captured at start`);
    assert((await card.locator(".drop-stock").innerText()).includes("3"), `${rewardName} temporary error rolls stock back`);
    await button.click();
    await expectText(card, "Đã nhận airdrop thành công.", `${rewardName} next request uses the newly selected success scenario`);
    assert((await card.locator(".drop-stock").innerText()).includes("2"), `${rewardName} retry reconciles success`);
  }

  await page.getByRole("button", { name: /RESET DEMO/ }).click();
  await ticketCard.locator(".claim-button").click();
  assert(await ticketCard.locator(".claim-button").isDisabled(), "reset-race setup has a pending claim");
  await page.getByRole("button", { name: /RESET DEMO/ }).click();
  assert((await ticketCard.locator(".drop-stock").innerText()).includes("3"), "reset while pending restores the new session stock");
  await page.waitForTimeout(700);
  assert((await ticketCard.locator(".drop-stock").innerText()).includes("3"), "old response does not overwrite the reset session");

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
  assert(consoleErrors.length === 0, "no JavaScript console errors during browser scenarios");
  assert(httpErrors.length === 0, "no failed requests or HTTP errors during browser scenarios");

  const report = {
    testedAt: new Date().toISOString(),
    url: baseUrl,
    productionBuild: true,
    browser: "Playwright Chromium",
    checks,
    consoleErrors,
    httpErrors,
    axe: axeResults,
    screenshots: [`${evidencePrefix}-desktop.png`, `${evidencePrefix}-mobile.png`, `${evidencePrefix}-verified.png`],
  };
  await writeFile(join(evidenceDir, `${evidencePrefix}-browser.json`), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`Browser verification passed: ${checks.length} checks. Evidence: evidence/${evidencePrefix}-browser.json`);
} catch (error) {
  console.error("Browser verification failed:", error);
  process.exitCode = 1;
  await writeFile(join(evidenceDir, `${evidencePrefix}-browser.json`), `${JSON.stringify({
    testedAt: new Date().toISOString(), url: baseUrl, checks, consoleErrors, httpErrors, axe: axeResults,
    error: error instanceof Error ? error.stack : String(error),
  }, null, 2)}\n`, "utf8").catch(() => undefined);
} finally {
  await browser?.close();
  if (preview && !preview.killed) preview.kill();
}
