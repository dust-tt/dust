import fs from "node:fs/promises";
import path from "node:path";
import { parseEnv } from "node:util";
import { fileURLToPath } from "node:url";

import {
  appendRunEvent, loadJsonl, parseArgs, pathExists, readJson, requireArg, writeJson,
} from "./lib.mjs";

const terminalStatuses = new Set(["succeeded", "failed", "cancelled", "gracefully_stopped"]);
const round = (value) => Math.round(value * 100) / 100;

export function parseConsumptionExport(body) {
  return body.split("\n").filter((line) => line.trim()).map((line) => {
    const row = JSON.parse(line);
    // Streaming failures can occur after the HTTP 200 headers were sent.
    if (row.error || !row.conversationId || !row.agentMessageId ||
        !["llm", "tool"].includes(row.consumptionType) ||
        !Number.isFinite(row.totalCredits) || !Number.isInteger(row.stepIndex)) {
      throw new Error("Incomplete or invalid consumption export; previous snapshot retained.");
    }
    return row;
  });
}

export function summarizeStepCosts(cell, conversation, rows) {
  const messages = (conversation.content ?? []).flat()
    .filter((message) => message.type === "agent_message");
  const original = messages.find((message) => !message.parentAgentMessageId);
  return {
    itemId: cell.packId,
    candidateId: cell.agentId,
    conversationId: cell.generatedConversationId,
    currentAttempt: cell.currentAttempt,
    cellStatus: cell.status,
    outputProduced: Boolean(cell.answerFile || cell.frameFileUrl),
    totalExportedCredits: round(rows.reduce((sum, row) => sum + row.totalCredits, 0)),
    // Unknown/delegated message rows remain in the raw export, not silently dropped.
    unmappedRowCount: rows.filter((row) => !messages.some((m) => m.sId === row.agentMessageId)).length,
    messages: messages.map((message) => {
      const messageRows = rows.filter((row) => row.agentMessageId === message.sId);
      const steps = new Map();
      for (const row of messageRows) {
        const step = steps.get(row.stepIndex) ?? {
          stepIndex: row.stepIndex, llmRows: 0, toolRows: 0, totalCredits: 0,
          llmCredits: 0, toolCredits: 0, toolExecutionSumMs: 0,
        };
        step.totalCredits += row.totalCredits;
        if (row.consumptionType === "llm") {
          step.llmRows += 1;
          step.llmCredits += row.totalCredits;
        } else {
          step.toolRows += 1;
          step.toolCredits += row.totalCredits;
          step.toolExecutionSumMs += row.executionTimeMs ?? 0;
        }
        steps.set(row.stepIndex, step);
      }
      const exportedCredits = round(messageRows.reduce((sum, row) => sum + row.totalCredits, 0));
      const expected = message.costCredits;
      const tolerance = messageRows.length * 0.005 + 0.000001;
      const reconciled = Number.isFinite(expected) && Math.abs(exportedCredits - expected) <= tolerance;
      return {
        agentMessageId: message.sId,
        phase: message.sId === original?.sId ? "generation" :
          message.parentAgentMessageId ? "subagent" : "followup",
        parentAgentMessageId: message.parentAgentMessageId ?? null,
        status: message.status,
        resolvedModel: message.resolvedModel ?? null,
        costCredits: expected ?? null,
        subAgentCostCredits: message.subAgentCostCredits ?? null,
        exportedCredits,
        reconciliation: !terminalStatuses.has(message.status) ? "in-progress" :
          messageRows.length === 0 ? "not-yet-exported" :
            !Number.isFinite(expected) ? "unknown-message-cost" :
              reconciled ? "matched" : "mismatch",
        differenceCredits: Number.isFinite(expected) ? round(exportedCredits - expected) : null,
        completionDurationMs: message.completionDurationMs ?? null,
        modelInteractionDurationMs: message.modelInteractionDurationMs ?? null,
        exportedStepCount: steps.size,
        toolCallCount: (message.actions ?? []).length,
        failedToolCallCount: (message.actions ?? []).filter((action) => ["errored", "failed"].includes(action.status)).length,
        steps: [...steps.values()].sort((a, b) => a.stepIndex - b.stepIndex).map((step) => ({
          ...step, totalCredits: round(step.totalCredits),
          llmCredits: round(step.llmCredits), toolCredits: round(step.toolCredits),
        })),
        tools: (message.actions ?? []).map((action) => ({
          actionId: action.sId, toolName: action.toolName ?? action.functionCallName,
          status: action.status, step: action.step,
          executionDurationMs: action.executionDurationMs ?? null,
        })),
      };
    }),
  };
}

