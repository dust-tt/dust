// Usage: node probe.mjs /absolute/repository/root [output-directory]
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
const out = path.resolve(
  process.argv[3] ?? path.join(tmpdir(), "viz-tailwind-audit")
);
const require = createRequire(`${repo}/package.json`);
const postcss = require("postcss");
const { chromium } = require("playwright");
const aliases = `
/* Audit prototype only. These names are absent from this V4 build. */
@layer utilities {
  .columns-3xs { columns: 16rem; }
  .columns-2xs { columns: 18rem; }
  .-order-first { order: 9999; }
  .-order-last { order: -9999; }
  .-order-none { order: 0; }
  .blur-0 { --tw-blur: blur(0); filter: var(--tw-blur,) var(--tw-brightness,) var(--tw-contrast,) var(--tw-grayscale,) var(--tw-hue-rotate,) var(--tw-invert,) var(--tw-saturate,) var(--tw-sepia,) var(--tw-drop-shadow,); }
  .backdrop-blur-0 { --tw-backdrop-blur: blur(0); backdrop-filter: var(--tw-backdrop-blur,) var(--tw-backdrop-brightness,) var(--tw-backdrop-contrast,) var(--tw-backdrop-grayscale,) var(--tw-backdrop-hue-rotate,) var(--tw-backdrop-invert,) var(--tw-backdrop-opacity,) var(--tw-backdrop-saturate,) var(--tw-backdrop-sepia,); }
}
`;
const v3 = await fs.readFile(path.join(out, "v3.css"), "utf8");
const v4 = await fs.readFile(path.join(out, "v4.css"), "utf8");
// Put the legacy component rules before built-in utilities, in the SAME native layer.
// This preserves V3's specificity plus source-order relationship for this fixture.
const fixedRoot = postcss.parse(v4);
const utilities = fixedRoot.nodes.find(
  (n) =>
    n.type === "atrule" &&
    n.name === "layer" &&
    n.params === "utilities" &&
    n.nodes
);
const components = fixedRoot.nodes.filter(
  (n) => n.type === "atrule" && n.name === "layer" && n.params === "components"
);
const lifted = components.flatMap((n) => n.nodes.map((c) => c.clone()));
utilities.prepend(lifted);
for (const node of components) node.remove();
const fixed = fixedRoot.toString() + aliases;
await fs.writeFile(path.join(out, "seven-aliases.prototype.css"), aliases);

