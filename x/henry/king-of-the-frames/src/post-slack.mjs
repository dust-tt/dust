import fs from "node:fs/promises";
import path from "node:path";

import {
  appendRunEvent,
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
const REVIEWER_COMMENT_VERSION = 3;

export function reviewerNamesByPackId(reviewerPlan) {
  const assignments = new Map();
  const add = (itemId, reviewer) => {
    if (
      typeof itemId !== "string" ||
      itemId.length === 0 ||
      typeof reviewer !== "string" ||
      reviewer.length === 0
    ) {
      throw new Error("reviewer assignments require item and reviewer names");
    }
    const reviewers = assignments.get(itemId) ?? [];
    if (reviewers.includes(reviewer)) {
      throw new Error(`duplicate reviewer assignment: ${itemId}/${reviewer}`);
    }
    reviewers.push(reviewer);
    assignments.set(itemId, reviewers);
  };

  const itemAssignments = Array.isArray(reviewerPlan)
    ? reviewerPlan
    : reviewerPlan.assignments;
  if (Array.isArray(itemAssignments)) {
    for (const assignment of itemAssignments) {
      if (!Array.isArray(assignment.reviewers)) {
        throw new Error("item reviewer assignments require a reviewers array");
      }
      for (const reviewer of assignment.reviewers) {
        add(assignment.itemId, reviewer);
      }
    }
    return assignments;
  }

  if (!Array.isArray(reviewerPlan.reviewers)) {
    throw new Error(
      "reviewer plan must contain item assignments or a reviewers array",
    );
  }
  for (const reviewer of reviewerPlan.reviewers) {
    if (
      typeof reviewer.name !== "string" ||
      reviewer.name.length === 0 ||
      !Array.isArray(reviewer.items)
    ) {
      throw new Error("reviewer plan entries require a name and items");
    }
    for (const itemId of reviewer.items) {
      add(itemId, reviewer.name);
    }
  }
  return assignments;
}

export function reviewerCommentText(reviewers) {
  const label = reviewers.length === 1 ? "Reviewer" : "Reviewers";
  return `*${label}:* ${reviewers.join(", ")}`;
}

function rankingExample(payload) {
  const slotIds = payload.slots.map(({ slot }) => slot);
  if (slotIds.length > 1) {
    [slotIds[0], slotIds[1]] = [slotIds[1], slotIds[0]];
  }
  return slotIds.join(" > ");
}

export function mainMessage(payload) {
  const outputType = payload.outputType ?? "frame";
  const reviewType = payload.reviewType ?? "winner";
  const outputLabel = outputType === "answer" ? "Answer" : "Frame";
  const action = reviewType === "ranking" ? "ranking" : "voting";
  const lines = [`*Blind ${outputLabel} evaluation: ${payload.packId}*`];
  if (outputType === "answer") {
    lines.push("Answers are attached in the thread.");
  } else {
    lines.push(
      `Same task, independent candidates. Open every ${outputLabel.toLowerCase()} ` +
        `before ${action}.`,
      "",
    );
    for (const slot of payload.slots) {
      const reaction = REACTION_NAMES[Number(slot.slot) - 1];
      const prefix =
        reviewType === "ranking" ? `*${slot.slot}.*` : `:${reaction}:`;
      const frameUrl = slot.frameUrl ?? slot.outputUrl;
      lines.push(`${prefix} <${frameUrl}|Frame ${slot.slot}>`);
    }
  }
  if (payload.reviewCollection === "google-form") {
    lines.push(
      "",
      "Rankings will be collected privately through Google Forms; link to follow.",
    );
  } else if (reviewType === "ranking") {
    const example = rankingExample(payload);
    lines.push(
      "",
      `Reply in the thread with every slot from best to worst, for example \`${example}\`.`,
      `React :${NONE_REACTION}: instead if none is suitable.`,
    );
  } else {
    lines.push(
      "",
      `Vote with :one: to :${REACTION_NAMES[payload.slots.length - 1]}:, ` +
        `or :${NONE_REACTION}: if none is suitable.`,
    );
  }
  return lines.join("\n");
}

function reviewerBrief(brief) {
  const withoutAttachments = brief.split(/\n(?=### Attached:)/, 1)[0];
  return withoutAttachments
    .replace(
      /^Everything referred to below as attached is included inline in this message\. Do not research anything, do not fetch anything, and do not ask for additional context\.\n/,
      "",
    )
    .trim();
}

export function threadMessage(payload) {
  const lines = [`*Brief*\n${reviewerBrief(payload.brief)}`];
  if (
    payload.reviewType === "ranking" &&
    payload.reviewCollection !== "google-form"
  ) {
    lines.push(
      "*Ranking*",
      `Reply with each slot exactly once, best to worst: \`${rankingExample(payload)}\``,
      "Put qualitative feedback in a separate reply.",
    );
  }
  return lines.join("\n\n");
}

async function loadAnswerFiles(reviewRoot, payload) {
  if (payload.outputType !== "answer") {
    return [];
  }
  const files = [];
  for (const slot of payload.slots) {
    if (typeof slot.answerFile !== "string" || slot.answerFile.length === 0) {
      throw new Error(`${payload.packId}/slot ${slot.slot} has no answer file`);
    }
    const filePath = path.resolve(reviewRoot, slot.answerFile);
    const relativePath = path.relative(reviewRoot, filePath);
    if (
      relativePath === ".." ||
      relativePath.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relativePath)
    ) {
      throw new Error(
        `${payload.packId}/slot ${slot.slot} answer file is outside the review directory`,
      );
    }
    files.push({
      body: await fs.readFile(filePath),
      filename: `answer-${slot.slot}.md`,
      title: `Answer ${slot.slot}`,
    });
  }
  return files;
}

async function uploadAnswerFiles({ files, channel, threadTs, slack }) {
  const completedFiles = [];
  for (const file of files) {
    const registration = await slack("files.getUploadURLExternal", {
      filename: file.filename,
      length: file.body.length,
    });
    if (!registration.upload_url || !registration.file_id) {
      throw new Error(
        `Slack did not return an upload URL for ${file.filename}`,
      );
    }
    const upload = await fetch(registration.upload_url, {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream" },
      body: file.body,
    });
    if (!upload.ok) {
      const responseBody = await upload.text().catch(() => "");
      throw new Error(
        `Slack upload for ${file.filename} failed: ${upload.status} ${responseBody.slice(0, 200)}`,
      );
    }
    completedFiles.push({ id: registration.file_id, title: file.title });
  }
  await slack("files.completeUploadExternal", {
    files: completedFiles,
    channel_id: channel,
    thread_ts: threadTs,
    initial_comment: "*Answers*",
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const reviewRoot = path.resolve(requireArg(args, "review"));
  const payloads = await readJson(path.join(reviewRoot, "payloads.json"));
  const postedPath = path.join(reviewRoot, "posted.private.json");
  const posted = (await pathExists(postedPath))
    ? await readJson(postedPath)
    : [];
  const postingStatePath = path.join(reviewRoot, "posting-state.private.json");
  const postingState = (await pathExists(postingStatePath))
    ? await readJson(postingStatePath)
    : {};
  const reviewerPlanPath = args["reviewer-plan"];
  if (reviewerPlanPath !== undefined && typeof reviewerPlanPath !== "string") {
    throw new Error("--reviewer-plan must be a JSON file");
  }
  let reviewersByPackId = new Map();
  if (reviewerPlanPath) {
    const reviewerPlan = await readJson(path.resolve(reviewerPlanPath));
    reviewersByPackId = reviewerNamesByPackId(reviewerPlan);
  }
  const reviewerCommentsPath = path.join(
    reviewRoot,
    "reviewer-comments.private.json",
  );
  const reviewerComments = (await pathExists(reviewerCommentsPath))
    ? await readJson(reviewerCommentsPath)
    : [];
  const reviewerCommentKeys = new Set(
    reviewerComments.map(
      ({ packId, channel: commentChannel, threadTs }) =>
        `${packId}:${commentChannel}:${threadTs}`,
    ),
  );
  const postedPackIds = new Set(posted.map(({ packId }) => packId));
  if (args.max !== undefined && typeof args.max !== "string") {
    throw new Error("--max must be a positive integer");
  }
  const max = args.max === undefined ? payloads.length : Number(args.max);
  const packId = args["pack-id"];
  const dryRun = args["dry-run"] === true;
  const logPath =
    typeof args.log === "string" ? path.resolve(args.log) : undefined;
  const postsPerMinute = Number(process.env.SLACK_POSTS_PER_MIN ?? 5);
  const reactionGapMs = Number(process.env.SLACK_REACTION_GAP_MS ?? 1100);
  const delayMs = Math.ceil(60_000 / postsPerMinute);

  if (!Number.isInteger(max) || max < 1) {
    throw new Error("--max must be a positive integer");
  }
  if (packId !== undefined && typeof packId !== "string") {
    throw new Error("--pack-id must be a string");
  }

  const token = process.env.SLACK_BOT_TOKEN;
  let channel = process.env.SLACK_CHANNEL_ID;
  if (!channel && typeof args["channel-file"] === "string") {
    const channelRecord = await readJson(path.resolve(args["channel-file"]));
    channel = channelRecord.channelId;
  }
  if (!dryRun && (!token || !channel)) {
    throw new Error(
      "SLACK_BOT_TOKEN and either SLACK_CHANNEL_ID or --channel-file are required",
    );
  }

  const slack = async (method, body) => {
    const isFormEncoded = method === "files.getUploadURLExternal";
    const response = await fetch(`https://slack.com/api/${method}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": isFormEncoded
          ? "application/x-www-form-urlencoded"
          : "application/json",
      },
      body: isFormEncoded
        ? new URLSearchParams(
            Object.entries(body).map(([key, value]) => [key, String(value)]),
          ).toString()
        : JSON.stringify(body),
    });
    const result = await response.json();
    if (!response.ok || !result.ok) {
      throw new Error(
        `Slack ${method} failed: ${result.error ?? response.status}`,
      );
    }
    return result;
  };

  if (args["remove-reviewer-comments"] === true) {
    const targets = reviewerComments
      .map((comment, index) => ({ comment, index }))
      .filter(({ comment }) => !comment.removedAt)
      .filter(
        ({ comment }) => packId === undefined || comment.packId === packId,
      )
      .slice(0, max);
    for (let targetIndex = 0; targetIndex < targets.length; targetIndex += 1) {
      const { comment, index } = targets[targetIndex];
      await slack("chat.delete", {
        channel: comment.channel,
        ts: comment.ts,
      });
      const removedAt = new Date().toISOString();
      reviewerComments[index] = { ...comment, removedAt };
      await writeJson(reviewerCommentsPath, reviewerComments);
      await appendRunEvent(logPath, "slack_reviewer_comment_deleted", {
        itemId: comment.packId,
        channel: comment.channel,
        threadTs: comment.threadTs,
        commentTs: comment.ts,
      });
      stdout(`Removed reviewer comment for ${comment.packId}.`);
      if (targetIndex + 1 < targets.length) {
        await sleep(reactionGapMs);
      }
    }
    return;
  }

  const postReviewerComment = async ({ packId: itemId, channel, threadTs }) => {
    const reviewers = reviewersByPackId.get(itemId);
    if (!reviewers) {
      return false;
    }
    const key = `${itemId}:${channel}:${threadTs}`;
    if (reviewerCommentKeys.has(key)) {
      return false;
    }
    const response = await slack("chat.postMessage", {
      channel,
      thread_ts: threadTs,
      text: reviewerCommentText(reviewers),
      unfurl_links: false,
      unfurl_media: false,
    });
    reviewerComments.push({
      packId: itemId,
      reviewers,
      version: REVIEWER_COMMENT_VERSION,
      channel,
      threadTs,
      ts: response.ts,
    });
    reviewerCommentKeys.add(key);
    await writeJson(reviewerCommentsPath, reviewerComments);
    await appendRunEvent(logPath, "slack_reviewer_comment_posted", {
      itemId,
      reviewers,
      channel,
      threadTs,
      commentTs: response.ts,
    });
    return true;
  };

  if (args["sync-reviewers"] === true) {
    const targets = posted
      .filter((record) => packId === undefined || record.packId === packId)
      .filter((record) => reviewersByPackId.has(record.packId))
      .slice(0, max);
    for (let index = 0; index < targets.length; index += 1) {
      const record = targets[index];
      const commentIndex = reviewerComments.findIndex(
        ({
          packId: commentPackId,
          channel: commentChannel,
          threadTs,
          removedAt,
        }) =>
          commentPackId === record.packId &&
          commentChannel === record.channel &&
          threadTs === record.ts &&
          !removedAt,
      );
      if (commentIndex === -1) {
        await postReviewerComment({
          packId: record.packId,
          channel: record.channel,
          threadTs: record.ts,
        });
        stdout(`Commented reviewers for ${record.packId}.`);
      } else {
        const comment = reviewerComments[commentIndex];
        const reviewers = reviewersByPackId.get(record.packId);
        const recordedReviewers = comment.reviewers ?? [comment.reviewer];
        if (
          JSON.stringify(recordedReviewers) !== JSON.stringify(reviewers) ||
          comment.version !== REVIEWER_COMMENT_VERSION
        ) {
          await slack("chat.update", {
            channel: record.channel,
            ts: comment.ts,
            text: reviewerCommentText(reviewers),
          });
          reviewerComments[commentIndex] = {
            packId: record.packId,
            reviewers,
            version: REVIEWER_COMMENT_VERSION,
            channel: record.channel,
            threadTs: record.ts,
            ts: comment.ts,
            updatedAt: new Date().toISOString(),
          };
          await writeJson(reviewerCommentsPath, reviewerComments);
          await appendRunEvent(logPath, "slack_reviewer_comment_updated", {
            itemId: record.packId,
            reviewers,
            channel: record.channel,
            threadTs: record.ts,
            commentTs: comment.ts,
          });
          stdout(`Updated reviewers for ${record.packId}.`);
        }
      }
      if (index + 1 < targets.length) {
        await sleep(reactionGapMs);
      }
    }
    return;
  }

  if (args["comment-reviewers"] === true) {
    const targets = posted
      .filter((record) => packId === undefined || record.packId === packId)
      .filter((record) => reviewersByPackId.has(record.packId))
      .filter(
        (record) =>
          !reviewerCommentKeys.has(
            `${record.packId}:${record.channel}:${record.ts}`,
          ),
      )
      .slice(0, max);
    for (let index = 0; index < targets.length; index += 1) {
      const record = targets[index];
      await postReviewerComment({
        packId: record.packId,
        channel: record.channel,
        threadTs: record.ts,
      });
      stdout(`Commented reviewer for ${record.packId}.`);
      if (index + 1 < targets.length) {
        await sleep(reactionGapMs);
      }
    }
    return;
  }

  const remaining = payloads
    .filter(({ packId }) => !postedPackIds.has(packId))
    .filter((payload) => packId === undefined || payload.packId === packId)
    .slice(0, max);
  if (args["refresh-posted"] === true) {
    const payloadByPackId = new Map(
      payloads.map((payload) => [payload.packId, payload]),
    );
    const postedToRefresh = posted.filter(({ packId: postedPackId }) => {
      return (
        payloadByPackId.has(postedPackId) &&
        (packId === undefined || postedPackId === packId)
      );
    });
    for (let index = 0; index < postedToRefresh.length; index += 1) {
      const record = postedToRefresh[index];
      const payload = payloadByPackId.get(record.packId);
      await slack("chat.update", {
        channel: record.channel,
        ts: record.ts,
        text: mainMessage(payload),
      });
      await appendRunEvent(logPath, "slack_matchup_root_refreshed", {
        itemId: record.packId,
        channel: record.channel,
        threadTs: record.ts,
      });
      stdout(`Refreshed ${record.packId}.`);
      if (index + 1 < postedToRefresh.length) {
        await sleep(reactionGapMs);
      }
    }
    return;
  }
  if (dryRun) {
    await appendRunEvent(logPath, "slack_post_dry_run", {
      matchupCount: remaining.length,
    });
    for (const payload of remaining) {
      const answerFiles = await loadAnswerFiles(reviewRoot, payload);
      stdout(mainMessage(payload));
      stdout("\n--- thread ---\n");
      stdout(threadMessage(payload));
      const reviewers = reviewersByPackId.get(payload.packId);
      if (reviewers) {
        stdout(`Reviewer comment: ${reviewers.join(", ")}`);
      }
      for (const file of answerFiles) {
        stdout(`Attachment: ${file.filename} (${file.body.length} bytes)`);
      }
    }
    stdout(`Dry run: ${remaining.length} matchup(s).`);
    return;
  }

  let postedThisRun = 0;
  await appendRunEvent(logPath, "slack_posting_started", {
    channel,
    matchupCount: remaining.length,
  });
  for (const payload of remaining) {
    const answerFiles = await loadAnswerFiles(reviewRoot, payload);
    let progress = postingState[payload.packId];
    if (progress && progress.channel !== channel) {
      throw new Error(
        `${payload.packId} has a partial post in channel ${progress.channel}`,
      );
    }
    if (!progress) {
      const root = await slack("chat.postMessage", {
        channel,
        text: mainMessage(payload),
        unfurl_links: false,
        unfurl_media: false,
      });
      progress = {
        channel,
        ts: root.ts,
        reactions: [],
        threadMessagePosted: false,
        answerFilesUploaded: false,
      };
      postingState[payload.packId] = progress;
      await writeJson(postingStatePath, postingState);
      await appendRunEvent(logPath, "slack_matchup_root_posted", {
        itemId: payload.packId,
        channel,
        threadTs: progress.ts,
      });
    }

    const requiredReactions = [];
    if (
      payload.reviewCollection !== "google-form" &&
      payload.reviewType !== "ranking"
    ) {
      for (let index = 0; index < payload.slots.length; index += 1) {
        requiredReactions.push(REACTION_NAMES[index]);
      }
    }
    if (payload.reviewCollection !== "google-form") {
      requiredReactions.push(NONE_REACTION);
    }
    for (const reaction of requiredReactions) {
      if (progress.reactions.includes(reaction)) {
        continue;
      }
      await slack("reactions.add", {
        channel,
        name: reaction,
        timestamp: progress.ts,
      });
      progress.reactions.push(reaction);
      await writeJson(postingStatePath, postingState);
      await sleep(reactionGapMs);
    }
    if (!progress.threadMessagePosted) {
      await slack("chat.postMessage", {
        channel,
        thread_ts: progress.ts,
        text: threadMessage(payload),
        unfurl_links: false,
        unfurl_media: false,
      });
      progress.threadMessagePosted = true;
      await writeJson(postingStatePath, postingState);
    }
    await postReviewerComment({
      packId: payload.packId,
      channel,
      threadTs: progress.ts,
    });
    if (answerFiles.length > 0 && !progress.answerFilesUploaded) {
      await uploadAnswerFiles({
        files: answerFiles,
        channel,
        threadTs: progress.ts,
        slack,
      });
      progress.answerFilesUploaded = true;
      await writeJson(postingStatePath, postingState);
    }
    posted.push({ packId: payload.packId, channel, ts: progress.ts });
    await writeJson(postedPath, posted);
    delete postingState[payload.packId];
    await writeJson(postingStatePath, postingState);
    await appendRunEvent(logPath, "slack_matchup_posted", {
      itemId: payload.packId,
      channel,
      threadTs: progress.ts,
    });
    postedThisRun += 1;
    stdout(`Posted ${payload.packId} (${postedThisRun}/${remaining.length}).`);
    if (postedThisRun < remaining.length) {
      await sleep(delayMs);
    }
  }
  await appendRunEvent(logPath, "slack_posting_completed", {
    channel,
    postedCount: postedThisRun,
  });
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
