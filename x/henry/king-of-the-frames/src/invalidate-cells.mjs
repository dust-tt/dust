import fs from "node:fs/promises";
import path from "node:path";

import {
  appendJsonl,
  appendRunEvent,
  parseArgs,
  pathExists,
  readJson,
  requireArg,
  stderr,
  stdout,
  writeJson,
} from "./lib.mjs";

async function buildMissingOutputAudit(runRoot) {
  const cellsRoot = path.join(runRoot, "cells");
  const invalidCells = [];
  for (const packEntry of await fs.readdir(cellsRoot, {
    withFileTypes: true,
  })) {
    if (!packEntry.isDirectory()) {
      continue;
    }
    const packRoot = path.join(cellsRoot, packEntry.name);
    for (const cellEntry of await fs.readdir(packRoot, {
      withFileTypes: true,
    })) {
      if (!cellEntry.isFile() || path.extname(cellEntry.name) !== ".json") {
        continue;
      }
      const cell = await readJson(path.join(packRoot, cellEntry.name));
      const hasOutput =
        cell.outputType === "frame"
          ? typeof cell.frameShareUrl === "string" &&
            cell.frameShareUrl.length > 0
          : typeof cell.answerFile === "string" && cell.answerFile.length > 0;
      if (!hasOutput && !cell.invalidatedAt) {
        invalidCells.push({
          packId: cell.packId,
          agentId: cell.agentId,
          conversationId: cell.generatedConversationId,
        });
      }
    }
  }
  return { invalidCells, reason: "missing_output_retry" };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const runRoot = path.resolve(requireArg(args, "run"));
  const audit =
    typeof args.audit === "string"
      ? await readJson(path.resolve(args.audit))
      : args["without-output"] === true
        ? await buildMissingOutputAudit(runRoot)
        : (() => {
            throw new Error("Set either --audit or --without-output");
          })();
  const logPath =
    typeof args.log === "string" ? path.resolve(args.log) : undefined;
  const invalidatedAt = new Date().toISOString();
  const invalidReason =
    typeof args.reason === "string"
      ? args.reason
      : (audit.reason ?? "failed_slack_action");
  let invalidatedCount = 0;
  let staleCount = 0;

  for (const invalidCell of audit.invalidCells) {
    const cellPath = path.join(
      runRoot,
      "cells",
      invalidCell.packId,
      `${invalidCell.agentId}.json`,
    );
    if (!(await pathExists(cellPath))) {
      staleCount += 1;
      continue;
    }
    const cell = await readJson(cellPath);
    if (cell.generatedConversationId !== invalidCell.conversationId) {
      staleCount += 1;
      continue;
    }
    await appendJsonl(
      path.join(runRoot, "invalidated-attempts.private.jsonl"),
      {
        ...cell,
        invalidatedAt,
        invalidReason,
      },
    );
    await writeJson(cellPath, {
      ...cell,
      invalidatedAt,
      invalidReason,
    });
    await appendRunEvent(logPath, "generation_cell_invalidated", {
      itemId: invalidCell.packId,
      candidateId: invalidCell.agentId,
      conversationId: invalidCell.conversationId,
      reason: invalidReason,
    });
    invalidatedCount += 1;
    stdout(`Invalidated ${invalidCell.packId}/${invalidCell.agentId}.`);
  }

  stdout(
    `Invalidated ${invalidatedCount} cell(s); ${staleCount} audit record(s) no longer matched the current cell.`,
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