export async function collectStepCosts({ runRoot, outRoot, apiKeyName, credentialFile, logPath }) {
  // Only the admin credential is read from this file. Generation and conversation
  // reads retain the original key; no secrets are written into snapshots or logs.
  let adminKey = process.env.DUST_ADMIN_ACCESS_KEY;
  if (!adminKey && credentialFile) {
    const credentials = parseEnv(await fs.readFile(credentialFile, "utf8"));
    adminKey = credentials.DUST_ADMIN_ACCESS_KEY;
  }
  const workspaceId = process.env.DUST_WORKSPACE_ID;
  const accessToken = process.env.DUST_ACCESS_TOKEN;
  if (!adminKey || !workspaceId || !accessToken || !apiKeyName) {
    throw new Error("Admin export key, regular Dust credentials, and generation API key name are required.");
  }
  const attempts = new Map();
  const resultsPath = path.join(runRoot, "results.jsonl");
  if (await pathExists(resultsPath)) {
    for (const cell of await loadJsonl(resultsPath)) {
      if (cell.generatedConversationId) attempts.set(cell.generatedConversationId, { ...cell, currentAttempt: false });
    }
  }
  const cellsRoot = path.join(runRoot, "cells");
  for (const item of await fs.readdir(cellsRoot, { withFileTypes: true })) {
    if (!item.isDirectory()) continue;
    for (const name of await fs.readdir(path.join(cellsRoot, item.name))) {
      if (!name.endsWith(".json")) continue;
      const cell = await readJson(path.join(cellsRoot, item.name, name));
      if (cell.generatedConversationId) attempts.set(cell.generatedConversationId, { ...cell, currentAttempt: !cell.invalidatedAt });
    }
  }
  if (!attempts.size) throw new Error("No eval conversations found.");
  const starts = [...attempts.values()].map((cell) => Date.parse(cell.startedAt));
  if (starts.some((value) => !Number.isFinite(value))) throw new Error("Missing attempt start time.");
  const start = Math.min(...starts);
  const end = Date.now();
  const apiRoot = `https://dust.tt/api/v1/w/${workspaceId}`;
  const rows = [];
  // Non-overlapping windows avoid double counting. Do not deduplicate equal rows:
  // two LLM calls within a step can legitimately have identical exported fields.
  for (let from = start; from < end; from += 10 * 60_000) {
    const response = await fetch(`${apiRoot}/analytics/consumption/export`, {
      method: "POST",
      headers: { Authorization: `Bearer ${adminKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        startDate: new Date(from).toISOString(),
        endDate: new Date(Math.min(end, from + 10 * 60_000)).toISOString(),
        format: "ndjson", filter: { api_keys: [apiKeyName] },
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`Consumption export HTTP ${response.status}; previous snapshot retained.`);
    for (const row of parseConsumptionExport(await response.text())) {
      if (!attempts.has(row.conversationId)) continue;
      const { userId, userName, userGroupIds, userGroupNames, ...retained } = row;
      rows.push(retained);
    }
  }
  const conversations = [];
  for (const cell of attempts.values()) {
    const response = await fetch(`${apiRoot}/assistant/conversations/${cell.generatedConversationId}`, {
      headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`Conversation audit HTTP ${response.status}; previous snapshot retained.`);
    const { conversation } = await response.json();
    conversations.push(summarizeStepCosts(cell, conversation,
      rows.filter((row) => row.conversationId === cell.generatedConversationId)));
  }
  const messages = conversations.flatMap((conversation) => conversation.messages);
  const summary = {
    collectedAt: new Date().toISOString(), exportStart: new Date(start).toISOString(),
    exportEndExclusive: new Date(end).toISOString(), apiKeyName,
    conversationCount: conversations.length, rowCount: rows.length,
    reconciliationCounts: Object.fromEntries([...new Set(messages.map((m) => m.reconciliation))]
      .map((state) => [state, messages.filter((m) => m.reconciliation === state).length])),
    notes: [
      "Snapshot: active runs and recently completed messages may not yet be indexed. Refresh after completion.",
      "totalCredits is reconciled billed cost. Gross component fields need not sum to totalCredits.",
      "Generation cost and latency exclude later followups such as Frame sharing requests.",
      "Exported LLM executionTimeMs=0 is not a latency measurement. Use message modelInteractionDurationMs.",
      "Tool execution times can overlap; their sum is not wall-clock latency.",
      "Only known eval conversation IDs under the generation API key are retained. Nested conversations are not traversed; subAgentCostCredits stays explicit.",
    ],
    conversations,
  };
  await fs.mkdir(outRoot, { recursive: true });
  // An API/parse/read failure above leaves the previous complete snapshot intact.
  await fs.writeFile(path.join(outRoot, "consumption-rows.private.jsonl"), rows.map((row) => JSON.stringify(row)).join("\n") + "\n");
  await writeJson(path.join(outRoot, "step-costs.private.json"), summary);
  await appendRunEvent(logPath, "step_costs_exported", {
    conversationCount: summary.conversationCount, rowCount: summary.rowCount,
    reconciliationCounts: summary.reconciliationCounts, outRoot,
  });
  return summary;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const args = parseArgs(process.argv.slice(2));
  collectStepCosts({
    runRoot: path.resolve(requireArg(args, "run")), outRoot: path.resolve(requireArg(args, "out")),
    apiKeyName: requireArg(args, "api-key-name"), credentialFile: args.credentials, logPath: args.log,
  }).then(({ conversationCount, rowCount, reconciliationCounts }) => {
    console.log(JSON.stringify({ conversationCount, rowCount, reconciliationCounts }));
  }).catch((error) => { console.error(error.message); process.exitCode = 1; });
}
