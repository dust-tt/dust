import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { costMicroUsd, summarizeUsage } from "./cost-latency.mjs";
import {
  applySameThreadSimilarityDiscount,
  fitPlackettLuce,
  reviewerAgreement,
} from "./analyze-rankings.mjs";
import { buildBalancedSlotOrders } from "./build-blind-eval.mjs";
import {
  applyReviewerAssignments,
  collectStructuredRankings,
  parseRankingReply,
} from "./collect-feedback.mjs";
import {
  classifyRunAttempts,
  summarizeAuditRecords,
  summarizeConversationAudit,
} from "./collect-run-audit.mjs";
import { buildChannelCreateRequest } from "./create-slack-channel.mjs";
import {
  getOutputConfig,
  getReviewConfig,
  loadDatasetItems,
  validateConfig,
  validatePack,
} from "./lib.mjs";
import {
  mainMessage,
  reviewerCommentText,
  threadMessage,
} from "./post-slack.mjs";
import {
  buildPreparedExperiment,
  buildReviewerAssignments,
  solveBalancedTriplets,
  summarizeDesign,
} from "./prepare-experiment.mjs";
import {
  buildConversationMessage,
  buildEvaluationJobs,
  findAgentAnswer,
  frameFileUrl,
} from "./run-eval.mjs";
import { extractFrameShareUrl } from "./resolve-frame-share-urls.mjs";
import { tally } from "./tally.mjs";

const packageRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

test("the committed example pack satisfies the pack contract", async () => {
  const result = await validatePack(
    path.join(packageRoot, "examples", "packs"),
    "example-pack",
  );
  assert.deepEqual(result.errors, []);
  assert.equal(result.attachmentCount, 2);
});

test("output configuration defaults to Frames", () => {
  assert.deepEqual(getOutputConfig({}), { type: "frame" });
  assert.deepEqual(getOutputConfig({ output: { type: "answer" } }), {
    type: "answer",
  });
  assert.doesNotThrow(() =>
    validateConfig({
      apiBaseUrl: "https://dust.tt/api/v1",
      output: { type: "answer" },
    }),
  );
});

test("review configuration keeps winner voting as the compatibility default", () => {
  assert.deepEqual(getReviewConfig({}), { type: "winner" });
  assert.deepEqual(getReviewConfig({ review: { type: "ranking" } }), {
    type: "ranking",
  });
});

test("dataset items define their own candidate sets", async () => {
  const items = await loadDatasetItems(
    path.join(packageRoot, "examples", "dataset.example.jsonl"),
  );

  assert.deepEqual(
    items.map(({ id, candidates }) => ({
      id,
      candidateIds: candidates.map((candidate) => candidate.id),
    })),
    [
      {
        id: "example-pack",
        candidateIds: [
          "agent-candidate-a",
          "agent-candidate-b",
          "agent-candidate-c",
        ],
      },
      {
        id: "example-brief",
        candidateIds: ["fable-low", "fable-high"],
      },
    ],
  );
  assert.deepEqual(
    items[0].attachments.map(({ name }) => name),
    ["INDEX.md", "regional_metrics.csv"],
  );
  assert.deepEqual(
    buildEvaluationJobs(items).map(
      ({ item, agent }) => `${item.id}/${agent.id}`,
    ),
    [
      "example-pack/agent-candidate-a",
      "example-pack/agent-candidate-b",
      "example-pack/agent-candidate-c",
      "example-brief/fable-low",
      "example-brief/fable-high",
    ],
  );
  assert.deepEqual(items[1].candidates, [
    {
      id: "fable-low",
      agentId: "dust",
      label: "Fable / low",
      modelSelection: {
        providerId: "anthropic",
        modelId: "claude-fable-5",
        reasoningEffort: "light",
      },
    },
    {
      id: "fable-high",
      agentId: "dust",
      label: "Fable / high",
      modelSelection: {
        providerId: "anthropic",
        modelId: "claude-fable-5",
        reasoningEffort: "high",
      },
    },
  ]);
});

