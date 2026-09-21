// Usage: node verify-gradient.mjs /absolute/repository/root [output-directory]
import fs from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import assert from "node:assert/strict";

const repo = path.resolve(process.argv[2] ?? process.cwd());
const dir = path.resolve(
  process.argv[3] ?? path.join(tmpdir(), "viz-tailwind-probes")
);
await fs.mkdir(dir, { recursive: true });
const require = createRequire(`${repo}/package.json`);
const postcss = require("postcss");
const tailwind = require(`${repo}/viz/node_modules/tailwindcss`);
const loadConfig = require(`${repo}/viz/node_modules/tailwindcss/loadConfig`);
const { chromium } = require("playwright");
const config = loadConfig(`${repo}/viz/tailwind.config.ts`);
const markup =
  '<div id="legacy" class="bg-gradient-to-b from-white to-stone-50 rounded-md font-medium p-4">Existing slideshow surface</div>';
const legacyCss = (
  await postcss([
    tailwind({
      ...config,
      content: [{ raw: markup, extension: "html" }],
      safelist: [],
    }),
  ]).process("@tailwind base; @tailwind components; @tailwind utilities;", {
    from: undefined,
  })
).css;
const sparkleCss = await fs.readFile(
  `${repo}/sparkle/dist/sparkle.css`,
  "utf8"
);
const registrations = postcss
  .parse(sparkleCss)
  .nodes.filter((node) => node.type === "atrule" && node.name === "property")
  .map((node) => node.toString())
  .join("\n");

const browser = await chromium.launch({ headless: true });
const observations = {};
for (const [name, extraCss] of Object.entries({
  baseline: "",
  registrationsOnly: registrations,
  scopedRegistrations: `@scope (.sparkle-zone) { ${registrations} }`,
  renamedRegistrations: registrations.replaceAll("--tw-", "--viz-sparkle-tw-"),
})) {
  const page = await browser.newPage();
  await page.setContent(
    `<style>:root { --radius: 0.575rem; }</style><style>${legacyCss}</style><style>${extraCss}</style>${markup}`
  );
  observations[name] = await page.locator("#legacy").evaluate((element) => {
    const s = getComputedStyle(element);
    return {
      backgroundImage: s.backgroundImage,
      gradientFrom: s.getPropertyValue("--tw-gradient-from"),
      borderRadius: s.borderRadius,
      fontWeight: s.fontWeight,
      padding: s.padding,
    };
  });
  await page.close();
}
await browser.close();
assert.notDeepEqual(observations.registrationsOnly, observations.baseline);
assert.deepEqual(observations.renamedRegistrations, observations.baseline);
await fs.writeFile(
  `${dir}/gradient-observations.json`,
  JSON.stringify(observations, null, 2)
);
process.stdout.write(JSON.stringify(observations, null, 2) + "\n");
