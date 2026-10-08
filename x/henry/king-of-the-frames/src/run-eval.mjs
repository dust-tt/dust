import { execFile as execFileCallback } from "node:child_process";
import fs from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { promisify } from "node:util";

import {
  appendJsonl,
  appendRunEvent,
  getOutputConfig,
  loadEvaluationItems,
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

const CONTENT_TYPES = new Map([
  [".csv", "text/csv"],
  [
    ".docx",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ],
  [".gif", "image/gif"],
  [".html", "text/html"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".json", "application/json"],
  [".md", "text/markdown"],
  [".pdf", "application/pdf"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".tsv", "text/tab-separated-values"],
  [".txt", "text/plain"],
  [".xls", "application/vnd.ms-excel"],
  [
    ".xlsx",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ],
  [".xml", "application/xml"],
]);

const execFile = promisify(execFileCallback);

function contentType(fileName) {
  return (
    CONTENT_TYPES.get(path.extname(fileName).toLowerCase()) ??
    "application/octet-stream"
  );
}

export function frameFileUrl(apiRoot, conversation) {
  for (const group of conversation.content ?? []) {
    if (!Array.isArray(group)) {
      continue;
    }
    for (const item of group) {
      if (item.type !== "agent_message" || !Array.isArray(item.actions)) {
        continue;
      }
      for (const action of item.actions) {
        for (const generatedFile of action.generatedFiles ?? []) {
          if (
            typeof generatedFile.contentType === "string" &&
            generatedFile.contentType.startsWith("application/vnd.dust.frame")
          ) {
            const fileId =
              generatedFile.fileId ?? generatedFile.sId ?? generatedFile.id;
            if (typeof fileId === "string" && fileId.length > 0) {
              return `${apiRoot}/files/${fileId}`;
            }
          }
        }
      }
    }
  }
  return null;
}

export function findAgentAnswer(conversation) {
  for (const group of [...(conversation.content ?? [])].reverse()) {
    if (!Array.isArray(group)) {
      continue;
    }
    for (const item of [...group].reverse()) {
      if (item.type === "agent_message") {
        return ["succeeded", "gracefully_stopped"].includes(item.status) &&
          typeof item.content === "string" &&
          item.content.trim().length > 0
          ? item.content
          : null;
      }
    }
  }
  return null;
}

function isTerminalStatus(status) {
  return [
    "succeeded",
    "failed",
    "cancelled",
    "interrupted",
    "gracefully_stopped",
  ].includes(status);
}

function finalStatus(conversation) {
  for (const group of [...(conversation.content ?? [])].reverse()) {
    if (!Array.isArray(group)) {
      continue;
    }
    for (const item of [...group].reverse()) {
      if (item.type === "agent_message") {
        return item.status ?? "unknown";
      }
    }
  }
  return "no-agent-message";
}

export function buildEvaluationJobs(items) {
  return items.flatMap((item) =>
    item.candidates.map((agent) => ({ item, agent })),
  );
}

export function buildConversationMessage({ agent, prompt, timezone = "UTC" }) {
  const executionAgentId = agent.agentId ?? agent.id;
  const mention = `:mention[${executionAgentId}]{sId=${executionAgentId}}`;
  return {
    content: `${mention} ${prompt}`,
    mentions: [{ configurationId: executionAgentId }],
    context: {
      username: "output-eval-runner",
      timezone,
      fullName: "Output Eval Runner",
      origin: "api",
    },
    ...(agent.modelSelection === undefined
      ? {}
      : { modelSelection: agent.modelSelection }),
  };
}

async function withRetry(operation, callback, maxAttempts = 5) {
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await callback();
    } catch (error) {
      lastError = error;
      const message = String(error?.message ?? error);
      const transient =
        /fetch failed|ECONNRESET|ETIMEDOUT|EAI_AGAIN|socket hang up|network|\b5\d\d\b/i.test(
          message,
        );
      if (!transient || attempt === maxAttempts) {
        throw error;
      }
      stderr(
        `${operation} failed, retrying (${attempt}/${maxAttempts}): ${message}`,
      );
      await sleep(3000 * attempt);
    }
  }
  throw lastError;
}

