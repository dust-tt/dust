// Usage: node generate-compat.mjs /absolute/repository/root [output-directory] [audit-output-directory]
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
import { gzipSync } from "node:zlib";

const repo = path.resolve(process.argv[2] ?? process.cwd());
const dir = path.resolve(
  process.argv[3] ?? path.join(tmpdir(), "viz-tailwind-compat")
);
await fs.mkdir(dir, { recursive: true });
const require = createRequire(`${repo}/package.json`);
const postcss = require("postcss");
const selectorParser = require("postcss-selector-parser");
const audit = path.resolve(
  process.argv[4] ?? path.join(tmpdir(), "viz-tailwind-audit")
);
const baseline = postcss.parse(await fs.readFile(`${audit}/v3.css`, "utf8"));
const csv = await fs.readFile(`${audit}/classes.csv`, "utf8");
const missing = [...csv.matchAll(/^"([^"]+)","missing",/gm)].map((x) => x[1]);
const families = ["bg", "text", "border", "divide", "placeholder", "ring"];
const expected = new Set(missing);
const found = new Set();
const stats = Object.fromEntries(
  families.map((x) => [x, { rules: 0, declarations: 0, guards: 0 }])
);
const alpha = (family) => `--tw-${family}-opacity`;
const privateAlpha = (family) => `--viz-legacy-${family}-opacity`;
const guards = Object.fromEntries(
  families.map((family) => [
    family,
    `:where(${missing
      .filter((name) => name.startsWith(`${family}-opacity-`))
      .map((name) => `.${name}`)
      .join(",")})`,
  ])
);
const acceptedProperty = (family, prop) =>
  prop === alpha(family) ||
  {
    bg: prop === "background-color",
    text: prop === "color",
    border: /^border(?:-[a-z]+)*-color$/.test(prop),
    divide: /^border(?:-[a-z]+)*-color$/.test(prop),
    placeholder: prop === "color",
    ring: prop === "--tw-ring-color",
  }[family];
const classFamily = (name) => {
  let start = 0;
  let depth = 0;
  for (let i = 0; i < name.length; i++) {
    if (name[i] === "\\") {
      i++;
      continue;
    }
    if (name[i] === "[" || name[i] === "(") depth++;
    else if (name[i] === "]" || name[i] === ")") depth--;
    else if (name[i] === ":" && depth === 0) start = i + 1;
  }
  const utility = name.slice(start).replace(/^!/, "");
  return families.find((family) => utility.startsWith(`${family}-`));
};

function selectRule(node) {
  const selector = selectorParser().astSync(node.selector);
  const candidates = [];
  selector.walkClasses((classNode) => {
    const family = classFamily(classNode.value);
    if (
      !family ||
      !node.nodes.some(
        (n) => n.type === "decl" && acceptedProperty(family, n.prop)
      )
    )
      return;
    candidates.push({ classNode, family });
  });
  if (candidates.length !== 1) return null;
  const { classNode, family } = candidates[0];
  const result = node.clone({ nodes: [] });
  for (const decl of node.nodes) {
    if (decl.type !== "decl" || !acceptedProperty(family, decl.prop)) continue;
    const clone = decl.clone();
    if (clone.prop === alpha(family)) clone.prop = privateAlpha(family);
    clone.value = clone.value.replaceAll(alpha(family), privateAlpha(family));
    if (clone.important)
      throw new Error(`Unexpected important declaration: ${decl.toString()}`);
    result.append(clone);
    stats[family].declarations++;
  }
  classNode.parent.insertBefore(
    classNode,
    selectorParser.nesting({ value: "&" })
  );
  result.selector = selector.toString();
  stats[family].rules++;
  if (expected.has(classNode.value)) found.add(classNode.value);
  return { family, result };
}

function extract(container) {
  const output = postcss.root();
  let previousFamily = null;
  let previousGuard = null;
  for (const node of container.nodes ?? []) {
    if (node.type === "atrule" && node.nodes && node.name !== "keyframes") {
      const children = extract(node);
      if (children.nodes.length)
        output.append(node.clone({ nodes: children.nodes }));
      previousFamily = previousGuard = null;
    } else if (node.type === "rule") {
      const selected = selectRule(node);
      if (!selected) continue;
      if (previousFamily !== selected.family) {
        previousGuard = postcss.rule({ selector: guards[selected.family] });
        output.append(previousGuard);
        previousFamily = selected.family;
        stats[selected.family].guards++;
      }
      previousGuard.append(selected.result);
    }
  }
  return output;
}

const utilitySource = `/* Generated research prototype for the 133 missing Viz V3 class names.
 * Import into a Tailwind V4 source stylesheet. No Sparkle source changes.
 * The opacity bridge is limited to the exact inventoried legacy vocabulary.
 * Retains old color declarations only when a matching old opacity class exists.
 */
@utility blur-0 { @apply blur-[0px]; }
@utility backdrop-blur-0 { @apply backdrop-blur-[0px]; }
@utility columns-2xs { columns: 18rem; }
@utility columns-3xs { columns: 16rem; }
@utility -order-first { order: 9999; }
@utility -order-last { order: -9999; }
@utility -order-none { order: 0; }
`;
const bridge = postcss.atRule({
  name: "layer",
  params: "utilities",
  nodes: extract(baseline).nodes,
});
const css = `${utilitySource}\n${bridge.toString()}\n`;
for (const name of [
  "blur-0",
  "backdrop-blur-0",
  "columns-2xs",
  "columns-3xs",
  "-order-first",
  "-order-last",
  "-order-none",
])
  found.add(name);
const unmatched = missing.filter((name) => !found.has(name));
const metadata = {
  baseline: "v3.css",
  missing: missing.length,
  restored: found.size,
  unmatched,
  families: stats,
  sourceBytes: Buffer.byteLength(css),
  sourceGzipBytes: gzipSync(css).length,
};
await fs.writeFile(`${dir}/tailwind-v3-compat.css`, css);
await fs.writeFile(
  `${dir}/aliases.css`,
  `/* Seven standalone aliases for a future Viz Tailwind V4 migration.
 * The six legacy opacity families require the separate generated bridge.
 */\n${utilitySource.slice(utilitySource.indexOf("@utility"))}`
);
await fs.writeFile(`${dir}/opacity-bridge.css`, `${bridge.toString()}\n`);
await fs.writeFile(
  `${dir}/compatibility-generation.json`,
  JSON.stringify(metadata, null, 2)
);
print(JSON.stringify(metadata, null, 2));
if (unmatched.length) process.exitCode = 1;
