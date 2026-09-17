import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { writeReport } from "./cli";
import { demoData } from "./demo";

test("offline report: search, selection, clusters, neighbors, export, zoom, and mobile layout", async () => {
  const out = fileURLToPath(new URL("output/browser-test", import.meta.url));
  const data = demoData();
  await writeReport(data, out, [2, 3, 5], 42);
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1100 },
    });
    const errors: string[] = [];
    const external: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("request", (request) => {
      if (request.url().startsWith("http")) {
        external.push(request.url());
      }
    });
    await page.goto(pathToFileURL(resolve(out, "index.html")).href);
    assert.equal(await page.locator("#plot circle").count(), 24);
    assert.equal(await page.locator("#skill-list tr").count(), 24);
    await page.locator("#cluster-count").selectOption("3");
    assert.ok(Number(await page.locator("#silhouette").textContent()) > 0.7);
    await page.locator("#search").fill("customer");
    assert.equal(await page.locator("#skill-list tr").count(), 8);
    assert.equal(await page.locator("#plot circle").count(), 8);
    await page.locator("#skill-list button").first().focus();
    await page.keyboard.press("Enter");
    assert.equal(
      await page.locator("#detail-name").textContent(),
      "Triage a support ticket",
    );
    await page.locator("summary").click();
    assert.match(
      (await page.locator("#detail-text").textContent()) ?? "",
      /Instructions:/,
    );
    const downloadPromise = page.waitForEvent("download");
    await page.locator("#export").click();
    const download = await downloadPromise;
    const downloadPath = await download.path();
    assert.ok(downloadPath);
    const exported = JSON.parse(await readFile(downloadPath, "utf8"));
    assert.equal(exported.skills.length, 8);
    assert.equal(exported.k, 3);
    assert.equal(exported.skills[0].embedding.length, data.dimensions);
    await page.locator("#neighbors button").first().click();
    assert.equal(await page.locator("#search").inputValue(), "");
    assert.equal(await page.locator("#skill-list tr").count(), 24);
    await page.locator("#search").fill("zzzz-not-found");
    assert.equal(await page.locator("#plot circle").count(), 0);
    assert.equal(await page.locator("#export").isDisabled(), true);
    assert.match(
      (await page.locator("#skill-list").textContent()) ?? "",
      /No skills match/,
    );
    await page.locator("#search").fill("");
    const point = page.locator("#plot circle").first();
    const title = await point.locator("title").textContent();
    await point.click();
    assert.ok(
      title?.startsWith(
        (await page.locator("#detail-name").textContent()) ?? "missing",
      ),
    );
    const before = await page.locator("#plot circle").last().getAttribute("cx");
    await page.locator("#zoom-in").click();
    assert.notEqual(
      await page.locator("#plot circle").last().getAttribute("cx"),
      before,
    );
    await page.locator("#reset").click();
    await page.locator("#legend button").nth(1).click();
    assert.equal(await page.locator("#plot circle").count(), 8);
    await page.locator("#legend button").first().click();
    await page.screenshot({
      path: resolve(out, "desktop.png"),
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: resolve(out, "mobile.png"), fullPage: true });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
      true,
    );
    assert.deepEqual(errors, []);
    assert.deepEqual(external, []);
  } finally {
    await browser.close();
  }
});
