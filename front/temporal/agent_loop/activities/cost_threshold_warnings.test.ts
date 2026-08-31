import { recordModelCallConsumption } from "@app/lib/api/assistant/consumption/model_call_writer";
import { readConsumptionRootTotals } from "@app/lib/api/assistant/consumption/root_hash";
import { getLlmCredentials } from "@app/lib/api/provider_credentials";
import type { Authenticator } from "@app/lib/auth";
import { generateRandomModelSId } from "@app/lib/resources/string_ids_server";
import { tokenCountForTexts } from "@app/lib/tokenization";
import { checkCostAndSubagentsThresholds } from "@app/temporal/agent_loop/activities/cost_threshold_warnings";
import { applyConsumptionEventsActivity } from "@app/temporal/consumption/activities";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { RunFactory } from "@app/tests/utils/RunFactory";
import { Ok } from "@app/types/shared/result";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/api/provider_credentials", () => ({
  getLlmCredentials: vi.fn(),
}));

vi.mock("@app/lib/tokenization", () => ({
  tokenCountForTexts: vi.fn(),
}));

const RUN_KEY = "execution-x";

async function setupRootMessage() {
  const { authenticator: auth, workspace } = await createResourceTest({
    role: "admin",
  });
  const agentConfiguration = await AgentConfigurationFactory.createTestAgent(
    auth,
    { name: `Guardrail ${generateRandomModelSId()}` }
  );
  const conversation = await ConversationFactory.create(auth, {
    agentConfigurationId: agentConfiguration.sId,
    messagesCreatedAt: [],
  });
  const { agentMessage } = await ConversationFactory.createAgentMessage(auth, {
    workspace,
    conversation,
    agentConfig: agentConfiguration,
    runIds: [],
  });

  return {
    auth,
    workspace,
    conversation,
    agentMessage,
    eventData: {
      agentMessageId: agentMessage.sId,
      conversationId: conversation.sId,
      step: 1,
    },
  };
}

async function applyPendingEntries(auth: Authenticator) {
  await applyConsumptionEventsActivity(auth.toJSON(), {
    runKey: RUN_KEY,
  });
}

describe("checkCostAndSubagentsThresholds", () => {
  beforeEach(() => {
    vi.mocked(getLlmCredentials).mockResolvedValue({} as never);
    vi.mocked(tokenCountForTexts).mockImplementation(
      async (texts) => new Ok(texts.map(() => 3))
    );
  });

  it("reads the tree's spend from the root hash", async () => {
    const { auth, agentMessage, conversation, eventData } =
      await setupRootMessage();
    const { run } = await RunFactory.createWithUsage(auth, {
      inputTokens: 2_000,
      outputTokens: 300,
    });
    await recordModelCallConsumption(auth, {
      context: {
        agentMessageModelId: agentMessage.agentMessageId,
        conversationModelId: conversation.id,
        rootAgentMessageId: agentMessage.sId,
        runKey: RUN_KEY,
      },
      dustRunId: run.dustRunId,
      emittedActions: [],
    });
    await applyPendingEntries(auth);

    const result = await checkCostAndSubagentsThresholds({
      auth,
      isRootAgentMessage: true,
      useAgentMessageConsumption: true,
      eventData,
    });

    expect(result.totalCostMicroUsd).toBeGreaterThan(0);
    expect(result.hardCapExceeded).toBe(false);
    expect(result.subagentHardCapExceeded).toBe(false);
  });

  it("recomputes and seeds a missing root hash from the rows", async () => {
    const { auth, agentMessage, conversation, eventData } =
      await setupRootMessage();
    const { run } = await RunFactory.createWithUsage(auth, {
      inputTokens: 2_000,
      outputTokens: 300,
    });
    await recordModelCallConsumption(auth, {
      context: {
        agentMessageModelId: agentMessage.agentMessageId,
        conversationModelId: conversation.id,
        rootAgentMessageId: agentMessage.sId,
        runKey: RUN_KEY,
      },
      dustRunId: run.dustRunId,
      emittedActions: [],
    });
    expect(
      await readConsumptionRootTotals({
        workspaceId: auth.getNonNullableWorkspace().sId,
        rootAgentMessageId: agentMessage.sId,
      })
    ).toBeNull();

    const result = await checkCostAndSubagentsThresholds({
      auth,
      isRootAgentMessage: true,
      useAgentMessageConsumption: true,
      eventData,
    });

    expect(result.totalCostMicroUsd).toBeGreaterThan(0);
    expect(
      await readConsumptionRootTotals({
        workspaceId: auth.getNonNullableWorkspace().sId,
        rootAgentMessageId: agentMessage.sId,
      })
    ).not.toBeNull();
  });

  it("checks nothing for a sub-agent message", async () => {
    const { auth, eventData } = await setupRootMessage();

    expect(
      await checkCostAndSubagentsThresholds({
        auth,
        isRootAgentMessage: false,
        useAgentMessageConsumption: false,
        eventData,
      })
    ).toEqual({
      totalCostMicroUsd: 0,
      hardCapExceeded: false,
      subagentLaunchCount: 0,
      subagentHardCapExceeded: false,
    });
  });
});
