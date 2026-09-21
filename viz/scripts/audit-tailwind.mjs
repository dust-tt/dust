import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postcss from "postcss";
import selectorParser from "postcss-selector-parser";

const vizRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const safelist = await readFile(
  path.join(vizRoot, "app/styles/tailwind-v3-safelist.css"),
  "utf8",
);
const candidates = new Set(
  [...safelist.matchAll(/@source inline\("((?:\\.|[^"\\])*)"\);/g)].flatMap(
    (match) => JSON.parse(`"${match[1]}"`).split(/\s+/),
  ),
);
const emitted = new Set();
const cssDirectory = path.join(vizRoot, ".next/static/css");
const stylesheets = (await readdir(cssDirectory))
  .filter((filename) => filename.endsWith(".css"))
  .sort();
for (const filename of stylesheets) {
  const css = await readFile(path.join(cssDirectory, filename), "utf8");
  postcss.parse(css).walkRules(({ selector }) => {
    selectorParser((selectors) => {
      selectors.walkClasses(({ value }) => emitted.add(value));
    }).processSync(selector);
  });
}

const missingClasses = [...candidates]
  .filter((candidate) => !emitted.has(candidate))
  .sort();
const report = {
  buildId: (
    await readFile(path.join(vizRoot, ".next/BUILD_ID"), "utf8")
  ).trim(),
  stylesheets,
  candidateCount: candidates.size,
  emittedCandidateCount: candidates.size - missingClasses.length,
  missingClasses,
};
await writeFile(
  path.join(vizRoot, "public/tailwind-coverage.json"),
  `${JSON.stringify(report, null, 2)}\n`,
);
process.stdout.write(
  `Tailwind coverage: ${report.emittedCandidateCount}/${report.candidateCount} safelisted classes emitted; ${missingClasses.length} missing.\n` +
    "Missing classes recorded in public/tailwind-coverage.json for runtime diagnostics.\n",
);
