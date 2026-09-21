// Usage: node verify-compat.mjs /absolute/repository/root [output-directory]
// Research CLI output; these tools do not execute inside an application server.
const print = (...values) =>
  process.stdout.write(
    values
      .map((v) => (typeof v === "string" ? v : JSON.stringify(v)))
      .join(" ") + "\n"
  );
import fs from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";

const repo = path.resolve(process.argv[2] ?? process.cwd());
const dir = path.resolve(
  process.argv[3] ?? path.join(tmpdir(), "viz-tailwind-compat")
);
await fs.mkdir(dir, { recursive: true });
const require = createRequire(`${repo}/package.json`);
const postcss = require("postcss");
const tailwindV3 = require(`${repo}/viz/node_modules/tailwindcss`);
const loadConfig = require(`${repo}/viz/node_modules/tailwindcss/loadConfig`);
const { compile } = require("@tailwindcss/node");
const { chromium } = require("playwright");
const config = loadConfig(`${repo}/viz/tailwind.config.ts`);
const cases = [];
const classes = {
  bg: "bg-red-500",
  text: "text-red-500",
  border: "border-2 border-red-500",
  divide: "divide-y divide-red-500",
  placeholder: "placeholder-red-500",
  ring: "ring-2 ring-red-500",
};
for (const family of Object.keys(classes)) {
  for (let value = 0; value <= 100; value += 5)
    cases.push({
      id: `${family}-${value}`,
      family,
      className: `${classes[family]} ${family}-opacity-${value}`,
    });
  cases.push({
    id: `${family}-control`,
    family,
    className: classes[family],
    control: true,
  });
  cases.push({
    id: `${family}-slash`,
    family,
    className: `${classes[family]} ${family}-red-500/50 ${family}-opacity-25`,
  });
  cases.push({
    id: `${family}-raw`,
    family,
    className: `${family}-background ${family}-opacity-25`,
  });
}
cases.push(
  {
    id: "bg-hover",
    family: "bg",
    className: "bg-red-500 bg-opacity-25 hover:bg-blue-500",
    hover: true,
  },
  {
    id: "bg-hover-slash",
    family: "bg",
    className: "bg-red-500 bg-opacity-25 hover:bg-blue-500/50",
    hover: true,
  },
  {
    id: "text-hover",
    family: "text",
    className: "text-red-500 text-opacity-25 hover:text-blue-500",
    hover: true,
  },
  {
    id: "bg-variant-opacity",
    family: "bg",
    className: "bg-red-500 hover:bg-opacity-50",
    hover: true,
    unsupported: true,
  },
  {
    id: "border-x",
    family: "border",
    className: "border-2 border-x-red-500 border-opacity-50",
  },
  {
    id: "ring-no-color",
    family: "ring",
    className: "ring-2 ring-opacity-50",
    noColor: true,
  },
  {
    id: "ring-no-opacity",
    family: "ring",
    className: "ring-2",
    noColor: true,
    control: true,
  },
  { id: "alias-blur", family: "blur", className: "blur-0" },
  {
    id: "alias-backdrop-blur",
    family: "backdropBlur",
    className: "backdrop-blur-0",
  },
  { id: "alias-columns-2xs", family: "columns", className: "columns-2xs" },
  { id: "alias-columns-3xs", family: "columns", className: "columns-3xs" },
  { id: "alias-order-first", family: "order", className: "-order-first" },
  { id: "alias-order-last", family: "order", className: "-order-last" },
  { id: "alias-order-none", family: "order", className: "-order-none" }
);
const markup = cases
  .map((fixture) =>
    fixture.family === "placeholder"
      ? `<input id="${fixture.id}" class="${fixture.className}" placeholder="Placeholder" />`
      : fixture.family === "divide"
        ? `<div id="${fixture.id}" class="${fixture.className}"><div>First</div><div hidden>Hidden</div><div data-target>Second</div></div>`
        : `<div id="${fixture.id}" class="${fixture.className}">Fixture</div>`
  )
  .join("\n");
const candidates = [
  ...new Set(cases.flatMap((fixture) => fixture.className.split(" "))),
];
const fixtureCss =
  ":root { --background: rgb(20 40 60); } [id] { min-height: 12px; }";
