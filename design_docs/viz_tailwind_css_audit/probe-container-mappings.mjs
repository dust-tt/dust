// Usage: node probe-container-mappings.mjs /absolute/repository/root [output-directory]
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
const selectorParser = require("postcss-selector-parser");
const tailwindV3 = require(`${repo}/viz/node_modules/tailwindcss`);
const loadConfig = require(`${repo}/viz/node_modules/tailwindcss/loadConfig`);
const resolveConfig = require(
  `${repo}/viz/node_modules/tailwindcss/resolveConfig`
);
const config = loadConfig(`${repo}/viz/tailwind.config.ts`);
const resolved = resolveConfig(config);
const candidates = [
  "@container",
  "@container/main",
  "@container-normal",
  "@xxxs:flex",
  "@xxs:flex",
  "@xs:flex",
  "@sm:flex",
  "@md:flex",
  "@xl:flex",
  "@2xl:flex",
  "columns-2xs",
  "columns-3xs",
  "columns-lg",
  "max-w-lg",
  "@lg:bg-red-500",
  "@lg/main:bg-red-500",
  "@[42rem]:flex",
  "@[42rem]/main:flex",
];
const missing = [
  "blur-0",
  "backdrop-blur-0",
  "columns-2xs",
  "columns-3xs",
  "-order-first",
  "-order-last",
  "-order-none",
];
const prefix = `@import 'tailwindcss' source(none);\n`;
const loadOriginal = `@config '${repo}/viz/tailwind.config.ts';`;
const packageCode = `const { createRequire } = require('node:module');\nconst r = createRequire(${JSON.stringify(`${repo}/package.json`)});\nconst cfg = r(${JSON.stringify(`${repo}/viz/node_modules/tailwindcss/loadConfig`)})(${JSON.stringify(`${repo}/viz/tailwind.config.ts`)});\n`;
await fs.writeFile(
  `${dir}/explicit-max-width.cjs`,
  packageCode +
    `module.exports = { ...cfg, theme: { ...cfg.theme, maxWidth: ${JSON.stringify(resolved.theme.maxWidth)} } };\n`
);
await fs.writeFile(
  `${dir}/split-containers.cjs`,
  packageCode +
    `
const plugin = r('tailwindcss/plugin');
const legacyQueries = plugin(({ matchVariant }) => {
  matchVariant('@', (value, { modifier }) => '@container ' + (modifier ?? '') + ' (min-width: ' + value + ')', {
    values: ${JSON.stringify(resolved.theme.containers)},
    sort: (a, b) => {
      const delta = parseFloat(a.value) - parseFloat(b.value);
      if (delta) return delta;
      const first = a.modifier ?? '';
      const second = b.modifier ?? '';
      if (!first && second) return 1;
      if (first && !second) return -1;
      return first.localeCompare(second, 'en', { numeric: true });
    },
  });
});
const { containers, ...extend } = cfg.theme.extend;
module.exports = { ...cfg, theme: { ...cfg.theme, extend }, plugins: [r('tailwindcss-animate'), legacyQueries] };
`
);
await fs.writeFile(
  `${dir}/split-containers-alias.cjs`,
  (await fs.readFile(`${dir}/split-containers.cjs`, "utf8")).replace(
    "matchVariant('@',",
    "matchVariant('legacy-container',"
  )
);
const scenarios = {
  original: loadOriginal,
  themeOverride: `${loadOriginal}\n@theme { --container-lg: 32rem; }`,
  explicitMaxWidth: `@config '${dir}/explicit-max-width.cjs';`,
  splitContainers: `@config '${dir}/split-containers.cjs';`,
  splitContainersAlias: `@config '${dir}/split-containers-alias.cjs';`,
  faithfulMissingMappings: `@config '${dir}/split-containers.cjs';\n@utility blur-0 { @apply blur-[0px]; }\n@utility backdrop-blur-0 { @apply backdrop-blur-[0px]; }\n@utility -order-first { order: 9999; }\n@utility -order-last { order: -9999; }\n@utility -order-none { order: 0; }`,
  missingMappings: `@utility blur-0 { @apply blur-none; }\n@utility backdrop-blur-0 { @apply backdrop-blur-none; }\n@utility columns-2xs { columns: 18rem; }\n@utility columns-3xs { columns: 16rem; }\n@utility -order-first { order: 9999; }\n@utility -order-last { order: -9999; }\n@utility -order-none { order: 0; }`,
};
const observations = {
  resolvedV3: {
    columns: resolved.theme.columns,
    maxWidth: resolved.theme.maxWidth,
    containers: resolved.theme.containers,
  },
};
for (const [name, source] of Object.entries(scenarios)) {
  const instance = await compile(prefix + source, {
    base: repo,
    onDependency() {},
  });
  const vocabulary =
    name.endsWith("MissingMappings") || name === "missingMappings"
      ? missing.concat(missing.map((x) => `md:${x}`))
      : candidates;
  const aliasMap = new Map(
    vocabulary.map((candidate) => [
      name === "splitContainersAlias"
        ? candidate.replace(/^@([^:]+):/, "legacy-container-$1:")
        : candidate,
      candidate,
    ])
  );
  const parsed = postcss.parse(instance.build([...aliasMap.keys()]));
  if (name === "splitContainersAlias") {
    const rules = [];
    parsed.walkRules((rule) => {
      rules.push(rule);
    });
    for (const rule of rules) {
      const selector = selectorParser().astSync(rule.selector);
      const classes = [];
      selector.walkClasses((node) => {
        classes.push(node);
      });
      for (const node of classes) {
        if (aliasMap.has(node.value)) node.value = aliasMap.get(node.value);
      }
      rule.selector = selector.toString();
    }
  }
  const css = parsed.toString();
  const utilityLayer = parsed.nodes.find(
    (x) => x.type === "atrule" && x.name === "layer" && x.params === "utilities"
  );
  observations[name] = utilityLayer?.toString();
  await fs.writeFile(`${dir}/container-${name}.css`, css);
}
const v3Result = await postcss([
  tailwindV3({
    ...config,
    safelist: [],
    content: [{ raw: candidates.concat(missing).join(" "), extension: "html" }],
  }),
]).process("@tailwind utilities;", {
  from: `${repo}/viz/app/styles/globals.css`,
});
observations.v3 = v3Result.css;
await fs.writeFile(
  `${dir}/container-mapping-observations.json`,
  JSON.stringify(observations, null, 2)
);
process.stdout.write(JSON.stringify(observations, null, 2) + "\n");
