// Usage: node compare.mjs /absolute/repository/root [output-directory]
// Research CLI output; these tools do not execute inside an application server.
const print = (...values) =>
  process.stdout.write(
    values
      .map((v) => (typeof v === "string" ? v : JSON.stringify(v)))
      .join(" ") + "\n"
  );
import fs from "node:fs/promises";
import { createWriteStream } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { once } from "node:events";
import { createGzip } from "node:zlib";

const repo = path.resolve(process.argv[2] ?? process.cwd());
const out = path.resolve(
  process.argv[3] ?? path.join(tmpdir(), "viz-tailwind-audit")
);
const require = createRequire(`${repo}/package.json`);
const postcss = require("postcss");
const selectorParser = require("postcss-selector-parser");
const { transform, Features } = require("lightningcss");
const vocabulary = JSON.parse(
  await fs.readFile(path.join(out, "vocabulary.json"), "utf8")
);
const legacyCandidates = new Set(
  JSON.parse(await fs.readFile(path.join(out, "v3-candidates.json"), "utf8"))
);

function trim(s) {
  return s.trim().replace(/\s+/g, " ");
}
function parseCss(css) {
  const root = postcss.parse(css);
  const byClass = new Map();
  const globals = [];
  let ruleCount = 0;
  let declarationCount = 0;
  root.walkDecls(() => declarationCount++);
  root.walkRules((rule) => {
    const context = [];
    const layers = [];
    let skip = false;
    for (let p = rule.parent; p && p.type !== "root"; p = p.parent) {
      if (p.type === "rule")
        throw new Error(`Nesting not lowered: ${rule.selector}`);
      if (p.type === "atrule") {
        if (
          p.name === "keyframes" ||
          p.name === "-webkit-keyframes" ||
          p.name === "utility" ||
          p.name === "theme"
        )
          skip = true;
        else if (p.name === "layer") layers.unshift(trim(p.params));
        else context.unshift(`@${p.name} ${trim(p.params)}`);
      }
    }
    if (skip) return;
    ruleCount++;
    const declarations = rule.nodes
      .filter((n) => n.type === "decl")
      .map((n) => [n.prop, trim(n.value), !!n.important]);
    const names = new Set();
    const selector = selectorParser((ast) =>
      ast.walkClasses((c) => names.add(c.value))
    ).processSync(rule.selector, { lossless: false });
    const entry = { selector, context, layers, declarations };
    if (!names.size) globals.push(entry);
    for (const name of names) {
      if (!byClass.has(name)) byClass.set(name, []);
      byClass.get(name).push(entry);
    }
  });
  const globalAtRules = [];
  root.walkAtRules((a) => {
    if (
      [
        "property",
        "keyframes",
        "-webkit-keyframes",
        "font-face",
        "page",
        "theme",
        "utility",
        "import",
      ].includes(a.name) ||
      (a.name === "layer" && !a.nodes)
    ) {
      globalAtRules.push({ name: a.name, params: a.params, css: a.toString() });
    }
  });
  return { byClass, globals, globalAtRules, ruleCount, declarationCount };
}

async function load(version) {
  const source = await fs.readFile(path.join(out, `${version}.css`));
  const result = transform({
    filename: `${version}.css`,
    code: source,
    include: Features.Nesting,
    minify: false,
    errorRecovery: true,
  });
  const normalized = result.code;
  await fs.writeFile(
    path.join(out, `${version}.normalizer-warnings.json`),
    JSON.stringify(result.warnings, null, 2)
  );
  await fs.writeFile(path.join(out, `${version}.normalized.css`), normalized);
  const parsed = parseCss(normalized.toString());
  print(version, {
    rules: parsed.ruleCount,
    declarations: parsed.declarationCount,
    classes: parsed.byClass.size,
  });
  return parsed;
}
const v3 = await load("v3");
const v4 = await load("v4");

