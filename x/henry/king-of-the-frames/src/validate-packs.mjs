import path from "node:path";

import {
  listPackIds,
  parseArgs,
  requireArg,
  stderr,
  stdout,
  validatePack,
} from "./lib.mjs";

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const packsRoot = path.resolve(requireArg(args, "packs"));
  const packIds = await listPackIds(packsRoot);
  if (packIds.length === 0) {
    throw new Error(`No packs found in ${packsRoot}`);
  }

  let errorCount = 0;
  for (const packId of packIds) {
    const result = await validatePack(packsRoot, packId);
    if (result.errors.length === 0) {
      stdout(`OK   ${packId} (${result.attachmentCount} attachments)`);
      continue;
    }
    errorCount += result.errors.length;
    stderr(`FAIL ${packId}`);
    for (const error of result.errors) {
      stderr(`  - ${error}`);
    }
  }

  if (errorCount > 0) {
    throw new Error(`${errorCount} pack validation error(s)`);
  }
  stdout(`Validated ${packIds.length} pack(s).`);
}

main().catch((error) => {
  stderr(error.stack ?? error.message);
  process.exitCode = 1;
});