test("conversation messages apply model selection to the execution agent", () => {
  assert.deepEqual(
    buildConversationMessage({
      agent: {
        id: "fable-high",
        agentId: "dust",
        modelSelection: {
          providerId: "anthropic",
          modelId: "claude-fable-5",
          reasoningEffort: "high",
        },
      },
      prompt: "Analyze the evidence.",
      timezone: "Europe/Paris",
    }),
    {
      content: ":mention[dust]{sId=dust} Analyze the evidence.",
      mentions: [{ configurationId: "dust" }],
      context: {
        username: "output-eval-runner",
        timezone: "Europe/Paris",
        fullName: "Output Eval Runner",
        origin: "api",
      },
      modelSelection: {
        providerId: "anthropic",
        modelId: "claude-fable-5",
        reasoningEffort: "high",
      },
    },
  );
});

test("Frame sharing URLs are extracted only from the matching file action", () => {
  const messages = [
    {
      content: "https://app.dust.tt/share/frame/wrong",
      actions: [
        {
          toolName: "get_interactive_content_file_share_url",
          params: { file_id: "fil_target" },
          output: [
            {
              text: "URL: https://app.dust.tt/share/frame/correct-token",
            },
          ],
        },
      ],
    },
  ];

  assert.equal(
    extractFrameShareUrl(messages, "fil_target"),
    "https://app.dust.tt/share/frame/correct-token",
  );
});

test("Frame outputs require a real generated file ID", () => {
  const conversation = {
    content: [
      [
        {
          type: "agent_message",
          actions: [
            {
              generatedFiles: [{ contentType: "application/vnd.dust.frame" }],
            },
          ],
        },
      ],
    ],
  };

  assert.equal(frameFileUrl("https://dust.test", conversation), null);
});

test("run audit preserves resolved models and tool metadata without raw output", () => {
  const audit = summarizeConversationAudit(
    {
      packId: "q01-a",
      agentId: "fable-high",
      executionAgentId: "dust",
      modelSelection: {
        providerId: "anthropic",
        modelId: "claude-fable-5",
        reasoningEffort: "high",
      },
      generatedConversationId: "conversation-1",
      status: "succeeded",
      answerFile: "answers/q01-a/fable-high.md",
      startedAt: "2026-01-01T00:00:00.000Z",
      completedAt: "2026-01-01T00:01:00.000Z",
    },
    {
      content: [
        [
          {
            type: "agent_message",
            sId: "message-1",
            status: "succeeded",
            content: "private answer",
            resolvedModel: {
              providerId: "anthropic",
              modelId: "claude-fable-5",
              reasoningEffort: "high",
            },
            actions: [
              {
                sId: "action-1",
                internalMCPServerName: "slack",
                toolName: "search",
                functionCallName: "slack_search",
                status: "succeeded",
                step: 1,
                executionDurationMs: 500,
                output: "private tool output",
              },
            ],
          },
        ],
      ],
    },
    { billedCredits: 12, details: null },
  );
  assert.equal(audit.latencyMs, 60_000);
  assert.equal(audit.messages[0].resolvedModel.modelId, "claude-fable-5");
  assert.equal(audit.messages[0].actions[0].toolName, "search");
  assert.equal("content" in audit.messages[0], false);
  assert.equal("output" in audit.messages[0].actions[0], false);
});

