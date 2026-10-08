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
import {
  mainMessage,
  reviewerCommentText,
  reviewerNamesByPackId,
  threadMessage,
} from "./post-slack.mjs";

async function slackReplies({ channel, threadTs, token }) {
  const messages = [];
  let cursor;
  do {
    const url = new URL("https://slack.com/api/conversations.replies");
    url.searchParams.set("channel", channel);
    url.searchParams.set("ts", threadTs);
    url.searchParams.set("limit", "100");
    if (cursor) {
      url.searchParams.set("cursor", cursor);
    }
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const result = await response.json();
    if (!response.ok || !result.ok) {
      throw new Error(
        `Slack conversations.replies failed: ${result.error ?? response.status}`,
      );
    }
    messages.push(...result.messages);
    cursor = result.response_metadata?.next_cursor || undefined;
  } while (cursor);
  return messages;
}

function expectedAnswerFiles(payload) {
  if (payload.outputType !== "answer") {
    return [];
  }
  return payload.slots.map(({ slot }) => `answer-${slot}.md`).sort();
}

function reactionNames(message) {
  return new Set((message.reactions ?? []).map(({ name }) => name));
}

function unescapeSlackText(text) {
  return text
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}

function countReviewerAssignments(reviewersByPackId) {
  const counts = new Map();
  for (const reviewer of [...reviewersByPackId.values()].flat()) {
    counts.set(reviewer, (counts.get(reviewer) ?? 0) + 1);
  }
  return Object.fromEntries(counts);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const reviewRoot = path.resolve(requireArg(args, "review"));
  const reviewerPlan = await readJson(
    path.resolve(requireArg(args, "reviewer-plan")),
  );
  const outPath = path.resolve(requireArg(args, "out"));
  const logPath =
    typeof args.log === "string" ? path.resolve(args.log) : undefined;
  const token = process.env.SLACK_BOT_TOKEN;
  const channel = process.env.SLACK_CHANNEL_ID;
  if (!token || !channel) {
    throw new Error("SLACK_BOT_TOKEN and SLACK_CHANNEL_ID are required");
  }

  const payloads = await readJson(path.join(reviewRoot, "payloads.json"));
  const posted = await readJson(path.join(reviewRoot, "posted.private.json"));
  const reviewerComments = await readJson(
    path.join(reviewRoot, "reviewer-comments.private.json"),
  );
  const activeReviewerComments = reviewerComments.filter(
    ({ removedAt }) => !removedAt,
  );
  const expectReviewerComments = args["without-reviewer-comments"] !== true;
  const payloadByPackId = new Map(
    payloads.map((payload) => [payload.packId, payload]),
  );
  const reviewersByPackId = reviewerNamesByPackId(reviewerPlan);
  const records = [];
  const errors = [];
  const seenPackIds = new Set();
  const seenThreadTimestamps = new Set();
  const gapMs = Number(process.env.SLACK_AUDIT_GAP_MS ?? 1100);

  if (posted.length !== payloads.length) {
    errors.push(
      `expected ${payloads.length} posted records, found ${posted.length}`,
    );
  }

  for (let index = 0; index < posted.length; index += 1) {
    const post = posted[index];
    const recordErrors = [];
    const payload = payloadByPackId.get(post.packId);
    const reviewers = reviewersByPackId.get(post.packId);
    if (seenPackIds.has(post.packId)) {
      recordErrors.push("duplicate pack ID");
    }
    seenPackIds.add(post.packId);
    if (seenThreadTimestamps.has(post.ts)) {
      recordErrors.push("duplicate thread timestamp");
    }
    seenThreadTimestamps.add(post.ts);
    if (post.channel !== channel) {
      recordErrors.push(`wrong channel ${post.channel}`);
    }
    if (!payload) {
      recordErrors.push("missing payload");
    }
    if (!reviewers || reviewers.length !== 2) {
      recordErrors.push("expected exactly two assigned reviewers");
    }

    let messages = [];
    if (payload && reviewers) {
      messages = await slackReplies({
        channel: post.channel,
        threadTs: post.ts,
        token,
      });
      const root = messages.find(({ ts }) => ts === post.ts);
      if (!root) {
        recordErrors.push("missing root Slack message");
      } else {
        if (unescapeSlackText(root.text) !== mainMessage(payload)) {
          recordErrors.push("root Slack text does not match payload");
        }
        if (!reactionNames(root).has("no_entry_sign")) {
          recordErrors.push("root Slack message is missing none reaction");
        }
      }
      if (
        !messages.some(
          ({ text }) => unescapeSlackText(text) === threadMessage(payload),
        )
      ) {
        recordErrors.push("missing ranking instruction reply");
      }
      const expectedReviewerText = reviewerCommentText(reviewers);
      const hasReviewerComment = messages.some(
        ({ text }) => text === expectedReviewerText,
      );
      if (expectReviewerComments && !hasReviewerComment) {
        recordErrors.push("missing or incorrect reviewer reply");
      }
      if (!expectReviewerComments && hasReviewerComment) {
        recordErrors.push("automated reviewer reply is still present");
      }
      const actualFiles = messages
        .flatMap(({ files = [] }) => files)
        .map(({ name }) => name)
        .filter(Boolean)
        .sort();
      const expectedFiles = expectedAnswerFiles(payload);
      if (JSON.stringify(actualFiles) !== JSON.stringify(expectedFiles)) {
        recordErrors.push(
          `answer files differ: expected ${expectedFiles.join(", ")}; found ${actualFiles.join(",")}`,
        );
      }
      const localComment = activeReviewerComments.find(
        ({ packId, channel: commentChannel, threadTs }) =>
          packId === post.packId &&
          commentChannel === post.channel &&
          threadTs === post.ts,
      );
      if (
        expectReviewerComments &&
        (!localComment ||
          JSON.stringify(localComment.reviewers) !== JSON.stringify(reviewers))
      ) {
        recordErrors.push("local reviewer comment record does not match plan");
      }
      if (!expectReviewerComments && localComment) {
        recordErrors.push("local reviewer comment is still active");
      }
    }

    records.push({
      packId: post.packId,
      channel: post.channel,
      threadTs: post.ts,
      reviewers,
      messageCount: messages.length,
      errors: recordErrors,
    });
    for (const error of recordErrors) {
      errors.push(`${post.packId}: ${error}`);
    }
    if (index + 1 < posted.length) {
      await sleep(gapMs);
    }
  }

  const report = {
    auditedAt: new Date().toISOString(),
    channel,
    payloadCount: payloads.length,
    postedCount: posted.length,
    reviewerCommentCount: activeReviewerComments.length,
    removedReviewerCommentCount:
      reviewerComments.length - activeReviewerComments.length,
    reviewerCounts: countReviewerAssignments(reviewersByPackId),
    errorCount: errors.length,
    errors,
    records,
  };
  await writeJson(outPath, report);
  await appendRunEvent(logPath, "slack_posts_audited", {
    channel,
    postedCount: posted.length,
    errorCount: errors.length,
  });
  if (errors.length > 0) {
    throw new Error(`Slack post audit found ${errors.length} error(s)`);
  }
  stdout(`Audited ${posted.length} Slack threads with no errors.`);
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