const fixtures = [
  [
    "font",
    '<div id="probe" class="font-sans font-semibold text-3xl">Heading</div>',
    ["fontSize", "fontWeight", "fontFamily", "lineHeight"],
  ],
  [
    "radius",
    '<div id="probe" class="rounded-sm rounded-md"></div>',
    ["borderRadius"],
  ],
  ["shadow", '<div id="probe" class="shadow-md"></div>', ["boxShadow"]],
  [
    "border",
    '<div id="probe" class="border"></div>',
    ["borderTopColor", "borderTopWidth"],
  ],
  [
    "spacing",
    '<div id="probe" class="p-4 m-2 gap-4 w-24"></div>',
    ["padding", "margin", "gap", "width"],
  ],
  [
    "responsive-text",
    '<div class="responsive-text"><div id="probe" class="text-3xl p-4 gap-4"></div></div>',
    ["fontSize", "padding", "gap"],
  ],
  [
    "slide-heading",
    '<div id="probe" class="slide-heading2 text-3xl leading-tight">Heading</div>',
    ["fontSize", "lineHeight"],
  ],
  ["max-width", '<div id="probe" class="max-w-lg"></div>', ["maxWidth"]],
  ["columns", '<div id="probe" class="columns-lg"></div>', ["columnWidth"]],
  [
    "columns-2xs",
    '<div id="probe" class="columns-2xs"></div>',
    ["columnWidth"],
  ],
  [
    "columns-3xs",
    '<div id="probe" class="columns-3xs"></div>',
    ["columnWidth"],
  ],
  [
    "negative-order-first",
    '<div id="probe" class="-order-first"></div>',
    ["order"],
  ],
  [
    "negative-order-last",
    '<div id="probe" class="-order-last"></div>',
    ["order"],
  ],
  [
    "negative-order-none",
    '<div id="probe" class="-order-none"></div>',
    ["order"],
  ],
  [
    "blur-zero",
    '<div id="probe" class="blur-0 brightness-125"></div>',
    ["filter"],
  ],
  [
    "backdrop-blur-zero",
    '<div id="probe" class="backdrop-blur-0 backdrop-brightness-125"></div>',
    ["backdropFilter"],
  ],
  ["blur-small", '<div id="probe" class="blur-sm"></div>', ["filter"]],
  [
    "outline-none",
    '<div id="probe" class="outline-none"></div>',
    ["outlineStyle", "outlineWidth", "outlineColor", "outlineOffset"],
  ],
  ["ring", '<div id="probe" class="ring"></div>', ["boxShadow"]],
  ["red", '<div id="probe" class="bg-red-500"></div>', ["backgroundColor"]],
  [
    "red-opacity",
    '<div id="probe" class="bg-red-500 bg-opacity-50"></div>',
    ["backgroundColor"],
  ],
  [
    "semantic-opacity",
    '<div id="probe" class="bg-background/50"></div>',
    ["backgroundColor"],
  ],
  [
    "gradient-linear",
    '<div id="probe" class="bg-gradient-to-b from-white to-stone-50"></div>',
    ["backgroundImage"],
  ],
  [
    "gradient-radial",
    '<div id="probe" class="bg-gradient-radial from-white to-stone-50"></div>',
    ["backgroundImage"],
  ],
  [
    "gradient-conic",
    '<div id="probe" class="bg-gradient-conic from-white to-stone-50"></div>',
    ["backgroundImage"],
  ],
  [
    "space",
    '<div class="space-y-4"><div>A</div><div id="probe" class="mt-2">B</div><div hidden>C</div></div>',
    ["marginTop", "marginBottom"],
  ],
  [
    "divide",
    '<div class="divide-y-2"><div>A</div><div id="probe">B</div><div hidden>C</div></div>',
    ["borderTopWidth", "borderBottomWidth", "borderTopColor"],
  ],
  [
    "transform-reset",
    '<div id="probe" class="scale-150 transform-none"></div>',
    ["transform", "scale"],
  ],
  [
    "translate",
    '<div style="position:relative;width:400px"><div id="probe" class="absolute left-1/2 -translate-x-1/2" style="width:100px;height:20px"></div></div>',
    ["transform", "translate"],
  ],
  ["hidden", '<div id="probe" class="block" hidden>A</div>', ["display"]],
  ["button", '<button id="probe">Button</button>', ["cursor"]],
  [
    "placeholder",
    '<input id="probe" placeholder="Placeholder">',
    ["color"],
    "::placeholder",
  ],
  [
    "vertical-padding",
    '<div id="probe" class="px-4" style="writing-mode:vertical-rl"></div>',
    ["paddingTop", "paddingRight", "paddingBottom", "paddingLeft"],
  ],
  [
    "animation",
    '<div id="probe" class="animate-in fade-in-50 zoom-in-95 duration-300"></div>',
    ["animationName", "animationDuration", "animationFillMode"],
  ],
  [
    "custom-leading",
    '<div id="probe" class="leading-96p text-base">Heading</div>',
    ["lineHeight"],
  ],
];
const browser = await chromium.launch({ headless: true });
const observations = {};
try {
  for (const [version, css] of Object.entries({
    v3,
    v4,
    v4Split: v4,
    v4SevenAliasesAndLayers: fixed,
  })) {
    const page = await browser.newPage({
      viewport: { width: 400, height: 800 },
      reducedMotion: "reduce",
    });
    if (version === "v4Split" || version === "v4SevenAliasesAndLayers") {
      const styles = [];
      for (const node of postcss.parse(css).nodes) {
        if (
          node.type === "atrule" &&
          node.name === "layer" &&
          node.params === "utilities" &&
          node.nodes
        ) {
          for (let i = 0; i < node.nodes.length; i += 10000) {
            const chunk = node.clone({ nodes: [] });
            chunk.append(node.nodes.slice(i, i + 10000).map((n) => n.clone()));
            styles.push(chunk.toString());
          }
        } else styles.push(node.toString());
      }
      await page.setContent(
        styles.map((s) => `<style>${s}</style>`).join("") +
          '<main id="stage"></main>'
      );
    } else
      await page.setContent(`<style>${css}</style><main id="stage"></main>`);
    const diagnostics = await page.evaluate(() => ({
      browser: navigator.userAgent,
      sheets: document.styleSheets.length,
      cssLength: [...document.querySelectorAll("style")].reduce(
        (n, s) => n + s.textContent.length,
        0
      ),
      rootRadius: getComputedStyle(document.documentElement).getPropertyValue(
        "--radius"
      ),
      topRules: [...document.styleSheets[0].cssRules].slice(-15).map((r) => ({
        type: r.constructor.name,
        name: r.name,
        selector: r.selectorText,
        rules: r.cssRules?.length,
      })),
    }));
    await fs.writeFile(
      path.join(out, `${version}.browser-cssom.json`),
      JSON.stringify(diagnostics, null, 2)
    );
    observations[version] = await page.evaluate((fixtures) => {
      const results = {};
      const stage = document.getElementById("stage");
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 1;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      for (const [name, html, props, pseudo] of fixtures) {
        stage.innerHTML = html;
        const target = document.getElementById("probe");
        const style = getComputedStyle(target, pseudo);
        const result = Object.fromEntries(props.map((p) => [p, style[p]]));
        if (name === "translate")
          result.offsetLeft =
            target.getBoundingClientRect().left -
            target.parentElement.getBoundingClientRect().left;
        for (const p of props.filter((p) =>
          p.toLowerCase().endsWith("color")
        )) {
          ctx.clearRect(0, 0, 1, 1);
          ctx.fillStyle = style[p];
          ctx.fillRect(0, 0, 1, 1);
          result[p + "SRGBA"] = [...ctx.getImageData(0, 0, 1, 1).data];
        }
        results[name] = result;
      }
      return results;
    }, fixtures);
    await page.close();
  }
} finally {
  await browser.close();
}
await fs.writeFile(
  path.join(out, "browser-probes.json"),
  JSON.stringify(observations, null, 2)
);
for (const [name] of fixtures)
  print(
    name,
    JSON.stringify(
      Object.fromEntries(
        Object.entries(observations).map(([version, cases]) => [
          version,
          cases[name],
        ])
      )
    )
  );
