import fs from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import { collectStepCosts } from "./collect-step-costs.mjs";

import {
  appendRunEvent,
  loadJsonl,
  mean,
  parseArgs,
  pathExists,
  percentile,
  readJson,
  requireArg,
  sleep,
  stderr,
  stdout,
  validateConfig,
  writeJson,
} from "./lib.mjs";

const execFile = promisify(execFileCallback);

function terminalAgentMessages(conversation) {
  return (conversation.content ?? [])
    .flatMap((group) => (Array.isArray(group) ? group : []))
    .filter((item) => item.type === "agent_message")
    .map((message) => ({
      messageId: message.sId ?? null,
      parentAgentMessageId: message.parentAgentMessageId ?? null,
      status: message.status ?? "unknown",
      completionDurationMs: message.completionDurationMs ?? null,
      modelInteractionDurationMs: message.modelInteractionDurationMs ?? null,
      costCredits: message.costCredits ?? null,
      subAgentCostCredits: message.subAgentCostCredits ?? null,
      configurationId: message.configuration?.sId ?? null,
      resolvedModel: message.resolvedModel ?? null,
      modelResolutionMethod: message.modelResolutionMethod ?? null,
      actions: (message.actions ?? []).map((action) => ({
        actionId: action.sId ?? null,
        internalMCPServerName: action.internalMCPServerName ?? null,
        toolName: action.toolName ?? action.functionCallName ?? null,
        functionCallName: action.functionCallName ?? null,
        status: action.status ?? "unknown",
        step: action.step ?? null,
        executionDurationMs: action.executionDurationMs ?? null,
      })),
      citations: Object.values(message.citations ?? {}).map((citation) => ({
        title: citation.title ?? "",
        provider: citation.provider ?? "",
        href: citation.href ?? null,
        description: citation.description ?? null,
      })),
    }));
}

export function summarizeConversationAudit(cell, conversation, consumption) {
  const startedMs = Date.parse(cell.startedAt);
  const completedAt = cell.completedAt ?? cell.discardedAt ?? null;
  const completedMs = Date.parse(completedAt);
  return {
    itemId: cell.packId,
    candidateId: cell.agentId,
    executionAgentId: cell.executionAgentId ?? cell.agentId,
    expectedModelSelection: cell.modelSelection ?? null,
    conversationId: cell.generatedConversationId,
    status: cell.status,
    outputProduced: Boolean(cell.answerFile || cell.frameFileUrl),
    attemptDisposition: cell.attemptDisposition ?? "reviewable",
    discardReason: cell.discardReason ?? null,
    sources: cell.sources ?? [],
    startedAt: cell.startedAt,
    completedAt,
    latencyMs:
      Number.isFinite(startedMs) &&
      Number.isFinite(completedMs) &&
      completedMs >= startedMs
        ? completedMs - startedMs
        : null,
    messages: terminalAgentMessages(conversation),
    consumption,
  };
}

function conversationConsumptionFallback(messages) {
  const rootMessages = messages.filter(
    ({ parentAgentMessageId }) => !parentAgentMessageId,
  );
  const billedCredits = rootMessages.reduce(
    (sum, message) =>
      sum +
      Number(message.costCredits ?? 0) +
      Number(message.subAgentCostCredits ?? 0),
    0,
  );
  const toolCounts = new Map();
  for (const message of messages) {
    for (const action of message.actions) {
      const tool = `${action.internalMCPServerName ?? "unknown"}__${action.toolName ?? action.functionCallName ?? "unknown"}`;
      toolCounts.set(tool, (toolCounts.get(tool) ?? 0) + 1);
    }
  }
  return {
    billedCredits,
    details: {
      tools: [...toolCounts.entries()].map(([tool, callCount]) => ({
        tool,
        callCount,
      })),
    },
    source: "conversation_message_fallback",
  };
}

function withoutUndefinedValues(record) {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined),
  );
}

function addAttempt(attempts, record, source) {
  const conversationId =
    record.generatedConversationId ?? record.conversationId;
  if (typeof conversationId !== "string" || conversationId.length === 0) {
    return;
  }
  const prior = attempts.get(conversationId) ?? { sources: [] };
  attempts.set(conversationId, {
    ...prior,
    ...withoutUndefinedValues(record),
    generatedConversationId: conversationId,
    sources: [...new Set([...(prior.sources ?? []), source])],
  });
}

