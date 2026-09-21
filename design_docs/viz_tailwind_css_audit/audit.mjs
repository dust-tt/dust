// Usage: node audit.mjs /absolute/repository/root [output-directory]
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
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";

const repo = path.resolve(process.argv[2] ?? process.cwd());
const out = path.resolve(
  process.argv[3] ?? path.join(tmpdir(), "viz-tailwind-audit")
);
const require = createRequire(`${repo}/package.json`);
const postcss = require("postcss");
const selectors = require("postcss-selector-parser");
const tw3 = require(`${repo}/viz/node_modules/tailwindcss`);
const loadConfig = require(`${repo}/viz/node_modules/tailwindcss/loadConfig`);
const tw4 = require("@tailwindcss/node");
const config = loadConfig(`${repo}/viz/tailwind.config.ts`);
const input = await fs.readFile(`${repo}/viz/app/styles/globals.css`, "utf8");
await fs.mkdir(out, { recursive: true });
process.chdir(`${repo}/viz`);
const legacy = await postcss([tw3(config)]).process(input, {
  from: `${repo}/viz/app/styles/globals.css`,
});
const allClasses = new Set();
const candidates = new Set();
legacy.root.walkRules((rule) => {
  selectors((ast) =>
    ast.walkClasses((c) => allClasses.add(c.value))
  ).processSync(rule.selector);
});
legacy.root.walk((node) => {
  const candidate = node.raws?.tailwind?.candidate;
  if (typeof candidate === "string" && candidate !== "*")
    candidates.add(candidate);
});
print("V3 metadata", {
  rules: legacy.root.nodes.length,
  classes: allClasses.size,
  candidates: candidates.size,
});
// Supply every class present in the current compiled CSS, not just the checked-in source.
const vocabulary = [...allClasses].sort();
const v4input = postcss.parse(input);
const tailwindRules = [];
v4input.walkAtRules("tailwind", (node) => {
  tailwindRules.push(node);
});
for (const node of tailwindRules) node.remove();
const customUtilities = [];
const utilityLayers = [];
v4input.walkAtRules("layer", (node) => {
  if (node.params === "utilities") utilityLayers.push(node);
});
for (const layer of utilityLayers) {
  for (const rule of [...layer.nodes]) {
    if (rule.type === "comment") continue;
    if (rule.type !== "rule" || !/^\.leading-\d+p$/.test(rule.selector))
      throw new Error(`Unreviewed custom utility: ${rule.toString()}`);
    customUtilities.push(rule.selector.slice(1));
    const utility = postcss.atRule({
      name: "utility",
      params: rule.selector.slice(1),
    });
    utility.append(rule.nodes.map((n) => n.clone()));
    layer.before(utility);
  }
  layer.remove();
}
v4input.prepend(
  postcss.atRule({
    name: "config",
    params: JSON.stringify(`${repo}/viz/tailwind.config.ts`),
  })
);
v4input.prepend(
  postcss.atRule({ name: "import", params: '"tailwindcss" source(none)' })
);
const compiled = await tw4.compile(v4input.toString(), {
  base: `${repo}/viz/app/styles`,
  onDependency() {},
});
const v4css = compiled.build(vocabulary);
// V3's plugin leaves CSS imports for Next's CSS bundler. Expand this one explicitly.
const importedAnimationCss = await fs.readFile(
  `${repo}/node_modules/tw-animate-css/dist/tw-animate.css`,
  "utf8"
);
const v3css = legacy.css.replace(
  '@import "tw-animate-css";',
  importedAnimationCss
);
const hash = (s) => createHash("sha256").update(s).digest("hex");
const manifest = {
  timestamp: new Date().toISOString(),
  sourceRevision: execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: repo,
    encoding: "utf8",
  }).trim(),
  vocabularySha256: hash(JSON.stringify(vocabulary)),
  versions: {
    v3: require(`${repo}/viz/node_modules/tailwindcss/package.json`).version,
    v4: require("tailwindcss/package.json").version,
  },
  inputHashes: {
    globals: hash(input),
    config: hash(await fs.readFile(`${repo}/viz/tailwind.config.ts`)),
  },
  classes: vocabulary.length,
  metadataCandidates: candidates.size,
  customUtilities,
  bytes: { v3: Buffer.byteLength(v3css), v4: Buffer.byteLength(v4css) },
};
for (const [file, data] of Object.entries({
  "v3.css": v3css,
  "v4.css": v4css,
  "v4-input.css": v4input.toString(),
  "vocabulary.json": JSON.stringify(vocabulary, null, 2),
  "v3-candidates.json": JSON.stringify([...candidates].sort()),
  "manifest.json": JSON.stringify(manifest, null, 2),
}))
  await fs.writeFile(path.join(out, file), data);
print(manifest);