test("run audit separates current reviewable cells from every discarded attempt", () => {
  const classified = classifyRunAttempts({
    currentCells: [
      {
        packId: "q01-a",
        agentId: "candidate-a",
        generatedConversationId: "current-valid",
        answerFile: "answers/q01-a/candidate-a.md",
        outputPresent: true,
      },
      {
        packId: "q01-b",
        agentId: "candidate-b",
        generatedConversationId: "current-invalid",
        answerFile: "answers/q01-b/candidate-b.md",
        outputPresent: true,
        invalidatedAt: "2026-01-01T00:03:00.000Z",
        invalidReason: "failed_slack_action",
      },
    ],
    results: [
      {
        packId: "q01-a",
        agentId: "candidate-a",
        generatedConversationId: "superseded",
        answerFile: "answers/q01-a/candidate-a.md",
        startedAt: "2026-01-01T00:00:00.000Z",
        completedAt: "2026-01-01T00:01:00.000Z",
      },
      {
        packId: "q01-a",
        agentId: "candidate-a",
        generatedConversationId: "current-valid",
        answerFile: "answers/q01-a/candidate-a.md",
      },
      {
        packId: "q01-b",
        agentId: "candidate-b",
        generatedConversationId: "current-invalid",
        answerFile: "answers/q01-b/candidate-b.md",
        startedAt: "2026-01-01T00:00:00.000Z",
      },
    ],
    invalidAttempts: [
      {
        packId: "q01-b",
        agentId: "candidate-b",
        conversationId: "blocked-before-output",
        startedAt: "2026-01-01T00:00:00.000Z",
        discardedAt: "2026-01-01T00:02:00.000Z",
        reason: "slack_authentication_block",
      },
    ],
    slackFailures: [
      {
        packId: "q01-a",
        agentId: "candidate-a",
        conversationId: "superseded",
      },
    ],
  });

  assert.deepEqual(
    classified.reviewable.map(
      ({ generatedConversationId }) => generatedConversationId,
    ),
    ["current-valid"],
  );
  assert.deepEqual(
    classified.discarded
      .map(({ generatedConversationId }) => generatedConversationId)
      .sort(),
    ["blocked-before-output", "current-invalid", "superseded"],
  );
  assert.equal(
    classified.discarded.find(
      ({ generatedConversationId }) =>
        generatedConversationId === "current-invalid",
    ).discardReason,
    "failed_slack_action",
  );
  assert.equal(
    classified.discarded.find(
      ({ generatedConversationId }) =>
        generatedConversationId === "blocked-before-output",
    ).completedAt,
    "2026-01-01T00:02:00.000Z",
  );
});

test("run audit summaries include billed credits and measured latency", () => {
  assert.deepEqual(
    summarizeAuditRecords([
      {
        outputProduced: true,
        latencyMs: 1_000,
        consumption: { billedCredits: 3 },
      },
      {
        outputProduced: false,
        latencyMs: 3_000,
        consumption: { billedCredits: 5 },
      },
    ]),
    {
      conversationCount: 2,
      outputCount: 1,
      billedCredits: 8,
      latencyMs: {
        measuredCount: 2,
        total: 4_000,
        mean: 2_000,
        median: 1_000,
        p90: 3_000,
      },
    },
  );
});

test("the prepared experiment realizes the preregistered balanced design", () => {
  const triplets = solveBalancedTriplets();
  const design = summarizeDesign(triplets);
  assert.equal(design.tripletCount, 40);
  assert.equal(design.outputCount, 120);
  assert.deepEqual(
    design.exposures,
    [11, 11, 11, 11, 11, 11, 10, 11, 11, 11, 11],
  );
  assert.equal(design.minPairCount, 2);
  assert.equal(design.maxPairCount, 3);
  assert.ok(Math.abs(design.dEfficiency - 0.9982608643) < 1e-9);

  const questions = Array.from({ length: 20 }, (_, index) => ({
    number: index + 1,
    prompt: `Question ${index + 1}`,
  }));
  const prepared = buildPreparedExperiment(questions, "test-seed");
  assert.equal(prepared.manifest.outputType, "answer");
  assert.equal(
    buildPreparedExperiment(questions, "test-seed", { outputType: "frame" })
      .manifest.outputType,
    "frame",
  );
  assert.equal(prepared.items.length, 40);
  for (let index = 0; index < prepared.items.length; index += 2) {
    const left = new Set(prepared.items[index].candidates.map(({ id }) => id));
    assert.equal(
      prepared.items[index + 1].candidates.some(({ id }) => left.has(id)),
      false,
    );
  }
});

