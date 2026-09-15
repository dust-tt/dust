import fs from "node:fs/promises";
import path from "node:path";

import {
  appendJsonl,
  collectPackAttachments,
  listPackIds,
  parseArgs,
  pathExists,
  readJson,
  requireArg,
  sleep,
  stderr,
  stdout,
  validateConfig,
  validatePack,
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

function contentType(fileName) {
  return (
    CONTENT_TYPES.get(path.extname(fileName).toLowerCase()) ??
    "application/octet-stream"
  );
}

function frameFileUrl(apiRoot, conversation) {
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
            return `${apiRoot}/files/${fileId}`;
          }
        }
      }
    }
  }
  return null;
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

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const config = validateConfig(
    await readJson(path.resolve(requireArg(args, "config"))),
  );
  const packsRoot = path.resolve(requireArg(args, "packs"));
  const outRoot = path.resolve(requireArg(args, "out"));
  const workspaceId = process.env.DUST_WORKSPACE_ID;
  const accessToken = process.env.DUST_ACCESS_TOKEN;
  if (!workspaceId || !accessToken) {
    throw new Error(
      "DUST_WORKSPACE_ID and DUST_ACCESS_TOKEN must be set in the shell",
    );
  }

  const apiRoot = `${config.apiBaseUrl.replace(/\/$/, "")}/w/${workspaceId}`;
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

  const apiJson = async (method, endpoint, body) => {
    const response = await fetch(`${apiRoot}/${endpoint}`, {
      method,
      headers: headers({ "Content-Type": "application/json" }),
      body: body === undefined ? undefined : JSON.stringify(body),
    });
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

  const runCell = async ({ packId, agent }) => {
    const cellPath = path.join(outRoot, "cells", packId, `${agent.id}.json`);
    if (!args.force && (await pathExists(cellPath))) {
      const prior = await readJson(cellPath);
      if (
        typeof prior.frameFileUrl === "string" &&
        prior.frameFileUrl.length > 0
      ) {
        return { ...prior, skipped: true };
      }
    }

    const packDir = path.join(packsRoot, packId);
    const brief = (
      await fs.readFile(path.join(packDir, "brief.md"), "utf8")
    ).trim();
    const attachments = await collectPackAttachments(packDir);
    const contentFragments = [];
    for (const attachment of attachments) {
      contentFragments.push({
        title: attachment.name,
        fileId: await uploadAttachment(attachment),
      });
    }

    const mention = `:mention[${agent.id}]{sId=${agent.id}}`;
    const response = await withRetry(`create ${packId}/${agent.id}`, () =>
      apiJson("POST", "assistant/conversations", {
        title: `frame-eval ${packId} ${agent.id}`,
        visibility: "unlisted",
        blocking: false,
        skipToolsValidation: true,
        message: {
          content: `${mention} ${brief}`,
          mentions: [{ configurationId: agent.id }],
          context: {
            username: "frame-eval-runner",
            timezone: config.timezone ?? "UTC",
            fullName: "Frame Eval Runner",
            origin: "api",
          },
        },
        ...(contentFragments.length > 0 ? { contentFragments } : {}),
      }),
    );

    let conversation = response.conversation;
    const generatedConversationId = conversation.sId;
    let generatedFrameFileUrl = frameFileUrl(apiRoot, conversation);
    let status = finalStatus(conversation);
    const startedAt = new Date().toISOString();
    const deadline = Date.now() + timeoutMs;
    while (!generatedFrameFileUrl && Date.now() < deadline) {
      if (["succeeded", "failed", "cancelled"].includes(status)) {
        break;
      }
      await sleep(pollIntervalMs);
      const poll = await apiJson(
        "GET",
        `assistant/conversations/${generatedConversationId}`,
      );
      conversation = poll.conversation;
      generatedFrameFileUrl = frameFileUrl(apiRoot, conversation);
      status = finalStatus(conversation);
    }

    const result = {
      packId,
      agentId: agent.id,
      generatedConversationId,
      frameFileUrl: generatedFrameFileUrl,
      status,
      startedAt,
      completedAt: new Date().toISOString(),
      attachments: contentFragments.map(({ title }) => title),
    };
    await writeJson(cellPath, result);
    await appendJsonl(path.join(outRoot, "results.jsonl"), result);
    return result;
  };

  const allPackIds = await listPackIds(packsRoot);
  const packIds =
    typeof args["only-pack"] === "string" ? [args["only-pack"]] : allPackIds;
  for (const packId of packIds) {
    if (!allPackIds.includes(packId)) {
      throw new Error(`Unknown pack: ${packId}`);
    }
    const validation = await validatePack(packsRoot, packId);
    if (validation.errors.length > 0) {
      throw new Error(
        `${packId} is invalid:\n${validation.errors.map((error) => `- ${error}`).join("\n")}`,
      );
    }
  }

  const jobs = packIds.flatMap((packId) =>
    config.agents.map((agent) => ({ packId, agent })),
  );
  stdout(
    `Running ${jobs.length} cell(s), ${packIds.length} pack(s), concurrency ${concurrency}.`,
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
        if (result.frameFileUrl) {
          produced += 1;
        }
        stdout(
          `[${completed}/${jobs.length}] ${result.frameFileUrl ? "FRAME" : "NO FRAME"} ${job.packId}/${job.agent.id}${result.skipped ? " (skipped)" : ""}`,
        );
      } catch (error) {
        completed += 1;
        const failure = {
          packId: job.packId,
          agentId: job.agent.id,
          error: String(error?.message ?? error),
          completedAt: new Date().toISOString(),
        };
        await writeJson(
          path.join(outRoot, "cells", job.packId, `${job.agent.id}.json`),
          failure,
        );
        await appendJsonl(path.join(outRoot, "results.jsonl"), failure);
        stderr(
          `[${completed}/${jobs.length}] ERROR ${job.packId}/${job.agent.id}: ${failure.error}`,
        );
        if (failure.error.includes("Dust API returned 401")) {
          stopRequested = true;
        }
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(concurrency, jobs.length) }, () => worker()),
  );
  stdout(`Done. ${produced}/${jobs.length} cells have a Frame file URL.`);
  if (produced < jobs.length) {
    stdout(
      "Refresh credentials if needed and rerun the same command to retry unfinished cells once.",
    );
  }
}

main().catch((error) => {
  stderr(error.stack ?? error.message);
  process.exitCode = 1;
});
