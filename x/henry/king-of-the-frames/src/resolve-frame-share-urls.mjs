import fs from "node:fs/promises";
import path from "node:path";

import {
  appendRunEvent,
  parseArgs,
  readJson,
  requireArg,
  sleep,
  stderr,
  stdout,
  writeJson,
} from "./lib.mjs";

const SHARE_URL_PATTERN = /https:\/\/[^\s<>]+\/share\/frame\/[\w-]+/;

function shareUrlFromText(value) {
  if (typeof value !== "string") {
    return null;
  }
  return value.match(SHARE_URL_PATTERN)?.[0] ?? null;
}

export function extractFrameShareUrl(messages, fileId) {
  for (const message of [...messages].reverse()) {
    for (const action of [...(message.actions ?? [])].reverse()) {
      if (
        action.toolName !== "get_interactive_content_file_share_url" ||
        action.params?.file_id !== fileId
      ) {
        continue;
      }
      for (const output of action.output ?? []) {
        const shareUrl = shareUrlFromText(output.text);
        if (shareUrl) {
          return shareUrl;
        }
      }
    }
    const shareUrl = shareUrlFromText(message.content);
    if (shareUrl) {
      return shareUrl;
    }
  }
  return null;
}

function agentMessagesFromConversation(conversation) {
  return (conversation.content ?? [])
    .flatMap((group) => (Array.isArray(group) ? group : []))
    .filter((item) => item.type === "agent_message");
}

async function cellPaths(runRoot) {
  const paths = [];
  const cellsRoot = path.join(runRoot, "cells");
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
      if (cellEntry.isFile() && path.extname(cellEntry.name) === ".json") {
        paths.push(path.join(packRoot, cellEntry.name));
      }
    }
  }
  return paths.sort();
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const runRoot = path.resolve(requireArg(args, "run"));
  const logPath =
    typeof args.log === "string" ? path.resolve(args.log) : undefined;
  const workspaceId = process.env.DUST_WORKSPACE_ID;
  const accessToken = process.env.DUST_ACCESS_TOKEN;
  if (!workspaceId || !accessToken) {
    throw new Error("DUST_WORKSPACE_ID and DUST_ACCESS_TOKEN must be set");
  }
  const apiRoot = `https://dust.tt/api/v1/w/${workspaceId}`;
  const concurrency = Number(args.concurrency ?? 4);
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 16) {
    throw new Error("concurrency must be an integer from 1 to 16");
  }

  const apiJson = async (method, endpoint, body) => {
    const response = await fetch(`${apiRoot}/${endpoint}`, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!response.ok) {
      const responseBody = await response.text().catch(() => "");
      throw new Error(
        `${method} ${endpoint} returned ${response.status}: ${responseBody.slice(0, 300)}`,
      );
    }
    return response.json();
  };

  const jobs = [];
  for (const cellPath of await cellPaths(runRoot)) {
    const cell = await readJson(cellPath);
    if (
      !cell.invalidatedAt &&
      typeof cell.frameFileUrl === "string" &&
      cell.frameFileUrl.length > 0 &&
      !(typeof cell.frameShareUrl === "string" && cell.frameShareUrl.length > 0)
    ) {
      jobs.push({ cellPath, cell });
    }
  }
  stdout(`Resolving share URLs for ${jobs.length} Frame cell(s).`);

  let cursor = 0;
  let completed = 0;
  const failures = [];
  const resolveJob = async ({ cellPath, cell }) => {
    const fileId = cell.frameFileUrl.split("/").at(-1);
    if (!fileId || !cell.generatedConversationId) {
      throw new Error(
        `${cell.packId}/${cell.agentId} lacks file or conversation ID`,
      );
    }

    const conversationResponse = await apiJson(
      "GET",
      `assistant/conversations/${cell.generatedConversationId}`,
    );
    let shareUrl = extractFrameShareUrl(
      agentMessagesFromConversation(conversationResponse.conversation),
      fileId,
    );
    // A blocking API response can arrive before the agent finishes. Reuse an
    // existing sharing request, including after an interrupted local run.
    const sharingRequestExists = (conversationResponse.conversation.content ?? [])
      .flat()
      .some((message) =>
        message.type === "user_message" &&
        message.content?.includes(`Use the get_interactive_content_file_share_url tool for Frame file ID ${fileId}.`),
      );
    if (!shareUrl && !sharingRequestExists) {
      const executionAgentId = cell.executionAgentId ?? cell.agentId;
      const messageResponse = await apiJson(
        "POST",
        `assistant/conversations/${cell.generatedConversationId}/messages`,
        {
          content:
            `:mention[${executionAgentId}]{sId=${executionAgentId}} ` +
            `Use the get_interactive_content_file_share_url tool for Frame file ID ${fileId}. ` +
            "Return only the reviewer-facing share URL.",
          mentions: [{ configurationId: executionAgentId }],
          context: {
            username: "output-eval-runner",
            timezone: "Europe/Paris",
            fullName: "Output Eval Runner",
            origin: "api",
          },
          blocking: true,
          skipToolsValidation: true,
          ...(cell.modelSelection === null || cell.modelSelection === undefined
            ? {}
            : { modelSelection: cell.modelSelection }),
        },
      );
      shareUrl = extractFrameShareUrl(
        messageResponse.agentMessages ?? [],
        fileId,
      );
    }
    const deadline = Date.now() + 5 * 60_000;
    while (!shareUrl && Date.now() < deadline) {
      const latest = await apiJson(
        "GET",
        `assistant/conversations/${cell.generatedConversationId}`,
      );
      const messages = agentMessagesFromConversation(latest.conversation);
      shareUrl = extractFrameShareUrl(messages, fileId);
      if (shareUrl || ["succeeded", "failed", "cancelled", "gracefully_stopped"].includes(messages.at(-1)?.status)) {
        break;
      }
      await sleep(5_000);
    }
    if (!shareUrl) {
      throw new Error(
        `${cell.packId}/${cell.agentId} did not return a Frame share URL`,
      );
    }

    const resolvedAt = new Date().toISOString();
    await writeJson(cellPath, { ...cell, frameShareUrl: shareUrl, resolvedAt });
    await appendRunEvent(logPath, "generation_frame_share_url_resolved", {
      itemId: cell.packId,
      candidateId: cell.agentId,
      conversationId: cell.generatedConversationId,
      fileId,
    });
  };

  const worker = async () => {
    while (cursor < jobs.length) {
      const job = jobs[cursor];
      cursor += 1;
      try {
        await resolveJob(job);
        completed += 1;
        stdout(
          `[${completed}/${jobs.length}] RESOLVED ${job.cell.packId}/${job.cell.agentId}`,
        );
      } catch (error) {
        failures.push({
          packId: job.cell.packId,
          agentId: job.cell.agentId,
          error: String(error?.message ?? error),
        });
        stderr(
          `FAILED ${job.cell.packId}/${job.cell.agentId}: ${error?.message ?? error}`,
        );
      }
      await sleep(250);
    }
  };

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  await appendRunEvent(logPath, "generation_frame_share_urls_completed", {
    resolvedCount: completed,
    failureCount: failures.length,
  });
  stdout(`Resolved ${completed}/${jobs.length} share URL(s).`);
  if (failures.length > 0) {
    throw new Error(`${failures.length} Frame share URL(s) failed to resolve`);
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
