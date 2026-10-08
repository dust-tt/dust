import assert from "node:assert/strict";
import test from "node:test";
import { parseConsumptionExport, summarizeStepCosts } from "./collect-step-costs.mjs";

const row = (overrides = {}) => ({
  conversationId: "conv", agentMessageId: "answer", consumptionType: "llm",
  stepIndex: 0, totalCredits: 2, executionTimeMs: 0, ...overrides,
});
const message = (overrides = {}) => ({
  type: "agent_message", sId: "answer", status: "succeeded", costCredits: 7,
  completionDurationMs: 1000, modelInteractionDurationMs: 600, actions: [], ...overrides,
});
const summarize = (messages, rows) => summarizeStepCosts(
  { packId: "q01-a", agentId: "candidate", generatedConversationId: "conv" },
  { content: messages.map((m) => [m]) }, rows,
);

test("retains multiple model calls and separates sharing followups from generation", () => {
  const rows = [row(), row(), row({ consumptionType: "tool", totalCredits: 3, executionTimeMs: 200 }),
    row({ agentMessageId: "share", totalCredits: 1 })];
  const result = summarize([message({ actions: [{ sId: "tool", status: "errored", step: 0 }] }),
    message({ sId: "share", costCredits: 1 })], rows);
  assert.equal(result.totalExportedCredits, 8);
  assert.equal(result.messages[0].phase, "generation");
  assert.equal(result.messages[0].exportedCredits, 7);
  assert.equal(result.messages[0].reconciliation, "matched");
  assert.equal(result.messages[0].exportedStepCount, 1);
  assert.equal(result.messages[0].steps[0].llmRows, 2);
  assert.equal(result.messages[0].failedToolCallCount, 1);
  assert.equal(result.messages[1].phase, "followup");
});

test("reconciliation allows export rounding but flags missing or mismatched costs", () => {
  assert.equal(summarize([message({ costCredits: 1 })], [row({ totalCredits: 0.33 }),
    row({ totalCredits: 0.33 }), row({ totalCredits: 0.33 })]).messages[0].reconciliation, "matched");
  assert.equal(summarize([message()], []).messages[0].reconciliation, "not-yet-exported");
  assert.equal(summarize([message()], [row()]).messages[0].reconciliation, "mismatch");
  assert.equal(summarize([message({ status: "created" })], [row()]).messages[0].reconciliation, "in-progress");
});

test("rejects streamed errors and truncation before replacing a snapshot", () => {
  const valid = JSON.stringify(row());
  assert.equal(parseConsumptionExport(`${valid}\n${valid}\n`).length, 2);
  assert.throws(() => parseConsumptionExport(`${valid}\n{"error":{"type":"timeout"}}`));
  assert.throws(() => parseConsumptionExport(`${valid}\n{"conversationId":`));
});
