// Usage: node probe-utility-mappings.mjs /absolute/repository/root [output-directory]
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
const { compile } = require("@tailwindcss/node");
const postcss = require("postcss");
const scenarios = {
  configTheme: {
    source: `@config '${repo}/viz/tailwind.config.ts';`,
    candidates: [
      "rounded",
      "rounded-sm",
      "rounded-md",
      "rounded-lg",
      "rounded-xl",
      "shadow",
      "shadow-sm",
      "shadow-md",
      "font-sans",
      "font-mono",
      "bg-background",
      "dark:bg-background",
    ],
  },
  themeShadowOverride: {
    source: "@theme { --shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05); }",
    candidates: ["shadow-sm", "hover:shadow-sm", "shadow-lg"],
  },
  nativeLegacyCandidates: {
    source: "",
    candidates: [
      "flex-shrink",
      "flex-shrink-0",
      "flex-grow",
      "flex-grow-0",
      "overflow-ellipsis",
      "decoration-slice",
      "decoration-clone",
      "bg-opacity-50",
      "text-opacity-50",
      "border-opacity-50",
      "divide-opacity-50",
      "ring-opacity-50",
      "placeholder-opacity-50",
      "bg-gradient-to-r",
      "filter",
      "transform",
      "blur",
      "backdrop-blur",
    ],
  },
  alias: {
    source: "@utility flex-shrink-0 { @apply shrink-0; }",
    candidates: ["flex-shrink-0", "hover:flex-shrink-0", "md:flex-shrink-0"],
  },
  overrideOutline: {
    source: "@utility outline-none { @apply outline-hidden; }",
    candidates: ["outline-none", "focus:outline-none"],
  },
  overrideShadow: {
    source: "@utility shadow-sm { @apply shadow-xs; }",
    candidates: ["shadow-sm", "hover:shadow-sm"],
  },
  opacityVariableOnly: {
    source:
      "@utility bg-opacity-* { --legacy-bg-opacity: calc(--value(integer) / 100); }",
    candidates: ["bg-red-500", "bg-opacity-50", "hover:bg-opacity-75"],
  },
  restoredLegacyLineHeight: {
    source:
      "@utility leading-96p { line-height: 0.96; } .probe { @apply leading-96p; }",
    candidates: ["leading-96p", "md:leading-96p"],
  },
};
const observations = {};
for (const [name, scenario] of Object.entries(scenarios)) {
  const build = await compile(
    `@import 'tailwindcss' source(none);\n${scenario.source}`,
    {
      base: repo,
      onDependency() {},
    }
  );
  const css = build.build(scenario.candidates);
  const rules = [];
  postcss.parse(css).walkRules((rule) => {
    if (
      rule.selector === ":root, :host" ||
      (rule.parent?.type === "atrule" && rule.parent.name === "keyframes")
    )
      return;
    if (rule.selector.startsWith(".") || rule.selector.startsWith("&")) {
      rules.push({
        selector: rule.selector,
        css: rule.toString(),
        declarations: rule.nodes
          .filter((n) => n.type === "decl")
          .map((d) => `${d.prop}: ${d.value}`),
        parent:
          rule.parent?.type === "atrule"
            ? `@${rule.parent.name} ${rule.parent.params}`
            : rule.parent?.selector,
      });
    }
  });
  observations[name] = rules;
  await fs.writeFile(`${dir}/probe-${name}.css`, css);
}
const tailwindV3 = require(`${repo}/viz/node_modules/tailwindcss`);
const loadConfig = require(`${repo}/viz/node_modules/tailwindcss/loadConfig`);
const v3Config = loadConfig(`${repo}/viz/tailwind.config.ts`);
const v3Result = await postcss([
  tailwindV3({
    ...v3Config,
    safelist: [],
    content: [
      { raw: scenarios.configTheme.candidates.join(" "), extension: "html" },
    ],
  }),
]).process("@tailwind utilities;", {
  from: `${repo}/viz/app/styles/globals.css`,
});
observations.v3ConfigTheme = [];
postcss.parse(v3Result.css).walkRules((rule) =>
  observations.v3ConfigTheme.push({
    selector: rule.selector,
    css: rule.toString(),
  })
);
await fs.writeFile(`${dir}/probe-v3ConfigTheme.css`, v3Result.css);
await fs.writeFile(
  `${dir}/utility-mapping-observations.json`,
  JSON.stringify(observations, null, 2)
);
process.stdout.write(JSON.stringify(observations, null, 2) + "\n");
