import path from "node:path";

import {
  loadEvaluationItems,
  parseArgs,
  pathExists,
  readJson,
  requireArg,
  stderr,
  stdout,
  validateConfig,
  writeJson,
} from "./lib.mjs";

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const config = validateConfig(
    await readJson(path.resolve(requireArg(args, "config"))),
  );
  const datasetPath =
    typeof args.dataset === "string" ? path.resolve(args.dataset) : undefined;
  const packsRoot =
    typeof args.packs === "string" ? path.resolve(args.packs) : undefined;
  const items = await loadEvaluationItems({ config, datasetPath, packsRoot });
  const runRoot = path.resolve(requireArg(args, "run"));
  const outputIndex = {};

  for (const item of items) {
    for (const candidate of item.candidates) {
      const cellPath = path.join(
        runRoot,
        "cells",
        item.id,
        `${candidate.id}.json`,
      );
      if (!(await pathExists(cellPath))) {
        continue;
      }
      const cell = await readJson(cellPath);
      if (cell.invalidatedAt) {
        continue;
      }
      let output = null;
      if (
        typeof cell.answerFile === "string" &&
        cell.answerFile.length > 0 &&
        (await pathExists(path.resolve(runRoot, cell.answerFile)))
      ) {
        output = cell.answerFile;
      } else if (
        typeof cell.frameShareUrl === "string" &&
        cell.frameShareUrl.length > 0
      ) {
        output = cell.frameShareUrl;
      }
      if (output) {
        outputIndex[item.id] ??= {};
        outputIndex[item.id][candidate.id] = output;
      }
    }
  }

  const outputIndexPath = path.join(runRoot, "output-index.json");
  await writeJson(outputIndexPath, outputIndex);
  const outputCount = Object.values(outputIndex).reduce(
    (count, candidates) => count + Object.keys(candidates).length,
    0,
  );
  stdout(
    `Indexed ${outputCount} output(s) across ${Object.keys(outputIndex).length} item(s): ${outputIndexPath}`,
  );
}

const isMain =
  process.argv[1] &&
  import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isMain) {
  main().catch((error) => {
    stderr(error.stack ?? error.message);
    process.exitCode = 1;
  });
}
