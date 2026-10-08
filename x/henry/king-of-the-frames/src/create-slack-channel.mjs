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

export function buildChannelCreateRequest(name, isPrivate) {
  if (!/^[a-z0-9_-]{1,80}$/.test(name)) {
    throw new Error(
      "channel name must be 1-80 lowercase letters, digits, hyphens, or underscores",
    );
  }
  return { name, is_private: isPrivate };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const outPath = path.resolve(requireArg(args, "out"));
  const request = buildChannelCreateRequest(
    requireArg(args, "name"),
    args.private === true,
  );
  const dryRun = args["dry-run"] === true;
  const logPath =
    typeof args.log === "string" ? path.resolve(args.log) : undefined;

  if (await pathExists(outPath)) {
    const prior = await readJson(outPath);
    stdout(`Slack channel already recorded: ${prior.name} (${prior.channelId}).`);
    return;
  }
  if (dryRun) {
    stdout(JSON.stringify(request, null, 2));
    return;
  }

  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) {
    throw new Error("SLACK_BOT_TOKEN must be set in the shell");
  }
  await appendRunEvent(logPath, "slack_channel_creation_started", {
    name: request.name,
    isPrivate: request.is_private,
  });
  const response = await fetch("https://slack.com/api/conversations.create", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });
  const result = await response.json();
  if (!response.ok || !result.ok || !result.channel?.id) {
    throw new Error(
      `Slack conversations.create failed: ${result.error ?? response.status}`,
    );
  }
  const channel = {
    channelId: result.channel.id,
    name: result.channel.name ?? request.name,
    isPrivate: result.channel.is_private ?? request.is_private,
    createdAt: new Date().toISOString(),
  };
  await writeJson(outPath, channel);
  await appendRunEvent(logPath, "slack_channel_created", channel);
  stdout(`Created Slack channel ${channel.name} (${channel.channelId}).`);
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
