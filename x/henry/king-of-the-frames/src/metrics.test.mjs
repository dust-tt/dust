import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { costMicroUsd, summarizeUsage } from "./cost-latency.mjs";
import { validatePack } from "./lib.mjs";
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

test("usage summary excludes conversations without a Frame", () => {
  const records = [
    {
      agentId: "agent-a",
      conversationId: "used",
      modelId: "model",
      frameProduced: true,
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
      frameProduced: false,
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