export function classifyRunAttempts({
  currentCells,
  results,
  invalidAttempts = [],
  slackFailures = [],
}) {
  const attempts = new Map();
  for (const result of results) {
    addAttempt(attempts, result, "results");
  }
  for (const attempt of invalidAttempts) {
    addAttempt(
      attempts,
      {
        ...attempt,
        status: "discarded",
        completedAt: attempt.completedAt ?? attempt.discardedAt,
        discardReason: attempt.reason ?? "invalid_attempt",
      },
      "invalid_attempts",
    );
  }
  for (const failure of slackFailures) {
    addAttempt(
      attempts,
      {
        ...failure,
        status: "discarded",
        discardReason: "failed_slack_action",
      },
      "slack_failures",
    );
  }
  for (const cell of currentCells) {
    addAttempt(
      attempts,
      {
        ...cell,
        ...(cell.invalidatedAt
          ? {
              status: "discarded",
              completedAt: cell.completedAt ?? cell.invalidatedAt,
              discardReason: cell.invalidReason ?? "invalidated_cell",
            }
          : {}),
      },
      "current_cell",
    );
  }

  const reviewable = currentCells
    .filter(
      (cell) =>
        !cell.invalidatedAt &&
        cell.outputPresent === true &&
        typeof cell.generatedConversationId === "string",
    )
    .map((cell) => ({
      ...cell,
      attemptDisposition: "reviewable",
      sources: attempts.get(cell.generatedConversationId)?.sources ?? [
        "current_cell",
      ],
    }));
  const reviewableIds = new Set(
    reviewable.map(({ generatedConversationId }) => generatedConversationId),
  );
  const discarded = [...attempts.values()]
    .filter(
      ({ generatedConversationId }) =>
        !reviewableIds.has(generatedConversationId),
    )
    .map((attempt) => ({
      ...attempt,
      status: attempt.status ?? "discarded",
      attemptDisposition: "discarded",
      discardReason: attempt.discardReason ?? "superseded_attempt",
    }));

  return { reviewable, discarded };
}

export function summarizeAuditRecords(records) {
  const latencies = records
    .map(({ latencyMs }) => latencyMs)
    .filter((value) => Number.isFinite(value) && value >= 0);
  const billedCredits = records.reduce(
    (sum, record) => sum + Number(record.consumption?.billedCredits ?? 0),
    0,
  );
  return {
    conversationCount: records.length,
    outputCount: records.filter(({ outputProduced }) => outputProduced).length,
    billedCredits,
    latencyMs: {
      measuredCount: latencies.length,
      total: latencies.reduce((sum, value) => sum + value, 0),
      mean: latencies.length > 0 ? mean(latencies) : null,
      median: latencies.length > 0 ? percentile(latencies, 0.5) : null,
      p90: latencies.length > 0 ? percentile(latencies, 0.9) : null,
    },
  };
}

async function loadCurrentCells(runRoot) {
  const cellsRoot = path.join(runRoot, "cells");
  if (!(await pathExists(cellsRoot))) {
    return [];
  }
  const cells = [];
  const itemEntries = await fs.readdir(cellsRoot, { withFileTypes: true });
  for (const itemEntry of itemEntries) {
    if (!itemEntry.isDirectory()) {
      continue;
    }
    const itemRoot = path.join(cellsRoot, itemEntry.name);
    const cellEntries = await fs.readdir(itemRoot, { withFileTypes: true });
    for (const cellEntry of cellEntries) {
      if (!cellEntry.isFile() || path.extname(cellEntry.name) !== ".json") {
        continue;
      }
      const cell = await readJson(path.join(itemRoot, cellEntry.name));
      const answerPresent =
        typeof cell.answerFile === "string" &&
        cell.answerFile.length > 0 &&
        (await pathExists(path.resolve(runRoot, cell.answerFile)));
      cells.push({
        ...cell,
        outputPresent: answerPresent || Boolean(cell.frameFileUrl),
      });
    }
  }
  return cells;
}

async function readJsonArrayIfPresent(filePath, key) {
  if (!(await pathExists(filePath))) {
    return [];
  }
  const value = await readJson(filePath);
  return Array.isArray(value?.[key]) ? value[key] : [];
}

