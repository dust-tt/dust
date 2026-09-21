// Usage: node verify-upgrade-effects.mjs /absolute/repository/root [output-directory]
import fs from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";

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
const markup = `
  <div style="position:relative;width:400px;height:80px">
    <div id="navigation" class="absolute left-1/2 -translate-x-1/2" style="width:100px;height:40px"></div>
  </div>
  <div id="gradient" class="bg-gradient-to-b from-white to-stone-50" style="height:40px"></div>
  <h3 id="heading" class="text-3xl font-semibold">Slide heading</h3>
  <div id="surface" class="rounded-md shadow-md border p-4">Surface</div>
  <button id="button">Button</button>
`;
const globals = (
  await fs.readFile(`${repo}/viz/app/styles/globals.css`, "utf8")
).replace('@import "tw-animate-css";', "");
const legacyCss = (
  await postcss([
    tailwind({
      ...config,
      content: [{ raw: markup, extension: "html" }],
      safelist: [],
    }),
  ]).process(globals, { from: `${repo}/viz/app/styles/globals.css` })
).css;
const sparkleCss = await fs.readFile(
  `${repo}/sparkle/dist/sparkle.css`,
  "utf8"
);
const browser = await chromium.launch({ headless: true });
const observations = {};
try {
  for (const [name, styles] of Object.entries({
    v3: legacyCss,
    sparkleOnly: sparkleCss,
    mixed: `${legacyCss}\n${sparkleCss}`,
    mixedPrivateTwProperties: `${legacyCss}\n${sparkleCss.replaceAll("--tw-", "--viz-sparkle-tw-")}`,
  })) {
    const page = await browser.newPage({
      viewport: { width: 1280, height: 720 },
    });
    await page.setContent(`<style>${styles}</style>${markup}`);
    observations[name] = await page.evaluate(() => {
      const get = (id) => getComputedStyle(document.getElementById(id));
      const nav = document.getElementById("navigation");
      return {
        navigationLeft: nav.getBoundingClientRect().left,
        navigationTransform: get("navigation").transform,
        navigationTranslate: get("navigation").translate,
        gradient: get("gradient").backgroundImage,
        headingSize: get("heading").fontSize,
        headingWeight: get("heading").fontWeight,
        radius: get("surface").borderRadius,
        shadow: get("surface").boxShadow,
        borderColor: get("surface").borderColor,
        cursor: get("button").cursor,
      };
    });
    await page.close();
  }
} finally {
  await browser.close();
}
await fs.writeFile(
  `${dir}/upgrade-observations.json`,
  JSON.stringify(observations, null, 2)
);
process.stdout.write(JSON.stringify(observations, null, 2) + "\n");
