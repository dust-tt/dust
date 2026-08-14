import { spawnSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

// Re-runs the Storybook test suite in strict a11y mode (axe violations fail)
// and syncs the "a11y-issues" tag on story metas: added to files with at
// least one violating story, removed from files that are now clean. Commit
// the resulting diff. Usage: `npm run a11y:sync`.

const TAG = "a11y-issues";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const storiesDir = path.resolve(rootDir, "src/stories");

const reportPath = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), "a11y-sync-")),
  "report.json"
);

console.log("Running story tests in strict a11y mode (takes a few minutes)…");
const run = spawnSync(
  "npx",
  [
    "vitest",
    "run",
    "--project=storybook",
    "--reporter=json",
    `--outputFile=${reportPath}`,
  ],
  {
    cwd: rootDir,
    stdio: ["ignore", "ignore", "inherit"],
    env: {
      ...process.env,
      VITE_A11Y_STRICT: "1",
      // The full sweep needs more heap than the Node default.
      NODE_OPTIONS: process.env.NODE_OPTIONS ?? "--max-old-space-size=8192",
    },
  }
);

// vitest exits non-zero when tests fail, which is expected here; only a
// missing report means the run itself broke.
if (!fs.existsSync(reportPath)) {
  console.error("vitest did not produce a report; aborting.", run.error ?? "");
  process.exit(1);
}

const report = JSON.parse(fs.readFileSync(reportPath, "utf-8"));
const failingFiles = new Set(
  report.testResults
    .filter((tr) => tr.assertionResults.some((a) => a.status === "failed"))
    .map((tr) => path.resolve(tr.name))
);

// Locates the meta object (`const meta = {` or `export default {`) and, at
// its top level, the `tags:` and `title:` lines. Depth-tracking is textual;
// it relies on the stories' consistent 2-space formatting (biome-enforced).
function locateMeta(lines) {
  const start = lines.findIndex((l) =>
    /^(const meta(:.*)? = \{|export default \{)/.test(l)
  );
  if (start === -1) {
    return null;
  }
  let depth = 0;
  let tagsLine = null;
  let titleLine = null;
  for (let i = start; i < lines.length; i++) {
    const l = lines[i];
    if (depth === 1) {
      if (tagsLine === null && /^\s{2}tags: \[/.test(l)) {
        tagsLine = i;
      }
      if (titleLine === null && /^\s{2}title: /.test(l)) {
        titleLine = i;
      }
    }
    for (const ch of l) {
      if (ch === "{" || ch === "[") {
        depth++;
      } else if (ch === "}" || ch === "]") {
        depth--;
      }
    }
    if (depth === 0 && i > start) {
      break;
    }
  }
  return { tagsLine, titleLine };
}

const added = [];
const removed = [];
const manual = [];

for (const file of fs.readdirSync(storiesDir)) {
  if (!/\.stories\.tsx?$/.test(file)) {
    continue;
  }
  const filePath = path.join(storiesDir, file);
  const source = fs.readFileSync(filePath, "utf-8");
  const lines = source.split("\n");
  const meta = locateMeta(lines);
  if (!meta || (meta.tagsLine === null && meta.titleLine === null)) {
    manual.push(file);
    continue;
  }

  const shouldTag = failingFiles.has(filePath);
  const hasTag =
    meta.tagsLine !== null && lines[meta.tagsLine].includes(`"${TAG}"`);

  if (shouldTag && !hasTag) {
    if (meta.tagsLine !== null) {
      lines[meta.tagsLine] = lines[meta.tagsLine].replace(
        "tags: [",
        `tags: ["${TAG}", `
      );
    } else {
      lines.splice(meta.titleLine + 1, 0, `  tags: ["${TAG}"],`);
    }
    added.push(file);
  } else if (!shouldTag && hasTag) {
    const line = lines[meta.tagsLine];
    if (new RegExp(`^\\s{2}tags: \\["${TAG}"\\],?\\s*$`).test(line)) {
      // Tag was the only entry: drop the whole line.
      lines.splice(meta.tagsLine, 1);
    } else {
      lines[meta.tagsLine] = line
        .replace(`"${TAG}", `, "")
        .replace(`, "${TAG}"`, "");
    }
    removed.push(file);
  } else {
    continue;
  }
  fs.writeFileSync(filePath, lines.join("\n"));
}

console.log(
  `Components with a11y violations: ${failingFiles.size}. ` +
    `Tags added: ${added.length}, removed: ${removed.length}.`
);
for (const f of added) {
  console.log(`  + ${f}`);
}
for (const f of removed) {
  console.log(`  - ${f}`);
}
if (manual.length > 0) {
  console.log("Could not parse meta, update manually:", manual.join(", "));
}
console.log("Review the diff and commit it to update the sidebar badges.");
