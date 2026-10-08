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

const SLOT_BY_REACTION = new Map([
  ["one", "1"],
  ["two", "2"],
  ["three", "3"],
  ["four", "4"],
  ["five", "5"],
]);

function invalidRanking(error) {
  return { type: "invalid-ranking", error };
}

export function parseRankingReply(text, expectedSlots) {
  if (typeof text !== "string") {
    return { type: "comment" };
  }
  let normalized = text.replaceAll("&gt;", ">").trim();
  if (
    normalized.length >= 2 &&
    normalized.startsWith("`") &&
    normalized.endsWith("`") &&
    !normalized.slice(1, -1).includes("`")
  ) {
    normalized = normalized.slice(1, -1).trim();
  }
  if (!/^\d+\s*>/.test(normalized)) {
    return { type: "comment" };
  }

  const slots = normalized.split(">").map((slot) => slot.trim());
  if (slots.some((slot) => !/^\d+$/.test(slot))) {
    return invalidRanking("use only slot numbers separated by >");
  }
  if (slots.length !== expectedSlots.length) {
    return invalidRanking(`include all ${expectedSlots.length} slots`);
  }
  if (new Set(slots).size !== slots.length) {
    return invalidRanking("use each slot exactly once");
  }
  const expected = new Set(expectedSlots);
  if (slots.some((slot) => !expected.has(slot))) {
    return invalidRanking(`use only slots ${expectedSlots.join(", ")}`);
  }
  return { type: "ranking", slots };
}

export function collectStructuredRankings(
  comments,
  expectedSlots,
  noneUserIds = [],
) {
  const latestByUser = new Map();
  const validationErrors = [];
  for (const comment of comments) {
    const parsed = parseRankingReply(comment.text, expectedSlots);
    if (parsed.type === "comment") {
      continue;
    }
    if (!comment.userId) {
      validationErrors.push({
        userId: null,
        text: comment.text,
        ts: comment.ts,
        error: "ranking reply has no reviewer ID",
      });
      continue;
    }
    const prior = latestByUser.get(comment.userId);
    if (!prior || comment.ts.localeCompare(prior.comment.ts) >= 0) {
      latestByUser.set(comment.userId, { comment, parsed });
    }
  }

  const noneUsers = new Set(noneUserIds);
  const rankings = [];
  for (const [userId, { comment, parsed }] of latestByUser) {
    if (noneUsers.has(userId)) {
      validationErrors.push({
        userId,
        text: comment.text,
        ts: comment.ts,
        error: "remove the none-suitable reaction or the ranking reply",
      });
    } else if (parsed.type === "invalid-ranking") {
      validationErrors.push({
        userId,
        text: comment.text,
        ts: comment.ts,
        error: parsed.error,
      });
    } else {
      rankings.push({ userId, slots: parsed.slots, ts: comment.ts });
    }
  }
  rankings.sort((left, right) => left.ts.localeCompare(right.ts));
  validationErrors.sort((left, right) => left.ts.localeCompare(right.ts));
  return { rankings, validationErrors };
}

