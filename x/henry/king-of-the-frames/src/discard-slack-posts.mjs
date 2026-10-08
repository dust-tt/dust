import path from "node:path";

import {
  appendRunEvent,
  parseArgs,
  pathExists,
  readJson,
  requireArg,
  stderr,
  stdout,
  writeJson,
} from "./lib.mjs";

const DISCARD_NOTICE =
  ":no_entry: *DISCARDED — DO NOT REVIEW*\nOne or more candidate runs had failed Slack evidence retrieval. A clean replacement will be posted.";
const ALREADY_REMOVED_ERRORS = new Set([
  "file_deleted",
  "file_not_found",
  "message_not_found",
]);

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const reviewRoot = path.resolve(requireArg(args, "review"));
  const audit = await readJson(path.resolve(requireArg(args, "audit")));
  const postedPath = path.join(reviewRoot, "posted.private.json");
  const discardedPath = path.join(reviewRoot, "discarded.private.json");
  const logPath =
    typeof args.log === "string" ? path.resolve(args.log) : undefined;
  const dryRun = args["dry-run"] === true;
  const deleteMode = args.delete === true;
  const token = process.env.SLACK_BOT_TOKEN;
  if (!dryRun && !token) {
    throw new Error("SLACK_BOT_TOKEN is required");
  }

  const posted = await readJson(postedPath);
  let discarded = (await pathExists(discardedPath))
    ? await readJson(discardedPath)
    : [];
  const invalidPackIds = new Set(
    audit.invalidCells.map(({ packId }) => packId),
  );
  const targets = deleteMode
    ? discarded.filter(({ deletedAt }) => !deletedAt)
    : posted.filter(({ packId }) => invalidPackIds.has(packId));
  if (dryRun) {
    for (const target of targets) {
      stdout(
        `Would ${deleteMode ? "delete" : "discard"} ${target.packId} (${target.ts}).`,
      );
    }
    stdout(
      `Dry run: ${targets.length} Slack matchup(s) to ${deleteMode ? "delete" : "discard"}.`,
    );
    return;
  }

  const slack = async (method, body, allowedErrors = new Set()) => {
    const response = await fetch(`https://slack.com/api/${method}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams(
        Object.entries(body).map(([key, value]) => [key, String(value)]),
      ).toString(),
    });
    const result = await response.json();
    if (!response.ok || (!result.ok && !allowedErrors.has(result.error))) {
      throw new Error(
        `Slack ${method} failed: ${result.error ?? response.status}`,
      );
    }
    return result;
  };

  const auth = deleteMode ? await slack("auth.test", {}) : null;
  const removedPackIds = new Set();
  for (const target of targets) {
    const thread = await slack("conversations.replies", {
      channel: target.channel,
      ts: target.ts,
      limit: 200,
    });
    const rootMessage = thread.messages?.[0];
    if (!rootMessage) {
      throw new Error(`Slack thread not found for ${target.packId}`);
    }
    if (deleteMode) {
      const messages = thread.messages ?? [];
      const fileIds = new Set(
        messages.flatMap((message) =>
          (message.files ?? []).map((file) => file.id).filter(Boolean),
        ),
      );
      for (const fileId of fileIds) {
        await slack(
          "files.delete",
          { file: fileId },
          ALREADY_REMOVED_ERRORS,
        );
      }
      for (const message of [...messages].reverse()) {
        const ownedByBot =
          message.user === auth?.user_id || message.bot_id === auth?.bot_id;
        if (!ownedByBot) {
          continue;
        }
        await slack(
          "chat.delete",
          { channel: target.channel, ts: message.ts },
          ALREADY_REMOVED_ERRORS,
        );
      }
      const deletedAt = new Date().toISOString();
      discarded = discarded.map((entry) =>
        entry.packId === target.packId && entry.ts === target.ts
          ? { ...entry, deletedAt }
          : entry,
      );
      await writeJson(discardedPath, discarded);
      await appendRunEvent(logPath, "slack_matchup_deleted", {
        itemId: target.packId,
        channel: target.channel,
        threadTs: target.ts,
        fileCount: fileIds.size,
      });
      stdout(`Deleted ${target.packId} and ${fileIds.size} file(s).`);
      continue;
    }
    if (!rootMessage.text.startsWith(DISCARD_NOTICE)) {
      await slack("chat.update", {
        channel: target.channel,
        ts: target.ts,
        text: `${DISCARD_NOTICE}\n\n---\n${rootMessage.text}`,
      });
      await slack("chat.postMessage", {
        channel: target.channel,
        thread_ts: target.ts,
        text: DISCARD_NOTICE,
      });
      await slack("reactions.add", {
        channel: target.channel,
        timestamp: target.ts,
        name: "no_entry",
      });
    }
    removedPackIds.add(target.packId);
    discarded.push({
      ...target,
      discardedAt: new Date().toISOString(),
      reason: "one or more candidate conversations contained failed Slack actions",
    });
    await writeJson(discardedPath, discarded);
    await writeJson(
      postedPath,
      posted.filter(({ packId }) => !removedPackIds.has(packId)),
    );
    await appendRunEvent(logPath, "slack_matchup_marked_discarded", {
      itemId: target.packId,
      channel: target.channel,
      threadTs: target.ts,
    });
    stdout(`Marked ${target.packId} as discarded.`);
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
