import fs from "node:fs/promises";
import path from "node:path";

import {
  parseArgs,
  pathExists,
  readJson,
  requireArg,
  sleep,
  stderr,
  stdout,
  validateConfig,
  writeJson,
} from "./lib.mjs";

function actionOutputText(action) {
  return (action.output ?? [])
    .filter((item) => item?.type === "text" && typeof item.text === "string")
    .map((item) => item.text)
    .join("\n")
    .slice(0, 1000);
}

function isSlackAction(action) {
  return (
    action.internalMCPServerName === "slack" ||
    action.functionCallName?.startsWith("slack__") ||
    action.metadata?.mcpServerId === "ims_5sAaeQCZj7nNor"
  );
}

function failedSlackActions(conversation, allowedDeniedActionIds) {
  return (conversation.content ?? [])
    .flatMap((group) => (Array.isArray(group) ? group : []))
    .filter((item) => item.type === "agent_message")
    .flatMap((message) =>
      (message.actions ?? [])
        .filter(
          (action) =>
            isSlackAction(action) &&
            action.status !== "succeeded" &&
            !(
              action.status === "denied" &&
              allowedDeniedActionIds.has(action.sId)
            ),
        )
        .map((action) => ({
          messageId: message.sId ?? null,
          actionId: action.sId ?? null,
          status: action.status ?? "unknown",
          functionCallName: action.functionCallName ?? null,
          toolName: action.toolName ?? null,
          error: actionOutputText(action),
        })),
    );
}

async function currentOutputCells(runRoot) {
  const cellsRoot = path.join(runRoot, "cells");
  const itemNames = await fs.readdir(cellsRoot);
  const cells = [];
  for (const itemName of itemNames.sort()) {
    const itemRoot = path.join(cellsRoot, itemName);
    const entries = await fs.readdir(itemRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) {
        continue;
      }
      const cell = await readJson(path.join(itemRoot, entry.name));
      if (
        cell.invalidatedAt ||
        typeof cell.generatedConversationId !== "string" ||
        typeof cell.answerFile !== "string" ||
        !(await pathExists(path.resolve(runRoot, cell.answerFile)))
      ) {
        continue;
      }
      cells.push(cell);
    }
  }
  return cells;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const config = validateConfig(
    await readJson(path.resolve(requireArg(args, "config"))),
  );
  const runRoot = path.resolve(requireArg(args, "run"));
  const outPath = path.resolve(requireArg(args, "out"));
  const workspaceId = process.env.DUST_WORKSPACE_ID;
  const accessToken = process.env.DUST_ACCESS_TOKEN;
  if (!workspaceId || !accessToken) {
    throw new Error(
      "DUST_WORKSPACE_ID and DUST_ACCESS_TOKEN must be set in the shell",
    );
  }

  const apiRoot = `${config.apiBaseUrl.replace(/\/$/, "")}/w/${workspaceId}`;
  const onlyItem = args["only-item"];
  if (onlyItem !== undefined && typeof onlyItem !== "string") {
    throw new Error("--only-item must name a dataset item");
  }
  const cells = (await currentOutputCells(runRoot)).filter(
    (cell) => !onlyItem || cell.packId === onlyItem,
  );
  const invalidCells = [];
  for (let index = 0; index < cells.length; index += 1) {
    const cell = cells[index];
    const response = await fetch(
      `${apiRoot}/assistant/conversations/${cell.generatedConversationId}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(
        `Conversation ${cell.generatedConversationId} returned ${response.status}: ${body.slice(0, 300)}`,
      );
    }
    const { conversation } = await response.json();
    const allowedDeniedActionIds = new Set(
      Array.isArray(cell.deniedAuthenticationActions)
        ? cell.deniedAuthenticationActions.map(({ actionId }) => actionId)
        : [],
    );
    const failures = failedSlackActions(
      conversation,
      allowedDeniedActionIds,
    );
    if (failures.length > 0) {
      invalidCells.push({
        packId: cell.packId,
        agentId: cell.agentId,
        conversationId: cell.generatedConversationId,
        answerFile: cell.answerFile,
        failures,
      });
    }
    stdout(`Audited ${index + 1}/${cells.length}: ${cell.packId}/${cell.agentId}.`);
    if (index + 1 < cells.length) {
      await sleep(100);
    }
  }

  await writeJson(outPath, {
    auditedAt: new Date().toISOString(),
    outputConversationCount: cells.length,
    invalidCellCount: invalidCells.length,
    invalidCells,
  });
  stdout(`Found ${invalidCells.length} output conversation(s) with Slack failures.`);
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