const v3 = (
  await postcss([
    tailwindV3({
      ...config,
      safelist: [],
      content: [{ raw: markup, extension: "html" }],
    }),
  ]).process("@tailwind base; @tailwind utilities;", {
    from: `${repo}/viz/app/styles/globals.css`,
  })
).css;
const compat = await fs.readFile(`${dir}/tailwind-v3-compat.css`, "utf8");
const prefix = `@import 'tailwindcss' source(none);\n@config '${repo}/viz/tailwind.config.ts';\n`;
const v4Compiler = await compile(prefix, { base: repo, onDependency() {} });
const compatCompiler = await compile(prefix + compat, {
  base: repo,
  onDependency() {},
});
const v4 = v4Compiler.build(candidates);
const v4Compat = compatCompiler.build(candidates);
await fs.writeFile(`${dir}/compatibility-compiled.css`, v4Compat);
const snapshots = {};
const browser = await chromium.launch({ headless: true });
try {
  for (const [name, css] of Object.entries({ v3, v4, v4Compat })) {
    const page = await browser.newPage({
      viewport: { width: 1280, height: 1800 },
    });
    await page.setContent(
      `<style>${css}</style><style>${fixtureCss}</style>${markup}`
    );
    const read = async (ids) =>
      await page.evaluate(
        ({ cases, ids }) =>
          Object.fromEntries(
            cases
              .filter((fixture) => ids === null || ids.includes(fixture.id))
              .map((fixture) => {
                const node = document.getElementById(fixture.id);
                const target =
                  fixture.family === "divide"
                    ? node.querySelector("[data-target]")
                    : node;
                const style = getComputedStyle(
                  target,
                  fixture.family === "placeholder" ? "::placeholder" : null
                );
                const properties = {
                  bg: "backgroundColor",
                  text: "color",
                  border: "borderRightColor",
                  divide: "borderTopColor",
                  placeholder: "color",
                  blur: "filter",
                  backdropBlur: "backdropFilter",
                  columns: "columnWidth",
                  order: "order",
                };
                return [
                  fixture.id,
                  fixture.family === "ring"
                    ? style.getPropertyValue("--tw-ring-color").trim()
                    : style[properties[fixture.family]],
                ];
              })
          ),
        { cases, ids }
      );
    snapshots[name] = { base: await read(null), hover: {} };
    for (const fixture of cases.filter((fixture) => fixture.hover)) {
      await page.locator(`#${fixture.id}`).hover();
      snapshots[name].hover[fixture.id] = (await read([fixture.id]))[
        fixture.id
      ];
    }
    await page.close();
  }
} finally {
  await browser.close();
}
const normalize = (value) => value?.replaceAll("blur(0px)", "blur(0)");
const regressions = [];
for (const fixture of cases.filter(
  (x) => !x.control && !x.unsupported && !x.noColor
)) {
  for (const state of fixture.hover ? ["base", "hover"] : ["base"]) {
    const expected = snapshots.v3[state][fixture.id];
    const actual = snapshots.v4Compat[state][fixture.id];
    if (normalize(expected) !== normalize(actual))
      regressions.push({ id: fixture.id, state, expected, actual });
  }
}
const touchedControls = cases
  .filter((x) => x.control)
  .filter(
    (fixture) =>
      snapshots.v4.base[fixture.id] !== snapshots.v4Compat.base[fixture.id]
  )
  .map((fixture) => fixture.id);
const ringNoColor = Object.fromEntries(
  Object.entries(snapshots).map(([name, value]) => [
    name,
    value.base["ring-no-color"] === value.base["ring-no-opacity"],
  ])
);
const result = {
  browser: browser.version(),
  cases: cases.length,
  regressions,
  touchedControls,
  ringNoColor,
  unsupportedVariantExample: Object.fromEntries(
    Object.entries(snapshots).map(([name, value]) => [
      name,
      value.hover["bg-variant-opacity"],
    ])
  ),
  snapshots,
};
await fs.writeFile(
  `${dir}/compatibility-browser.json`,
  JSON.stringify(result, null, 2)
);
print(
  JSON.stringify(
    {
      cases: result.cases,
      regressions,
      touchedControls,
      ringNoColor,
      unsupportedVariantExample: result.unsupportedVariantExample,
    },
    null,
    2
  )
);
if (
  regressions.length ||
  touchedControls.length ||
  Object.values(ringNoColor).some((value) => !value)
)
  process.exitCode = 1;
