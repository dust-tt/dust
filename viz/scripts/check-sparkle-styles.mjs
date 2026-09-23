import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import tailwindcss from "@tailwindcss/postcss";
import { chromium } from "playwright";
import postcss from "postcss";

const styles = new URL("../app/styles/", import.meta.url);
const compile = async (name) => {
  const path = new URL(name, styles);
  const css = await readFile(path, "utf8");
  const result = await postcss([tailwindcss()]).process(css, {
    from: path.pathname,
  });
  return result.css;
};

const [vizCSS, sparkleCSS] = await Promise.all([
  compile("globals.css"),
  compile("sparkle.css"),
]);
const sample = `
  <div class="text-2xl font-semibold bg-blue-500 shadow-lg rounded-xl p-4">Title</div>
  <input value="Text">
  <div class="animate-pulse">Loading</div>`;
const properties = [
  "fontSize",
  "fontWeight",
  "lineHeight",
  "backgroundColor",
  "boxShadow",
  "borderRadius",
  "padding",
  "height",
  "animationName",
];
const browser = await chromium.launch({ headless: true });

try {
  const page = await browser.newPage({
    viewport: { width: 1100, height: 800 },
  });
  await page.setContent(`<!doctype html><html><body>
    <div id="outside">${sample}</div>
    <div class="viz-sparkle">
      <div id="editor">${sample}</div>
      <div data-viz-sparkle-slot><div id="visual">${sample}</div></div>
      <div id="surface" class="bg-background text-foreground">Editor</div>
    </div>
    <div class="viz-sparkle" id="portal">
      <div class="bg-primary text-primary-50 text-xs animate-in">Tooltip</div>
    </div>
  </body></html>`);
  await page.addStyleTag({ content: vizCSS });

  const measure = () =>
    page.evaluate(
      (properties) =>
        Object.fromEntries(
          ["outside", "editor", "visual", "portal"].map((id) => [
            id,
            Array.from(document.getElementById(id).children, (element) =>
              Object.fromEntries(
                properties.map((property) => [
                  property,
                  getComputedStyle(element)[property],
                ])
              )
            ),
          ])
        ),
      properties
    );

  const before = await measure();
  const stylesheet = await page.addStyleTag({ content: sparkleCSS });
  const after = await measure();

  assert.deepEqual(after.outside, before.outside);
  assert.deepEqual(after.visual, before.visual);
  assert.equal(after.editor[0].fontSize, "28px");
  assert.equal(after.outside[0].fontSize, "24px");
  assert.equal(after.editor[1].height, before.editor[1].height);
  assert.equal(after.editor[2].animationName, before.editor[2].animationName);
  assert.equal(after.portal[0].animationName, "viz-sparkle-enter");

  const light = await page.locator("#surface").evaluate((element) => ({
    background: getComputedStyle(element).backgroundColor,
    color: getComputedStyle(element).color,
  }));
  await page.evaluate(() => document.documentElement.classList.add("dark"));
  const dark = await page.locator("#surface").evaluate((element) => ({
    background: getComputedStyle(element).backgroundColor,
    color: getComputedStyle(element).color,
  }));
  assert.notEqual(dark.background, light.background);
  assert.notEqual(dark.color, light.color);

  await page.setViewportSize({ width: 480, height: 800 });
  const darkNarrowWithSparkle = await measure();
  await stylesheet.evaluate((element) => element.remove());
  const darkNarrowWithoutSparkle = await measure();
  assert.deepEqual(
    darkNarrowWithSparkle.outside,
    darkNarrowWithoutSparkle.outside
  );
  assert.deepEqual(
    darkNarrowWithSparkle.visual,
    darkNarrowWithoutSparkle.visual
  );

  process.stdout.write(
    "Sparkle styles, portal scope and dark mode passed. Frame and nested visual styles stayed unchanged.\n"
  );
} finally {
  await browser.close();
}