test("eight configurations and eight reviewers retain exact balance", () => {
  const candidates = Array.from({ length: 8 }, (_, index) => ({
    id: `candidate-${index}`,
    agentId: "dust",
    label: `Candidate ${index}`,
  }));
  const questions = Array.from({ length: 20 }, (_, index) => ({
    number: index + 1,
    prompt: `Question ${index + 1}`,
  }));
  const prepared = buildPreparedExperiment(questions, "eight-test", {
    candidates,
    reviewerCount: 8,
  });
  const design = prepared.manifest.design;
  assert.equal(prepared.items.length, 40);
  assert.equal(
    new Set(
      prepared.items.map((item) =>
        item.candidates
          .map(({ id }) => id)
          .sort()
          .join("/"),
      ),
    ).size,
    40,
  );
  assert.deepEqual(design.exposures, Array(8).fill(15));
  const counts = design.pairCounts.flatMap((row, index) =>
    row.slice(index + 1),
  );
  assert.equal(counts.filter((count) => count === 4).length, 20);
  assert.equal(counts.filter((count) => count === 5).length, 8);
  for (let index = 0; index < 8; index += 2) {
    assert.equal(design.pairCounts[index][index + 1], 5);
  }
  assert.ok(Math.abs(design.dEfficiency - 0.9993027377457784) < 1e-12);
  const reviewers = "ABCDEFGH".split("");
  const assignments = buildReviewerAssignments(
    prepared.items,
    reviewers,
    "eight-test",
  );
  const pairCounts = new Map();
  for (const assignment of assignments) {
    const key = [...assignment.reviewers].sort().join("/");
    pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
  }
  assert.equal(
    [...pairCounts.values()].filter((count) => count === 1).length,
    16,
  );
  assert.equal(
    [...pairCounts.values()].filter((count) => count === 2).length,
    12,
  );
  for (const reviewer of reviewers) {
    assert.equal(
      assignments.filter((item) => item.reviewers.includes(reviewer)).length,
      10,
    );
  }
  for (let index = 0; index < 40; index += 2) {
    assert.equal(
      new Set([
        ...assignments[index].reviewers,
        ...assignments[index + 1].reviewers,
      ]).size,
      4,
    );
    assert.equal(
      new Set(
        [
          ...prepared.items[index].candidates,
          ...prepared.items[index + 1].candidates,
        ].map(({ id }) => id),
      ).size,
      6,
    );
  }
});

