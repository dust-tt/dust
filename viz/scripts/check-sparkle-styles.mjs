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
    <div id="themed-frame">
      <article class="viz-sparkle viz-document">
        <div class="font-sans text-foreground">
          <div id="document-controls" class="font-sans text-foreground border border-border bg-overlay-background">Toolbar</div>
          <div class="tiptap">
            <h1 id="document-heading">Title</h1>
            <p id="document-prose">Body text</p>
            <pre id="document-code" class="font-mono bg-muted-background border border-border"><code>const value = 1;</code></pre>
            <p id="document-muted" class="text-muted-foreground">Muted text</p>
            <a id="document-link" href="#">Document link</a>
            <div data-viz-sparkle-slot>
              <a id="document-visual" class="font-serif text-foreground" href="#">Frame visual link</a>
            </div>
          </div>
        </div>
      </article>
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

  const contentStyles = () =>
    page.evaluate(() =>
      Object.fromEntries(
        ["heading", "prose", "code", "muted", "link", "visual", "controls"].map(
          (name) => {
            const style = getComputedStyle(
              document.getElementById(`document-${name}`)
            );
            return [
              name,
              {
                font: style.fontFamily,
                color: style.color,
                background: style.backgroundColor,
                border: style.borderColor,
              },
            ];
          }
        )
      )
    );
  const defaultContent = await contentStyles();
  await page.locator("#themed-frame").evaluate((element) => {
    element.style.cssText = `
      --font-sans: Georgia, serif;
      --font-serif: "Times New Roman", serif;
      --font-mono: "Courier New", monospace;
      --foreground: #172433;
      --muted: #e8e3da;
      --muted-foreground: #657181;
      --border: #d5cec3;
      --primary: #0f4c5c;`;
  });
  const themedContent = await contentStyles();
  assert.equal(themedContent.prose.font, "Georgia, serif");
  assert.equal(themedContent.heading.font, themedContent.prose.font);
  assert.equal(themedContent.prose.color, "rgb(23, 36, 51)");
  assert.equal(themedContent.code.font, '"Courier New", monospace');
  assert.equal(themedContent.code.background, "rgb(232, 227, 218)");
  assert.equal(themedContent.code.border, "rgb(213, 206, 195)");
  assert.equal(themedContent.muted.color, "rgb(101, 113, 129)");
  assert.equal(themedContent.link.color, "rgb(15, 76, 92)");
  assert.equal(themedContent.visual.font, '"Times New Roman", serif');
  assert.equal(themedContent.visual.color, "rgb(23, 36, 51)");
  assert.deepEqual(themedContent.controls, defaultContent.controls);
  assert.deepEqual((await measure()).portal, after.portal);

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
  assert.deepEqual((await contentStyles()).prose, themedContent.prose);

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
    "Sparkle styles, portal scope and dark mode passed. Document content follows Frame themes without restyling controls or nested visuals.\n"
  );
} finally {
  await browser.close();
}
