import path from "node:path";

import {
  parseArgs,
  pathExists,
  readJson,
  requireArg,
  sleep,
  stderr,
  stdout,
  writeJson,
} from "./lib.mjs";

const REACTION_NAMES = ["one", "two", "three", "four", "five"];
const NONE_REACTION = "no_entry_sign";

function mainMessage(payload) {
  const lines = [
    `*Blind Frame evaluation: ${payload.packId}*`,
    "Same brief, independent candidates. Open every Frame before voting.",
    "",
  ];
  for (const slot of payload.slots) {
    lines.push(
      `:${REACTION_NAMES[Number(slot.slot) - 1]}: <${slot.frameUrl}|Frame ${slot.slot}>`,
    );
  }
  lines.push(
    "",
    `Vote with :one: to :${REACTION_NAMES[payload.slots.length - 1]}:, or :${NONE_REACTION}: if none is suitable.`,
  );
  return lines.join("\n");
}

function threadMessage(payload) {
  return `*Brief*\n${payload.brief}`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const reviewRoot = path.resolve(requireArg(args, "review"));
  const payloads = await readJson(path.join(reviewRoot, "payloads.json"));
  const postedPath = path.join(reviewRoot, "posted.private.json");
  const posted = (await pathExists(postedPath))
    ? await readJson(postedPath)
    : [];
  const postedPackIds = new Set(posted.map(({ packId }) => packId));
  const max =
    typeof args.max === "string" ? Number(args.max) : Number.POSITIVE_INFINITY;
  const dryRun = args["dry-run"] === true;
  const postsPerMinute = Number(process.env.SLACK_POSTS_PER_MIN ?? 5);
  const reactionGapMs = Number(process.env.SLACK_REACTION_GAP_MS ?? 1100);
  const delayMs = Math.ceil(60_000 / postsPerMinute);

  if (!Number.isFinite(max) || max < 1) {
    throw new Error("--max must be a positive integer");
  }

  const token = process.env.SLACK_BOT_TOKEN;
  const channel = process.env.SLACK_CHANNEL_ID;
  if (!dryRun && (!token || !channel)) {
    throw new Error(
      "SLACK_BOT_TOKEN and SLACK_CHANNEL_ID must be set in the shell",
    );
  }

  const slack = async (method, body) => {
    const response = await fetch(`https://slack.com/api/${method}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const result = await response.json();
    if (!response.ok || !result.ok) {
      throw new Error(
        `Slack ${method} failed: ${result.error ?? response.status}`,
      );
    }
    return result;
  };

  const remaining = payloads
    .filter(({ packId }) => !postedPackIds.has(packId))
    .slice(0, max);
  if (dryRun) {
    for (const payload of remaining) {
      stdout(mainMessage(payload));
      stdout("\n--- thread ---\n");
      stdout(threadMessage(payload));
    }
    stdout(`Dry run: ${remaining.length} matchup(s).`);
    return;
  }

  let postedThisRun = 0;
  for (const payload of remaining) {
    const root = await slack("chat.postMessage", {
      channel,
      text: mainMessage(payload),
      unfurl_links: false,
      unfurl_media: false,
    });
    for (let index = 0; index < payload.slots.length; index += 1) {
      await slack("reactions.add", {
        channel,
        name: REACTION_NAMES[index],
        timestamp: root.ts,
      });
      await sleep(reactionGapMs);
    }
    await slack("reactions.add", {
      channel,
      name: NONE_REACTION,
      timestamp: root.ts,
    });
    await slack("chat.postMessage", {
      channel,
      thread_ts: root.ts,
      text: threadMessage(payload),
      unfurl_links: false,
      unfurl_media: false,
    });
    posted.push({ packId: payload.packId, channel, ts: root.ts });
    await writeJson(postedPath, posted);
    postedThisRun += 1;
    stdout(`Posted ${payload.packId} (${postedThisRun}/${remaining.length}).`);
    if (postedThisRun < remaining.length) {
      await sleep(delayMs);
    }
  }
}

main().catch((error) => {
  stderr(error.stack ?? error.message);
  process.exitCode = 1;
});