test("dataset validation accepts current Dust efforts and preserves legacy light", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "eval-efforts-"));
  try {
    const datasetPath = path.join(directory, "dataset.jsonl");
    const efforts = [
      "none",
      "minimal",
      "light",
      "low",
      "medium",
      "high",
      "xhigh",
      "maximal",
    ];
    const rows = efforts.map((reasoningEffort) => ({
      id: reasoningEffort,
      prompt: "Test",
      candidates: [
        {
          id: reasoningEffort,
          agentId: "dust",
          label: reasoningEffort,
          modelSelection: {
            providerId: "openai",
            modelId: "test-model",
            reasoningEffort,
          },
        },
        { id: "control", agentId: "dust", label: "Control" },
      ],
    }));
    await fs.writeFile(
      datasetPath,
      rows.map((row) => JSON.stringify(row)).join("\n"),
    );
    const loaded = await loadDatasetItems(datasetPath);
    assert.deepEqual(
      loaded.map((item) => item.candidates[0].modelSelection.reasoningEffort),
      efforts,
    );
    rows[0].candidates[0].modelSelection.reasoningEffort = "max";
    await fs.writeFile(datasetPath, JSON.stringify(rows[0]));
    await assert.rejects(
      loadDatasetItems(datasetPath),
      /reasoningEffort must be/,
    );
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("reviewers and anonymous slots are balanced without Slack mentions", () => {
  const questions = Array.from({ length: 20 }, (_, index) => ({
    number: index + 1,
    prompt: `Question ${index + 1}`,
  }));
  const prepared = buildPreparedExperiment(questions, "test-seed");
  const reviewers = ["u1", "u2", "u3", "u4", "u5"];
  const assignments = buildReviewerAssignments(
    prepared.items,
    reviewers,
    "test-seed",
  );
  const reviewerCounts = Object.fromEntries(reviewers.map((id) => [id, 0]));
  const pairCounts = new Map();
  const pairQuestions = new Map();
  const pairCandidates = new Map();
  const itemById = new Map(prepared.items.map((item) => [item.id, item]));
  for (const assignment of assignments) {
    for (const reviewer of assignment.reviewers) {
      reviewerCounts[reviewer] += 1;
    }
    const pair = [...assignment.reviewers].sort().join("/");
    pairCounts.set(pair, Number(pairCounts.get(pair) ?? 0) + 1);
    const questions = pairQuestions.get(pair) ?? new Set();
    questions.add(assignment.itemId.replace(/-[ab]$/, ""));
    pairQuestions.set(pair, questions);
    const candidates = pairCandidates.get(pair) ?? new Set();
    for (const candidate of itemById.get(assignment.itemId).candidates) {
      candidates.add(candidate.id);
    }
    pairCandidates.set(pair, candidates);
  }
  assert.deepEqual(Object.values(reviewerCounts), [16, 16, 16, 16, 16]);
  assert.deepEqual([...pairCounts.values()], Array(10).fill(4));
  assert.deepEqual(
    [...pairQuestions.values()].map((questions) => questions.size),
    Array(10).fill(4),
  );
  assert.ok(
    [...pairCandidates.values()].every((candidates) => candidates.size >= 8),
  );
  for (let index = 0; index < assignments.length; index += 2) {
    assert.equal(
      new Set([
        ...assignments[index].reviewers,
        ...assignments[index + 1].reviewers,
      ]).size,
      4,
    );
  }

  const slots = buildBalancedSlotOrders(prepared.items, "test-seed");
  for (const counts of Object.values(slots.positionCounts)) {
    assert.ok(Math.max(...counts) - Math.min(...counts) <= 1);
  }
});

test("published blind slot mappings remain fixed when the review set grows", () => {
  const items = ["one", "two", "three"].map((id) => ({
    id,
    candidates: ["a", "b", "c"].map((candidateId) => ({
      id: candidateId,
    })),
  }));
  const fixedOrders = new Map([["one", ["c", "a", "b"]]]);
  const slots = buildBalancedSlotOrders(items, "test-seed", fixedOrders);

  assert.deepEqual(slots.orders.get("one"), ["c", "a", "b"]);
  assert.deepEqual([...slots.orders.keys()].sort(), ["one", "three", "two"]);
});

test("Slack channel creation is explicit and does not include invitations", () => {
  assert.deepEqual(buildChannelCreateRequest("model-eval-2026", true), {
    name: "model-eval-2026",
    is_private: true,
  });
  assert.throws(() => buildChannelCreateRequest("Model Eval", true));
});

test("the Plackett-Luce fit and agreement use complete rankings", () => {
  const observations = [
    {
      itemId: "one",
      questionId: "q1",
      reviewerId: "u1",
      order: ["a", "b", "c"],
    },
    {
      itemId: "one",
      questionId: "q1",
      reviewerId: "u2",
      order: ["a", "b", "c"],
    },
    {
      itemId: "two",
      questionId: "q2",
      reviewerId: "u1",
      order: ["a", "c", "b"],
    },
    {
      itemId: "two",
      questionId: "q2",
      reviewerId: "u2",
      order: ["b", "a", "c"],
    },
  ];
  const fit = fitPlackettLuce(observations, ["a", "b", "c"]);
  assert.ok(fit.scores.a > fit.scores.b);
  assert.ok(fit.scores.b > fit.scores.c);
  const agreement = reviewerAgreement(observations);
  assert.equal(agreement.comparisonCount, 2);
  assert.equal(agreement.exactAgreement, 0.5);
  assert.ok(Math.abs(agreement.meanKendallTau - 1 / 3) < 1e-12);
  assert.equal(agreement.reviewerPairs["u1/u2"].comparisonCount, 2);
  assert.equal(agreement.reviewerPairs["u1/u2"].exactAgreement, 0.5);
  assert.ok(
    Math.abs(agreement.reviewerPairs["u1/u2"].meanKendallTau - 1 / 3) < 1e-12,
  );
});

test("similar same-thread reviews receive diminishing ranking weight", () => {
  const observations = [
    {
      itemId: "exact",
      questionId: "q1",
      reviewerId: "u1",
      order: ["a", "b", "c"],
    },
    {
      itemId: "exact",
      questionId: "q1",
      reviewerId: "u2",
      order: ["a", "b", "c"],
    },
    {
      itemId: "partial",
      questionId: "q2",
      reviewerId: "u1",
      order: ["a", "b", "c"],
    },
    {
      itemId: "partial",
      questionId: "q2",
      reviewerId: "u2",
      order: ["a", "c", "b"],
    },
    {
      itemId: "disagree",
      questionId: "q3",
      reviewerId: "u1",
      order: ["a", "b", "c"],
    },
    {
      itemId: "disagree",
      questionId: "q3",
      reviewerId: "u2",
      order: ["c", "b", "a"],
    },
  ];

  const weighted = applySameThreadSimilarityDiscount(observations, 2 / 3);

  assert.ok(Math.abs(weighted[0].weight - 0.6) < 1e-12);
  assert.ok(Math.abs(weighted[1].weight - 0.6) < 1e-12);
  assert.ok(Math.abs(weighted[2].weight - 9 / 13) < 1e-12);
  assert.ok(Math.abs(weighted[3].weight - 9 / 13) < 1e-12);
  assert.equal(weighted[4].weight, 1);
  assert.equal(weighted[5].weight, 1);
});

test("a weighted ranking matches the equivalent duplicated evidence", () => {
  const preferred = {
    itemId: "one",
    questionId: "q1",
    reviewerId: "u1",
    order: ["a", "b", "c"],
  };
  const counterexample = {
    itemId: "two",
    questionId: "q2",
    reviewerId: "u2",
    order: ["c", "b", "a"],
  };
  const weighted = fitPlackettLuce(
    [{ ...preferred, weight: 2 }, counterexample],
    ["a", "b", "c"],
  );
  const duplicated = fitPlackettLuce(
    [preferred, { ...preferred, reviewerId: "u3" }, counterexample],
    ["a", "b", "c"],
  );

  for (const candidateId of ["a", "b", "c"]) {
    assert.ok(
      Math.abs(weighted.scores[candidateId] - duplicated.scores[candidateId]) <
        1e-10,
    );
  }
});

test("cost accounting treats token classes as disjoint", () => {
  const cost = costMicroUsd(
    {
      conversationId: "conversation",
      modelId: "model",
      freshInputTokens: 1_000_000,
      cacheReadTokens: 1_000_000,
      cacheWriteTokens: 500_000,
      outputTokens: 200_000,
    },
    {
      inputUsdPerMillion: 1,
      cacheReadUsdPerMillion: 0.1,
      cacheWriteUsdPerMillion: 1.25,
      outputUsdPerMillion: 5,
    },
  );
  assert.equal(cost, 2_725_000);
});

test("usage summary excludes conversations without a reviewed output", () => {
  const records = [
    {
      agentId: "agent-a",
      conversationId: "used",
      modelId: "model",
      outputProduced: true,
      startedAt: "2026-01-01T00:00:00Z",
      completedAt: "2026-01-01T00:01:00Z",
      freshInputTokens: 100,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      outputTokens: 100,
    },
    {
      agentId: "agent-a",
      conversationId: "unused",
      modelId: "model",
      outputProduced: false,
      startedAt: "2026-01-01T00:00:00Z",
      completedAt: "2026-01-01T01:00:00Z",
      freshInputTokens: 100,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      outputTokens: 100,
    },
  ];
  const summary = summarizeUsage(records, {
    model: {
      inputUsdPerMillion: 1,
      cacheReadUsdPerMillion: 0.1,
      cacheWriteUsdPerMillion: 1.25,
      outputUsdPerMillion: 5,
    },
  });
  assert.equal(summary[0].frameCount, 1);
  assert.equal(summary[0].latencyMs.median, 60_000);
});

test("answer output uses the final successful agent message", () => {
  const answer = findAgentAnswer({
    content: [
      [
        {
          type: "agent_message",
          status: "created",
          content: "Partial answer",
        },
      ],
      [
        {
          type: "agent_message",
          status: "succeeded",
          content: "# Final answer\n\nComplete response.",
        },
      ],
    ],
  });

  assert.equal(answer, "# Final answer\n\nComplete response.");
  assert.equal(
    findAgentAnswer({
      content: [
        [
          {
            type: "agent_message",
            status: "succeeded",
            content: "Earlier answer",
          },
        ],
        [
          {
            type: "agent_message",
            status: "failed",
            content: "Partial failed answer",
          },
        ],
      ],
    }),
    null,
  );
});

test("Slack answer matchups concisely point reviewers to thread files", () => {
  const message = mainMessage({
    outputType: "answer",
    packId: "example-pack",
    slots: [
      { slot: "1", answerFile: "files/example-pack/answer-1.md" },
      { slot: "2", answerFile: "files/example-pack/answer-2.md" },
    ],
  });

  assert.match(message, /Answers are attached in the thread\./);
  assert.doesNotMatch(message, /Same task, independent candidates/);
  assert.doesNotMatch(message, /Answer 1/);
  assert.doesNotMatch(message, /Answer 2/);
  assert.doesNotMatch(message, /agent-candidate/);
});

test("Slack reviewer comments support balanced reviewer pairs", () => {
  assert.equal(reviewerCommentText(["Theo"]), "*Reviewer:* Theo");
  assert.equal(
    reviewerCommentText(["Theo", "Arthur"]),
    "*Reviewers:* Theo, Arthur",
  );
});

test("Slack ranking matchups request one structured thread reply", () => {
  const payload = {
    outputType: "answer",
    reviewType: "ranking",
    packId: "example-pack",
    brief: "Compare the answers.",
    slots: [
      { slot: "1", answerFile: "files/example-pack/answer-1.md" },
      { slot: "2", answerFile: "files/example-pack/answer-2.md" },
      { slot: "3", answerFile: "files/example-pack/answer-3.md" },
    ],
  };

  assert.match(mainMessage(payload), /2 > 1 > 3/);
  assert.doesNotMatch(mainMessage(payload), /Vote with/);
  assert.match(threadMessage(payload), /each slot exactly once/);
});

test("private Form reviews never ask for Slack rankings or reactions", () => {
  assert.deepEqual(
    getReviewConfig({ review: { type: "ranking", collection: "google-form" } }),
    { type: "ranking", collection: "google-form" },
  );
  const payload = {
    outputType: "answer",
    reviewType: "ranking",
    reviewCollection: "google-form",
    packId: "q01-a",
    brief: "Compare these answers.",
    slots: [{ slot: "1" }, { slot: "2" }, { slot: "3" }],
  };
  assert.match(mainMessage(payload), /privately through Google Forms/);
  assert.doesNotMatch(mainMessage(payload), /Reply|React|Vote with/);
  assert.equal(threadMessage(payload), "*Brief*\nCompare these answers.");
});

test("Slack review briefs omit inline generation attachments", () => {
  const message = threadMessage({
    reviewType: "ranking",
    brief:
      "Everything referred to below as attached is included inline in this message. Do not research anything, do not fetch anything, and do not ask for additional context.\nBuild the requested Frame.\n### Attached: source.tsx\n```tsx\nlarge source\n```",
    slots: [{ slot: "1" }, { slot: "2" }, { slot: "3" }],
  });

  assert.match(message, /Build the requested Frame\./);
  assert.doesNotMatch(message, /large source/);
  assert.doesNotMatch(message, /Everything referred to below/);
});

test("structured ranking replies require one permutation of every slot", () => {
  const expectedSlots = ["1", "2", "3"];
  assert.deepEqual(parseRankingReply("2 > 1 > 3", expectedSlots), {
    type: "ranking",
    slots: ["2", "1", "3"],
  });
  assert.deepEqual(parseRankingReply("`2 &gt; 3 &gt; 1`", expectedSlots), {
    type: "ranking",
    slots: ["2", "3", "1"],
  });
  assert.equal(
    parseRankingReply("2 > 2 > 1", expectedSlots).type,
    "invalid-ranking",
  );
  assert.deepEqual(parseRankingReply("2 is strongest", expectedSlots), {
    type: "comment",
  });
});

test("the latest valid ranking wins unless the reviewer also votes none", () => {
  const result = collectStructuredRankings(
    [
      { userId: "u1", text: "1 > 2 > 3", ts: "1" },
      { userId: "u1", text: "2 > 1 > 3", ts: "2" },
      { userId: "u2", text: "2 > 2 > 1", ts: "3" },
      { userId: "u3", text: "3 > 2 > 1", ts: "4" },
      { userId: "u4", text: "2 has a broken chart", ts: "5" },
    ],
    ["1", "2", "3"],
    ["u3"],
  );

  assert.deepEqual(result.rankings, [
    { userId: "u1", slots: ["2", "1", "3"], ts: "2" },
  ]);
  assert.deepEqual(
    result.validationErrors.map(({ userId }) => userId),
    ["u2", "u3"],
  );
});

test("private reviewer assignments filter rankings without pinging Slack", () => {
  assert.deepEqual(
    applyReviewerAssignments(
      [
        { userId: "u1", slots: ["1", "2", "3"] },
        { userId: "u3", slots: ["2", "1", "3"] },
      ],
      ["u2"],
      ["u1", "u2"],
    ),
    {
      rankings: [{ userId: "u1", slots: ["1", "2", "3"] }],
      unexpectedReviewerIds: ["u3"],
      missingAssignedReviewerIds: [],
    },
  );
});

test("tally preserves every position in structured rankings", () => {
  const result = tally(
    {
      matchups: [
        {
          packId: "one",
          reviewType: "ranking",
          rankings: [
            { userId: "u1", slots: ["2", "1", "3"] },
            { userId: "u2", slots: ["1", "2", "3"] },
          ],
          rankingValidationErrors: [],
          noneVotes: 0,
        },
      ],
    },
    {
      one: {
        slots: {
          1: { agentId: "a", label: "A" },
          2: { agentId: "b", label: "B" },
          3: { agentId: "c", label: "C" },
        },
      },
    },
  );

  const agentA = result.candidates.find(({ agentId }) => agentId === "a");
  const agentC = result.candidates.find(({ agentId }) => agentId === "c");
  assert.equal(result.totalRankings, 2);
  assert.equal(agentA.firstPlaceVotes, 1);
  assert.equal(agentA.averageRank, 1.5);
  assert.equal(agentA.pairwiseWins, 3);
  assert.equal(agentA.pairwiseComparisons, 4);
  assert.equal(agentC.averageRank, 3);
  assert.equal(agentC.pairwiseWins, 0);
});

test("tally uses decided matchups and splits ties", () => {
  const result = tally(
    {
      matchups: [
        { packId: "one", votesBySlot: { 1: 2, 2: 1 }, noneVotes: 0 },
        { packId: "two", votesBySlot: { 1: 1, 2: 1 }, noneVotes: 0 },
        { packId: "three", votesBySlot: {}, noneVotes: 1 },
      ],
    },
    {
      one: {
        slots: {
          1: { agentId: "a", label: "A" },
          2: { agentId: "b", label: "B" },
        },
      },
      two: {
        slots: {
          1: { agentId: "a", label: "A" },
          2: { agentId: "b", label: "B" },
        },
      },
      three: {
        slots: {
          1: { agentId: "a", label: "A" },
          2: { agentId: "b", label: "B" },
        },
      },
    },
  );
  const agentA = result.candidates.find(({ agentId }) => agentId === "a");
  assert.equal(result.decidedMatchups, 2);
  assert.equal(result.noVoteMatchups, 1);
  assert.equal(agentA.decided, 2);
  assert.equal(agentA.outrightWins, 1);
  assert.equal(agentA.tieShare, 0.5);
  assert.equal(agentA.winRate, 0.75);
});