async function readDustCliAccessToken(maxAttempts = 5) {
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const { stdout } = await execFile("which", ["dust"], {
        timeout: 30_000,
      });
      const dustEntrypoint = await fs.realpath(stdout.trim());
      const requireFromDustCli = createRequire(dustEntrypoint);
      const keytar = requireFromDustCli("keytar");
      const accessToken = await keytar.getPassword("dust-cli", "access_token");
      if (!accessToken) {
        throw new Error("Dust CLI returned an empty access token");
      }
      return accessToken;
    } catch (error) {
      lastError = error;
      if (attempt === maxAttempts) {
        throw error;
      }
      await sleep(1000 * attempt);
    }
  }
  throw lastError;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const config = validateConfig(
    await readJson(path.resolve(requireArg(args, "config"))),
  );
  const outputConfig = getOutputConfig(config);
  const datasetPath =
    typeof args.dataset === "string" ? path.resolve(args.dataset) : undefined;
  const packsRoot =
    typeof args.packs === "string" ? path.resolve(args.packs) : undefined;
  const allItems = await loadEvaluationItems({
    config,
    datasetPath,
    packsRoot,
  });
  const outRoot = path.resolve(requireArg(args, "out"));
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

  const apiRoot = `${config.apiBaseUrl.replace(/\/$/, "")}/w/${workspaceId}`;
  const privateApiBaseUrl = config.apiBaseUrl.replace(/\/api\/v1\/?$/, "/api");
  const privateApiRoot = `${privateApiBaseUrl}/w/${workspaceId}`;
  const autoDenyAuthenticationForMcpServer = args["auto-deny-auth-mcp-server"];
  if (
    autoDenyAuthenticationForMcpServer !== undefined &&
    typeof autoDenyAuthenticationForMcpServer !== "string"
  ) {
    throw new Error("--auto-deny-auth-mcp-server must name an MCP server");
  }
  let cliRefreshPromise = null;
  const refreshDustCliToken = async () => {
    cliRefreshPromise ??= (async () => {
      await execFile("dust", ["status", "--no-update-check"], {
        timeout: 30_000,
      });
      accessToken = await readDustCliAccessToken();
      await appendRunEvent(logPath, "dust_cli_oauth_refreshed", {});
    })().finally(() => {
      cliRefreshPromise = null;
    });
    return cliRefreshPromise;
  };
  const headers = (extra = {}) => ({
    Authorization: `Bearer ${accessToken}`,
    ...extra,
  });
  const timeoutMs = Number(config.timeoutMs ?? 900_000);
  const pollIntervalMs = Number(config.pollIntervalMs ?? 4000);
  const concurrency = Number(args.concurrency ?? config.concurrency ?? 4);
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 32) {
    throw new Error("concurrency must be an integer from 1 to 32");
  }
  await appendRunEvent(logPath, "generation_run_started", {
    outputType: outputConfig.type,
    itemCount: allItems.length,
    concurrency,
  });

  const apiJson = async (method, endpoint, body, root = apiRoot) => {
    const request = () =>
      fetch(`${root}/${endpoint}`, {
        method,
        headers: headers({ "Content-Type": "application/json" }),
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    let response = await request();
    if (response.status === 401 && useDustCliAuth) {
      await refreshDustCliToken();
      response = await request();
    }
    if (!response.ok) {
      const responseBody = await response.text().catch(() => "");
      if (response.status === 401) {
        throw new Error(
          "Dust API returned 401. Refresh DUST_ACCESS_TOKEN and rerun; completed cells are preserved.",
        );
      }
      throw new Error(
        `${method} ${endpoint} returned ${response.status}: ${responseBody.slice(0, 300)}`,
      );
    }
    return response.json();
  };

  const uploadAttachment = async ({ filePath, name }) => {
    const body = await fs.readFile(filePath);
    const mimeType = contentType(name);
    const registration = await withRetry(`register ${name}`, () =>
      apiJson("POST", "files", {
        contentType: mimeType,
        fileName: name,
        fileSize: body.length,
        useCase: "conversation",
      }),
    );
    const file = registration.file ?? registration;
    const uploadUrl = file.uploadUrl;
    const fileId = file.sId ?? file.id;
    if (!uploadUrl || !fileId) {
      throw new Error(
        `File registration for ${name} omitted uploadUrl or file id`,
      );
    }
    await withRetry(`upload ${name}`, async () => {
      const form = new FormData();
      form.append("file", new Blob([body], { type: mimeType }), name);
      const response = await fetch(uploadUrl, {
        method: "POST",
        headers: headers(),
        body: form,
      });
      if (!response.ok) {
        throw new Error(`Signed upload returned ${response.status}`);
      }
    });
    return fileId;
  };

  const runCell = async ({ item, agent }) => {
    const packId = item.id;
    const cellPath = path.join(outRoot, "cells", packId, `${agent.id}.json`);
    const answerPath = path.join(outRoot, "answers", packId, `${agent.id}.md`);
    let prior = null;
    if (!args.force && (await pathExists(cellPath))) {
      prior = await readJson(cellPath);
      if (prior.creationUncertain) {
        throw new Error(
          "Conversation creation was ambiguous; reconcile the prior attempt before retrying.",
        );
      }
      if (
        !prior.invalidatedAt &&
        outputConfig.type === "frame" &&
        ["succeeded", "gracefully_stopped"].includes(prior.status) &&
        typeof prior.frameFileUrl === "string" &&
        prior.frameFileUrl.length > 0
      ) {
        await appendRunEvent(logPath, "generation_cell_skipped", {
          itemId: packId,
          candidateId: agent.id,
        });
        return { ...prior, skipped: true };
      }
      if (
        !prior.invalidatedAt &&
        outputConfig.type === "answer" &&
        typeof prior.answerFile === "string" &&
        prior.answerFile.length > 0 &&
        (await pathExists(path.resolve(outRoot, prior.answerFile)))
      ) {
        await appendRunEvent(logPath, "generation_cell_skipped", {
          itemId: packId,
          candidateId: agent.id,
        });
        return { ...prior, skipped: true };
      }
    }

    const resumableConversationId =
      !args.force &&
      !prior?.invalidatedAt &&
      typeof prior?.generatedConversationId === "string" &&
      prior.generatedConversationId.length > 0
        ? prior.generatedConversationId
        : null;
    const deniedAuthenticationActions = Array.isArray(
      prior?.deniedAuthenticationActions,
    )
      ? [...prior.deniedAuthenticationActions]
      : [];
    const deniedAuthenticationActionIds = new Set(
      deniedAuthenticationActions.map(({ actionId }) => actionId),
    );
    const contentFragments = [];
    if (!resumableConversationId) {
      for (const attachment of item.attachments) {
        contentFragments.push({
          title: attachment.name,
          fileId: await uploadAttachment(attachment),
        });
      }
    }

    const startedAt =
      prior && !prior.invalidatedAt
        ? (prior.startedAt ?? new Date().toISOString())
        : new Date().toISOString();
    let conversation;
    let generatedConversationId;
    if (resumableConversationId) {
      await appendRunEvent(logPath, "generation_cell_resumed", {
        itemId: packId,
        candidateId: agent.id,
        conversationId: resumableConversationId,
      });
      const response = await apiJson(
        "GET",
        `assistant/conversations/${resumableConversationId}`,
      );
      conversation = response.conversation;
      generatedConversationId = resumableConversationId;
    } else {
      await appendRunEvent(logPath, "generation_cell_started", {
        itemId: packId,
        candidateId: agent.id,
        executionAgentId: agent.agentId ?? agent.id,
        modelSelection: agent.modelSelection ?? null,
      });
      // Creation is not idempotent: never retry an ambiguous transport failure.
      const response = await apiJson("POST", "assistant/conversations", {
        title: `output-eval ${packId} ${agent.id}`,
        visibility: "unlisted",
        blocking: false,
        skipToolsValidation: true,
        message: buildConversationMessage({
          agent,
          prompt: item.prompt,
          timezone: config.timezone ?? "UTC",
        }),
        ...(contentFragments.length > 0 ? { contentFragments } : {}),
      });
      conversation = response.conversation;
      generatedConversationId = conversation.sId;
      await writeJson(cellPath, {
        packId,
        agentId: agent.id,
        executionAgentId: agent.agentId ?? agent.id,
        modelSelection: agent.modelSelection ?? null,
        generatedConversationId,
        outputType: outputConfig.type,
        status: finalStatus(conversation),
        startedAt,
        attachments: contentFragments.map(({ title }) => title),
        deniedAuthenticationActions,
      });
    }

    const denyConfiguredAuthenticationActions = async () => {
      if (!autoDenyAuthenticationForMcpServer) {
        return;
      }
      const response = await withRetry(
        `check blocked actions for ${packId}/${agent.id}`,
        () =>
          apiJson(
            "GET",
            `assistant/conversations/${generatedConversationId}/actions/blocked`,
            undefined,
            privateApiRoot,
          ),
      );
      const blockedActions = Array.isArray(response.blockedActions)
        ? response.blockedActions
        : [];
      for (const action of blockedActions) {
        if (
          action.status !== "blocked_authentication_required" ||
          action.metadata?.mcpServerId !== autoDenyAuthenticationForMcpServer ||
          deniedAuthenticationActionIds.has(action.actionId)
        ) {
          continue;
        }
        await withRetry(`deny authentication for ${packId}/${agent.id}`, () =>
          apiJson(
            "POST",
            `assistant/conversations/${generatedConversationId}/messages/${action.messageId}/resolve-authentication`,
            { actionId: action.actionId, outcome: "denied" },
            privateApiRoot,
          ),
        );
        const deniedAction = {
          actionId: action.actionId,
          messageId: action.messageId,
          mcpServerId: action.metadata.mcpServerId,
          toolName: action.metadata.toolName ?? null,
          deniedAt: new Date().toISOString(),
        };
        deniedAuthenticationActionIds.add(action.actionId);
        deniedAuthenticationActions.push(deniedAction);
        const persistedCell = await readJson(cellPath);
        await writeJson(cellPath, {
          ...persistedCell,
          deniedAuthenticationActions,
        });
        await appendRunEvent(logPath, "generation_authentication_denied", {
          itemId: packId,
          candidateId: agent.id,
          conversationId: generatedConversationId,
          ...deniedAction,
        });
      }
    };

    let generatedFrameFileUrl =
      outputConfig.type === "frame"
        ? frameFileUrl(apiRoot, conversation)
        : null;
    let answer =
      outputConfig.type === "answer" ? findAgentAnswer(conversation) : null;
    let status = finalStatus(conversation);
    const deadline = Date.now() + timeoutMs;
    while (!isTerminalStatus(status) && Date.now() < deadline) {
      await denyConfiguredAuthenticationActions();
      await sleep(pollIntervalMs);
      const poll = await apiJson(
        "GET",
        `assistant/conversations/${generatedConversationId}`,
      );
      conversation = poll.conversation;
      generatedFrameFileUrl =
        outputConfig.type === "frame"
          ? frameFileUrl(apiRoot, conversation)
          : null;
      answer =
        outputConfig.type === "answer" ? findAgentAnswer(conversation) : null;
      status = finalStatus(conversation);
    }

    if (!["succeeded", "gracefully_stopped"].includes(status)) {
      generatedFrameFileUrl = null;
      answer = null;
    }

    let answerFile = null;
    if (answer) {
      await fs.mkdir(path.dirname(answerPath), { recursive: true });
      await fs.writeFile(answerPath, answer);
      answerFile = path.relative(outRoot, answerPath).split(path.sep).join("/");
    }

    const result = {
      packId,
      agentId: agent.id,
      executionAgentId: agent.agentId ?? agent.id,
      modelSelection: agent.modelSelection ?? null,
      generatedConversationId,
      outputType: outputConfig.type,
      frameFileUrl: generatedFrameFileUrl,
      answerFile,
      status,
      startedAt,
      completedAt: new Date().toISOString(),
      attachments:
        prior?.attachments ?? contentFragments.map(({ title }) => title),
      deniedAuthenticationActions,
    };
    await writeJson(cellPath, result);
    await appendJsonl(path.join(outRoot, "results.jsonl"), result);
    await appendRunEvent(logPath, "generation_cell_completed", {
      itemId: packId,
      candidateId: agent.id,
      conversationId: generatedConversationId,
      status,
      outputProduced: Boolean(generatedFrameFileUrl || answerFile),
      startedAt,
      completedAt: result.completedAt,
    });
    return result;
  };

  const onlyItem = args["only-item"] ?? args["only-pack"];
  if (onlyItem !== undefined && typeof onlyItem !== "string") {
    throw new Error("--only-item must name a dataset item");
  }
  const items = onlyItem
    ? allItems.filter(({ id }) => id === onlyItem)
    : allItems;
  if (items.length === 0) {
    throw new Error(`Unknown item: ${onlyItem}`);
  }

  const onlyCandidate = args["only-candidate"];
  if (onlyCandidate !== undefined && typeof onlyCandidate !== "string") {
    throw new Error("--only-candidate must name a candidate");
  }
  const jobs = buildEvaluationJobs(items).filter(
    ({ agent }) => !onlyCandidate || agent.id === onlyCandidate,
  );
  if (jobs.length === 0) {
    throw new Error(`Unknown candidate for selected items: ${onlyCandidate}`);
  }
  stdout(
    `Running ${jobs.length} cell(s), ${items.length} item(s), concurrency ${concurrency}.`,
  );
  let cursor = 0;
  let completed = 0;
  let produced = 0;
  let stopRequested = false;
  const worker = async () => {
    while (cursor < jobs.length && !stopRequested) {
      const jobIndex = cursor;
      cursor += 1;
      const job = jobs[jobIndex];
      try {
        const result = await runCell(job);
        completed += 1;
        const hasOutput =
          outputConfig.type === "frame"
            ? Boolean(result.frameFileUrl)
            : Boolean(result.answerFile);
        if (hasOutput) {
          produced += 1;
        }
        const outcome = hasOutput ? "OUTPUT" : "NO OUTPUT";
        const skipped = result.skipped ? " (skipped)" : "";
        stdout(
          `[${completed}/${jobs.length}] ${outcome} ${job.item.id}/${job.agent.id}${skipped}`,
        );
      } catch (error) {
        completed += 1;
        const cellPath = path.join(
          outRoot,
          "cells",
          job.item.id,
          `${job.agent.id}.json`,
        );
        const partial = (await pathExists(cellPath))
          ? await readJson(cellPath)
          : {};
        const failure = {
          packId: job.item.id,
          agentId: job.agent.id,
          executionAgentId: job.agent.agentId ?? job.agent.id,
          modelSelection: job.agent.modelSelection ?? null,
          ...(typeof partial.generatedConversationId === "string"
            ? { generatedConversationId: partial.generatedConversationId }
            : {}),
          ...(typeof partial.outputType === "string"
            ? { outputType: partial.outputType }
            : {}),
          ...(typeof partial.startedAt === "string"
            ? { startedAt: partial.startedAt }
            : {}),
          ...(Array.isArray(partial.attachments)
            ? { attachments: partial.attachments }
            : {}),
          ...(Array.isArray(partial.deniedAuthenticationActions)
            ? {
                deniedAuthenticationActions:
                  partial.deniedAuthenticationActions,
              }
            : {}),
          error: String(error?.message ?? error),
          creationUncertain:
            Boolean(partial.creationUncertain) ||
            (!partial.generatedConversationId &&
              /fetch failed|ECONNRESET|ETIMEDOUT|EAI_AGAIN|socket hang up|network|\b5\d\d\b/i.test(
                String(error?.message ?? error),
              )),
          completedAt: new Date().toISOString(),
        };
        await writeJson(cellPath, failure);
        await appendJsonl(path.join(outRoot, "results.jsonl"), failure);
        await appendRunEvent(logPath, "generation_cell_failed", {
          itemId: job.item.id,
          candidateId: job.agent.id,
          error: failure.error,
          completedAt: failure.completedAt,
        });
        stderr(
          `[${completed}/${jobs.length}] ERROR ${job.item.id}/${job.agent.id}: ${failure.error}`,
        );
        if (
          failure.creationUncertain ||
          failure.error.includes("Dust API returned 401")
        ) {
          stopRequested = true;
        }
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(concurrency, jobs.length) }, () => worker()),
  );
  if (outputConfig.type === "answer") {
    const outputIndex = {};
    for (const item of allItems) {
      for (const agent of item.candidates) {
        const cellPath = path.join(
          outRoot,
          "cells",
          item.id,
          `${agent.id}.json`,
        );
        if (!(await pathExists(cellPath))) {
          continue;
        }
        const cell = await readJson(cellPath);
        if (
          !cell.invalidatedAt &&
          typeof cell.answerFile === "string" &&
          cell.answerFile.length > 0 &&
          (await pathExists(path.resolve(outRoot, cell.answerFile)))
        ) {
          outputIndex[item.id] ??= {};
          outputIndex[item.id][agent.id] = cell.answerFile;
        }
      }
    }
    const outputIndexPath = path.join(outRoot, "output-index.json");
    await writeJson(outputIndexPath, outputIndex);
    stdout(`Answer index: ${outputIndexPath}`);
  }
  stdout(`Done. ${produced}/${jobs.length} cells have a reviewable output.`);
  await appendRunEvent(logPath, "generation_run_completed", {
    jobCount: jobs.length,
    completedCount: completed,
    outputCount: produced,
  });
  if (produced < jobs.length) {
    stdout(
      "Refresh credentials if needed and rerun the same command to retry unfinished cells once.",
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