function splitCandidate(name) {
  let depth = 0,
    start = 0;
  const parts = [];
  for (let i = 0; i < name.length; i++) {
    const c = name[i];
    if (c === "[" || c === "(") depth++;
    if (c === "]" || c === ")") depth--;
    if (c === ":" && depth === 0) {
      parts.push(name.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(name.slice(start));
  return {
    utility: parts.pop().replace(/^!/, "").replace(/!$/, ""),
    variants: parts,
  };
}
const familyPrefixes = [
  "backdrop-hue-rotate",
  "backdrop-brightness",
  "backdrop-contrast",
  "backdrop-saturate",
  "backdrop-grayscale",
  "backdrop-opacity",
  "backdrop-invert",
  "backdrop-sepia",
  "backdrop-blur",
  "backdrop-filter",
  "placeholder-opacity",
  "placeholder",
  "border-opacity",
  "ring-offset",
  "ring-opacity",
  "divide-opacity",
  "bg-opacity",
  "text-opacity",
  "bg-gradient",
  "bg-blend",
  "bg-clip",
  "bg-origin",
  "bg",
  "from",
  "via",
  "to",
  "space-x-reverse",
  "space-y-reverse",
  "space-x",
  "space-y",
  "divide-x-reverse",
  "divide-y-reverse",
  "divide-x",
  "divide-y",
  "divide",
  "border-spacing",
  "border",
  "rounded",
  "ring",
  "outline",
  "shadow",
  "drop-shadow",
  "scroll-m",
  "scroll-p",
  "translate",
  "rotate",
  "scale",
  "skew",
  "transform",
  "origin",
  "transition",
  "duration",
  "delay",
  "ease",
  "animate",
  "fade-in",
  "fade-out",
  "zoom-in",
  "zoom-out",
  "spin-in",
  "spin-out",
  "slide-in",
  "slide-out",
  "fill-mode",
  "direction",
  "repeat",
  "running",
  "paused",
  "decoration",
  "underline",
  "font",
  "text",
  "tracking",
  "leading",
  "line-clamp",
  "list",
  "whitespace",
  "break",
  "hyphens",
  "indent",
  "align",
  "flex-grow",
  "flex-shrink",
  "flex",
  "grow",
  "shrink",
  "basis",
  "grid",
  "col",
  "row",
  "auto",
  "gap",
  "justify",
  "items",
  "content",
  "self",
  "place",
  "order",
  "size",
  "min-w",
  "max-w",
  "min-h",
  "max-h",
  "w",
  "h",
  "aspect",
  "columns",
  "object",
  "inset",
  "top",
  "right",
  "bottom",
  "left",
  "start",
  "end",
  "z",
  "p",
  "px",
  "py",
  "ps",
  "pe",
  "pt",
  "pr",
  "pb",
  "pl",
  "m",
  "mx",
  "my",
  "ms",
  "me",
  "mt",
  "mr",
  "mb",
  "ml",
  "blur",
  "brightness",
  "contrast",
  "grayscale",
  "hue-rotate",
  "invert",
  "saturate",
  "sepia",
  "filter",
  "opacity",
  "mix-blend",
  "overflow",
  "overscroll",
  "resize",
  "snap",
  "touch",
  "cursor",
  "pointer-events",
  "select",
  "will-change",
  "accent",
  "caret",
  "fill",
  "stroke",
  "table",
  "caption",
  "isolate",
  "isolation",
  "box",
];
function familyFor(name) {
  if (!legacyCandidates.has(name)) return "static-or-structural-selector";
  const { utility } = splitCandidate(name);
  const value = utility.replace(/^-/, "");
  if (value.startsWith("[")) return "arbitrary-property";
  if (value.startsWith("@")) return "container-query";
  if (/^scroll-m[xytrbles]?[-]/.test(value)) return "scroll-margin";
  if (/^scroll-p[xytrbles]?[-]/.test(value)) return "scroll-padding";
  if (/^(absolute|relative|fixed|sticky|static)$/.test(value))
    return "position";
  if (
    /^(block|inline|inline-block|hidden|contents|flow-root|inline-flex|inline-grid)$/.test(
      value
    )
  )
    return "display";
  if (/^(visible|invisible|collapse)$/.test(value)) return "visibility";
  if (
    /^(antialiased|subpixel-antialiased|italic|not-italic|normal-nums|ordinal|slashed-zero|lining-nums|oldstyle-nums|proportional-nums|tabular-nums|diagonal-fractions|stacked-fractions|uppercase|lowercase|capitalize|normal-case|truncate|no-underline|overline)$/.test(
      value
    )
  )
    return "typography-static";
  if (
    /^(appearance|float|clear|isolate|isolation|sr-only|not-sr-only|forced-color-adjust)/.test(
      value
    )
  )
    return "misc-static";
  if (
    value.startsWith("slide-") ||
    value.startsWith("responsive-") ||
    /^leading-\d+p$/.test(value)
  )
    return "viz-custom";
  return (
    familyPrefixes.find((p) => value === p || value.startsWith(p + "-")) ??
    `static:${value}`
  );
}
const withoutLayers = (rules) =>
  JSON.stringify(rules.map(({ layers, ...r }) => r));
const signature = (rules, key) => JSON.stringify(rules.map((r) => r[key]));
const quote = (s) => '"' + String(s).replaceAll('"', '""') + '"';
const csv = ["class,status,family,flags"];
const counts = {};
const familyMap = new Map();
const gzip = createGzip();
const raw = createWriteStream(path.join(out, "class-diff.jsonl.gz"));
gzip.pipe(raw);
for (const name of vocabulary) {
  const before = v3.byClass.get(name) ?? [];
  const after = v4.byClass.get(name) ?? [];
  const family = familyFor(name);
  const flags = [];
  const status = !before.length
    ? "baseline-invalid-css"
    : !after.length
      ? "missing"
      : withoutLayers(before) === withoutLayers(after)
        ? "matching-rule-text"
        : "changed-rule-text";
  if (after.length)
    for (const key of ["selector", "context", "declarations", "layers"]) {
      if (signature(before, key) !== signature(after, key)) flags.push(key);
    }
  counts[status] = (counts[status] ?? 0) + 1;
  if (!familyMap.has(family))
    familyMap.set(family, {
      family,
      total: 0,
      counts: {},
      flags: {},
      samples: [],
    });
  const group = familyMap.get(family);
  group.total++;
  group.counts[status] = (group.counts[status] ?? 0) + 1;
  for (const flag of flags) group.flags[flag] = (group.flags[flag] ?? 0) + 1;
  const record = { name, family, status, flags, before, after };
  group.samples.push(record);
  group.samples.sort(
    (a, b) =>
      (a.status === "matching-rule-text") -
        (b.status === "matching-rule-text") ||
      a.name.length - b.name.length ||
      a.name.localeCompare(b.name)
  );
  if (group.samples.length > 6) group.samples.length = 6;
  csv.push([name, status, family, flags.join(";")].map(quote).join(","));
  if (!gzip.write(JSON.stringify(record) + "\n")) await once(gzip, "drain");
}
gzip.end();
await once(raw, "finish");
const extraClasses = [...v4.byClass.keys()].filter((n) => !v3.byClass.has(n));
const families = [...familyMap.values()].sort((a, b) => b.total - a.total);
const globals = {
  before: { rules: v3.globals, atRules: v3.globalAtRules },
  after: { rules: v4.globals, atRules: v4.globalAtRules },
};
const summary = {
  classes: vocabulary.length,
  counts,
  families: families.length,
  extraClasses,
  globalRules: { v3: v3.globals.length, v4: v4.globals.length },
  globalAtRules: { v3: v3.globalAtRules.length, v4: v4.globalAtRules.length },
};
await fs.writeFile(path.join(out, "classes.csv"), csv.join("\n") + "\n");
await fs.writeFile(
  path.join(out, "families.json"),
  JSON.stringify(families, null, 2)
);
await fs.writeFile(
  path.join(out, "globals.json"),
  JSON.stringify(globals, null, 2)
);
await fs.writeFile(
  path.join(out, "summary.json"),
  JSON.stringify(summary, null, 2)
);
print(summary);
print(
  families.map(({ family, total, counts }) => ({ family, total, ...counts }))
);