export function applyReviewerAssignments(
  rankings,
  noneUserIds,
  assignedReviewerIds,
) {
  if (assignedReviewerIds === null) {
    return {
      rankings,
      unexpectedReviewerIds: [],
      missingAssignedReviewerIds: [],
    };
  }
  const assigned = new Set(assignedReviewerIds);
  const acceptedRankings = rankings.filter(({ userId }) =>
    assigned.has(userId),
  );
  const unexpectedReviewerIds = rankings
    .filter(({ userId }) => !assigned.has(userId))
    .map(({ userId }) => userId);
  const completed = new Set([
    ...acceptedRankings.map(({ userId }) => userId),
    ...noneUserIds.filter((userId) => assigned.has(userId)),
  ]);
  return {
    rankings: acceptedRankings,
    unexpectedReviewerIds,
    missingAssignedReviewerIds: [...assigned].filter(
      (userId) => !completed.has(userId),
    ),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const reviewRoot = path.resolve(requireArg(args, "review"));
  const outPath = path.resolve(requireArg(args, "out"));
  const logPath =
    typeof args.log === "string" ? path.resolve(args.log) : undefined;
  const assignments =
    typeof args.assignments === "string"
      ? await readJson(path.resolve(args.assignments))
      : null;
  const assignedReviewersByItem = assignments
    ? new Map(
        assignments.map(({ itemId, reviewers }) => [
          itemId,
          new Set(reviewers),
        ]),
      )
    : null;
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
  const payloads = await readJson(path.join(reviewRoot, "payloads.json"));
  const payloadByPackId = new Map(
    payloads.map((payload) => [payload.packId, payload]),
  );
  const matchups = [];
  const reviewerIds = new Set();
  const gapMs = Number(process.env.SLACK_READ_GAP_MS ?? 350);
  let validRankingCount = 0;
  let invalidRankingReplyCount = 0;
  let missingAssignedReviewCount = 0;
  let unexpectedReviewerCount = 0;
  await appendRunEvent(logPath, "slack_feedback_collection_started", {
    matchupCount: posted.length,
    assignmentsApplied: Boolean(assignments),
  });

  for (const post of posted) {
    const payload = payloadByPackId.get(post.packId);
    if (!payload) {
      throw new Error(`Missing review payload for ${post.packId}`);
    }
    const reviewType = payload.reviewType ?? "winner";
    const assignedReviewers = assignedReviewersByItem?.get(post.packId) ?? null;
    if (assignedReviewersByItem && !assignedReviewers) {
      throw new Error(`Missing reviewer assignment for ${post.packId}`);
    }
    const reactionResponse = await slack("reactions.get", {
      channel: post.channel,
      timestamp: post.ts,
      full: "true",
    });
    const message = reactionResponse.message;
    const votesBySlot = {};
    const voteUserIdsBySlot = {};
    let noneVotes = 0;
    let noneUserIds = [];
    const unexpectedReactionReviewerIds = new Set();
    for (const reaction of message.reactions ?? []) {
      const allHumanUsers = (reaction.users ?? []).filter(
        (userId) => userId !== botUserId,
      );
      const humanUsers = assignedReviewers
        ? allHumanUsers.filter((userId) => assignedReviewers.has(userId))
        : allHumanUsers;
      if (assignedReviewers) {
        for (const userId of allHumanUsers) {
          if (!assignedReviewers.has(userId)) {
            unexpectedReactionReviewerIds.add(userId);
          }
        }
      }
      for (const userId of humanUsers) {
        reviewerIds.add(userId);
      }
      const slot = SLOT_BY_REACTION.get(reaction.name);
      if (slot) {
        votesBySlot[slot] = humanUsers.length;
        voteUserIdsBySlot[slot] = humanUsers;
      } else if (reaction.name === "no_entry_sign") {
        noneVotes = humanUsers.length;
        noneUserIds = humanUsers;
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
    const rankingCollection =
      reviewType === "ranking"
        ? collectStructuredRankings(
            comments,
            payload.slots.map(({ slot }) => slot),
            noneUserIds,
          )
        : { rankings: [], validationErrors: [] };
    const assigned = applyReviewerAssignments(
      rankingCollection.rankings,
      noneUserIds,
      assignedReviewers ? [...assignedReviewers] : null,
    );
    const acceptedRankings = assigned.rankings;
    const unexpectedReviewers = [
      ...new Set([
        ...assigned.unexpectedReviewerIds,
        ...unexpectedReactionReviewerIds,
      ]),
    ];
    const missingAssignedReviewers = assigned.missingAssignedReviewerIds;
    unexpectedReviewerCount += unexpectedReviewers.length;
    missingAssignedReviewCount += missingAssignedReviewers.length;
    validRankingCount += acceptedRankings.length;
    invalidRankingReplyCount += rankingCollection.validationErrors.length;
    if (rankingCollection.validationErrors.length > 0) {
      const invalidCount = rankingCollection.validationErrors.length;
      stderr(`WARN ${post.packId}: ${invalidCount} invalid ranking reply(s)`);
    }

    matchups.push({
      packId: post.packId,
      reviewType,
      channel: post.channel,
      ts: post.ts,
      votesBySlot,
      voteUserIdsBySlot,
      noneVotes,
      noneUserIds,
      rankings: acceptedRankings,
      rankingValidationErrors: rankingCollection.validationErrors,
      assignedReviewerIds: assignedReviewers
        ? [...assignedReviewers]
        : null,
      missingAssignedReviewerIds: missingAssignedReviewers,
      unexpectedReviewerIds: unexpectedReviewers,
      comments,
    });
    stdout(`Collected ${post.packId}.`);
    await sleep(gapMs);
  }

  await writeJson(outPath, {
    collectedAt: new Date().toISOString(),
    uniqueReviewerCount: reviewerIds.size,
    validRankingCount,
    invalidRankingReplyCount,
    missingAssignedReviewCount,
    unexpectedReviewerCount,
    matchups,
  });
  await appendRunEvent(logPath, "slack_feedback_collection_completed", {
    matchupCount: matchups.length,
    reviewerCount: reviewerIds.size,
    validRankingCount,
    invalidRankingReplyCount,
    missingAssignedReviewCount,
    unexpectedReviewerCount,
  });
  stdout(
    `Saved ${matchups.length} matchup(s), ${reviewerIds.size} reviewer(s), ` +
      `${validRankingCount} valid ranking(s), ${invalidRankingReplyCount} invalid.`,
  );
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