async function readDustCliAccessToken() {
  const { stdout: dustPath } = await execFile("which", ["dust"], {
    timeout: 30_000,
  });
  const dustEntrypoint = await fs.realpath(dustPath.trim());
  const keytar = createRequire(dustEntrypoint)("keytar");
  const accessToken = await keytar.getPassword("dust-cli", "access_token");
  if (!accessToken) {
    throw new Error("Dust CLI returned an empty access token");
  }
  return accessToken;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const configPath = path.resolve(requireArg(args, "config"));
  const config = validateConfig(
    await readJson(configPath),
  );
  const runRoot = path.resolve(requireArg(args, "run"));
  const outPath = path.resolve(requireArg(args, "out"));
  const logPath =
    typeof args.log === "string" ? path.resolve(args.log) : undefined;
  const workspaceId = process.env.DUST_WORKSPACE_ID;
  let accessToken = process.env.DUST_ACCESS_TOKEN;
  const useDustCliAuth = process.env.DUST_CLI_AUTH === "1";
  if (!workspaceId || (!accessToken && !useDustCliAuth)) {
    throw new Error(
      "DUST_WORKSPACE_ID and either DUST_ACCESS_TOKEN or DUST_CLI_AUTH=1 must be set in the shell",
    );
  }
  if (!accessToken) {
    accessToken = await readDustCliAccessToken();
  }
  const currentCells = await loadCurrentCells(runRoot);
  const resultsPath = path.join(runRoot, "results.jsonl");
  const results = (await pathExists(resultsPath))
    ? await loadJsonl(resultsPath)
    : [];
  const invalidAttempts = await readJsonArrayIfPresent(
    path.join(runRoot, "invalid-attempts.private.json"),
    "attempts",
  );
  const slackFailures = await readJsonArrayIfPresent(
    path.join(runRoot, "slack-failures.private.json"),
    "invalidCells",
  );
  const attempts = classifyRunAttempts({
    currentCells,
    results,
    invalidAttempts,
    slackFailures,
  });
  const publicApiRoot = `${config.apiBaseUrl.replace(/\/$/, "")}/w/${workspaceId}`;
  const privateApiBaseUrl = config.apiBaseUrl.replace(/\/api\/v1\/?$/, "/api");
  const privateApiRoot = `${privateApiBaseUrl}/w/${workspaceId}`;
  const apiJson = async (endpoint, root = publicApiRoot) => {
    const request = () =>
      fetch(`${root}/${endpoint}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
    let response = await request();
    if (response.status === 401 && useDustCliAuth) {
      await execFile("dust", ["status", "--no-update-check"], {
        timeout: 30_000,
      });
      accessToken = await readDustCliAccessToken();
      response = await request();
    }
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(
        `GET ${endpoint} returned ${response.status}: ${body.slice(0, 300)}`,
      );
    }
    return response.json();
  };

  const allAttempts = [...attempts.reviewable, ...attempts.discarded];
  await appendRunEvent(logPath, "run_audit_collection_started", {
    conversationCount: allAttempts.length,
    reviewableConversationCount: attempts.reviewable.length,
    discardedConversationCount: attempts.discarded.length,
  });
  const allRecords = [];
  for (let index = 0; index < allAttempts.length; index += 1) {
    const cell = allAttempts[index];
    const conversationId = cell.generatedConversationId;
    const [conversationResponse, consumptionResponse] = await Promise.all([
      apiJson(`assistant/conversations/${conversationId}`),
      apiJson(
        `assistant/conversations/${conversationId}/consumption`,
        privateApiRoot,
      ).catch((error) => {
        const message = String(error.message);
        if (
          message.includes("feature_flag_not_found") ||
          (message.includes("returned 401") &&
            message.includes("not_authenticated"))
        ) {
          return null;
        }
        throw error;
      }),
    ]);
    const messages = terminalAgentMessages(conversationResponse.conversation);
    const consumption =
      consumptionResponse ?? conversationConsumptionFallback(messages);
    allRecords.push(
      summarizeConversationAudit(
        cell,
        conversationResponse.conversation,
        consumption,
      ),
    );
    stdout(
      `Collected ${index + 1}/${allAttempts.length}: ${cell.packId}/${cell.agentId} (${cell.attemptDisposition}).`,
    );
    if (index + 1 < allAttempts.length) {
      await sleep(150);
    }
  }
  const records = allRecords.filter(
    ({ attemptDisposition }) => attemptDisposition === "reviewable",
  );
  const discardedRecords = allRecords.filter(
    ({ attemptDisposition }) => attemptDisposition === "discarded",
  );
  const modelMismatches = records
    .filter(({ expectedModelSelection, executionAgentId, messages }) => {
      const rootMessage =
        messages.find(
          ({ configurationId, resolvedModel }) =>
            resolvedModel && configurationId === executionAgentId,
        ) ?? messages.find(({ resolvedModel }) => resolvedModel);
      const actual = rootMessage?.resolvedModel;
      return (
        expectedModelSelection &&
        (!actual ||
          actual.providerId !== expectedModelSelection.providerId ||
          actual.modelId !== expectedModelSelection.modelId ||
          actual.reasoningEffort !== expectedModelSelection.reasoningEffort)
      );
    })
    .map(({ itemId, candidateId }) => ({ itemId, candidateId }));
  await writeJson(outPath, {
    collectedAt: new Date().toISOString(),
    modelMismatches,
    summary: {
      reviewable: summarizeAuditRecords(records),
      discarded: summarizeAuditRecords(discardedRecords),
      combined: summarizeAuditRecords(allRecords),
    },
    records,
    discardedRecords,
  });
  await appendRunEvent(logPath, "run_audit_collection_completed", {
    conversationCount: records.length,
    discardedConversationCount: discardedRecords.length,
    modelMismatchCount: modelMismatches.length,
  });
  if (config.detailedConsumption) {
    const settings = config.detailedConsumption;
    await collectStepCosts({
      runRoot,
      outRoot: path.resolve(path.dirname(configPath), settings.outputDirectory),
      apiKeyName: settings.apiKeyName,
      credentialFile: settings.credentialFile
        ? path.resolve(path.dirname(configPath), settings.credentialFile)
        : undefined,
      logPath,
    });
  }
  if (modelMismatches.length > 0) {
    stderr(
      `WARN: ${modelMismatches.length} output(s) used an unexpected model selection.`,
    );
  }
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
