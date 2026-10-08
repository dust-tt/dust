import path from "node:path";

import {
  loadDatasetItems,
  parseArgs,
  requireArg,
  stderr,
  stdout,
} from "./lib.mjs";

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const datasetPath = path.resolve(requireArg(args, "dataset"));
  const items = await loadDatasetItems(datasetPath);
  for (const item of items) {
    const counts =
      `${item.candidates.length} candidates, ` +
      `${item.attachments.length} attachments`;
    stdout(`OK   ${item.id} (${counts})`);
  }
  stdout(`Validated ${items.length} dataset item(s).`);
}

main().catch((error) => {
  stderr(error.stack ?? error.message);
  process.exitCode = 1;
});
