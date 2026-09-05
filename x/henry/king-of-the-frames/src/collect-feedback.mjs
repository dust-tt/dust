import path from "node:path";

import {
  parseArgs,
  readJson,
  requireArg,
  sleep,
  stderr,
  stdout,
  writeJson,
} from "./lib.mjs";

const SLOT_BY_REACTION = new Map([
  ["one", "1"],
  ["two", "2"],
  ["three", "3"],
  ["four", "4"],
  ["five", "5"],
]);

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const reviewRoot = path.resolve(requireArg(args, "review"));
  const outPath = path.resolve(requireArg(args, "out"));
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) {
    throw new Error("SLACK_BOT_TOKEN must be set in the shell");
  }

  const slack = async (method, params = {}) => {
    const query = new URLSearchParams(params);
    const response = await fetch(`https://slack.com/api/${method}?${query}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const result = await response.json();
    if (!response.ok || !result.ok) {
      throw new Error(
        `Slack ${method} failed: ${result.error ?? response.status}`,
      );
    }
    return result;
  };

  const botUserId =
    process.env.SLACK_BOT_USER_ID ?? (await slack("auth.test")).user_id;
  const posted = await readJson(path.join(reviewRoot, "posted.private.json"));
  const matchups = [];
  const reviewerIds = new Set();
  const gapMs = Number(process.env.SLACK_READ_GAP_MS ?? 350);

  for (const post of posted) {
    const reactionResponse = await slack("reactions.get", {
      channel: post.channel,
      timestamp: post.ts,
      full: "true",
    });
    const message = reactionResponse.message;
    const votesBySlot = {};
    const voteUserIdsBySlot = {};
    let noneVotes = 0;
    for (const reaction of message.reactions ?? []) {
      const humanUsers = (reaction.users ?? []).filter(
        (userId) => userId !== botUserId,
      );
      for (const userId of humanUsers) {
        reviewerIds.add(userId);
      }
      const slot = SLOT_BY_REACTION.get(reaction.name);
      if (slot) {
        votesBySlot[slot] = humanUsers.length;
        voteUserIdsBySlot[slot] = humanUsers;
      } else if (reaction.name === "no_entry_sign") {
        noneVotes = humanUsers.length;
      }
    }

    const replies = await slack("conversations.replies", {
      channel: post.channel,
      ts: post.ts,
      limit: "200",
    });
    const comments = (replies.messages ?? [])
      .slice(1)
      .filter((reply) => reply.user !== botUserId)
      .map((reply) => ({
        userId: reply.user ?? null,
        text: reply.text ?? "",
        ts: reply.ts,
        files: (reply.files ?? []).map((file) => ({
          id: file.id,
          name: file.name,
          mimetype: file.mimetype,
        })),
      }));
    for (const comment of comments) {
      if (comment.userId) {
        reviewerIds.add(comment.userId);
      }
    }

    matchups.push({
      packId: post.packId,
      channel: post.channel,
      ts: post.ts,
      votesBySlot,
      voteUserIdsBySlot,
      noneVotes,
      comments,
    });
    stdout(`Collected ${post.packId}.`);
    await sleep(gapMs);
  }

  await writeJson(outPath, {
    collectedAt: new Date().toISOString(),
    uniqueReviewerCount: reviewerIds.size,
    matchups,
  });
  stdout(
    `Saved ${matchups.length} matchup(s), ${reviewerIds.size} unique reviewer(s).`,
  );
}

main().catch((error) => {
  stderr(error.stack ?? error.message);
  process.exitCode = 1;
});
