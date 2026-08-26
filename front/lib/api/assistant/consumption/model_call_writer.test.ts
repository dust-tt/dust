import { creditAmountMicroFromCostMicroUsd } from "@app/lib/api/assistant/agent_message_consumption_attribution/attribution_builder";
import { hasConsumptionEventForIdempotencyKey } from "@app/lib/api/assistant/consumption/events";
import { recordModelCallConsumption } from "@app/lib/api/assistant/consumption/model_call_writer";
import { INCREMENTAL_CONSUMPTION_ATTRIBUTION_VERSION } from "@app/lib/api/assistant/consumption/version";
import { getLlmCredentials } from "@app/lib/api/provider_credentials";
import { AgentMessageConsumptionEventResource } from "@app/lib/resources/agent_message_consumption_event_resource";
import { AgentMessageConsumptionItemResource } from "@app/lib/resources/agent_message_consumption_item_resource";
import { RunResource } from "@app/lib/resources/run_resource";
import { generateRandomModelSId } from "@app/lib/resources/string_ids_server";
import { tokenCountForTexts } from "@app/lib/tokenization";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { AgentMCPActionFactory } from "@app/tests/utils/AgentMCPActionFactory";
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

const INPUT_TOKENS_COUNT = 1_000;
const OUTPUT_TOKENS_COUNT = 200;
const TOKENS_PER_FOOTPRINT = 7;

const RUN_KEY = "execution-x";

async function setupExecution() {
  const { authenticator: auth, workspace } = await createResourceTest({
    role: "admin",
  });
  const agentConfiguration = await AgentConfigurationFactory.createTestAgent(
    auth,
    { name: `Consumption ${generateRandomModelSId()}` }
  );
  const conversation = await ConversationFactory.create(auth, {
    agentConfigurationId: agentConfiguration.sId,
    messagesCreatedAt: [],
  });
  const { run, runUsageModelId } = await RunFactory.createWithUsage(auth, {
    inputTokens: INPUT_TOKENS_COUNT,
    outputTokens: OUTPUT_TOKENS_COUNT,
  });
  const { agentMessage } = await ConversationFactory.createAgentMessage(auth, {
    workspace,
    conversation,
    agentConfig: agentConfiguration,
    runIds: [run.dustRunId],
  });

  return {
    auth,
    workspace,
    conversation,
    run,
    runUsageModelId,
    agentMessageModelId: agentMessage.agentMessageId,
    context: {
      agentMessageModelId: agentMessage.agentMessageId,
      conversationModelId: conversation.id,
      rootAgentMessageId: agentMessage.sId,
      runKey: RUN_KEY,
    },
  };
}

async function listConsumptionItems(
  auth: Parameters<
    typeof AgentMessageConsumptionItemResource.listByAgentMessageModelIds
  >[0],
  agentMessageModelId: number
) {
  const items =
    await AgentMessageConsumptionItemResource.listByAgentMessageModelIds(auth, {
      agentMessageModelIds: [agentMessageModelId],
      maxAttributionVersion: INCREMENTAL_CONSUMPTION_ATTRIBUTION_VERSION,
    });

  return items.filter(
    (item) =>
      item.attributionVersion === INCREMENTAL_CONSUMPTION_ATTRIBUTION_VERSION
  );
}

describe("recordModelCallConsumption", () => {
  beforeEach(() => {
    vi.mocked(getLlmCredentials).mockResolvedValue({} as never);
    vi.mocked(tokenCountForTexts).mockImplementation(
      async (texts) => new Ok(texts.map(() => TOKENS_PER_FOOTPRINT))
    );
  });

  it("writes rows that sum to the provider's exact cost", async () => {
    const { auth, context, run, agentMessageModelId, runUsageModelId } =
      await setupExecution();

    await recordModelCallConsumption(auth, {
      context,
      dustRunId: run.dustRunId,
      emittedActions: [],
    });

    const items = await listConsumptionItems(auth, agentMessageModelId);
    expect(items.map((item) => item.itemType).sort()).toEqual([
      "input",
      "output",
    ]);
    for (const item of items) {
      expect(item.runKey).toBe(RUN_KEY);
      expect(item.runUsageId).toBe(runUsageModelId);
    }

    const [usage] = await RunResource.listRunUsagesForRuns(auth, {
      runs: [run],
    });
    const exactCreditAmountMicro = creditAmountMicroFromCostMicroUsd(
      usage.costMicroUsd
    );
    expect(
      items.reduce(
        (total, item) => total + (item.reconciledCreditAmountMicro ?? 0),
        0
      )
    ).toBe(exactCreditAmountMicro);

    await expect(
      hasConsumptionEventForIdempotencyKey(auth, {
        idempotencyKey: `model-call:${runUsageModelId}`,
      })
    ).resolves.toBe(true);
  });

  it("writes a pending tool row carrying the emitted footprint", async () => {
    const { auth, context, conversation, run, workspace, agentMessageModelId } =
      await setupExecution();
    const { action } = await AgentMCPActionFactory.create(auth, {
      workspace,
      conversationModelId: conversation.id,
      agentMessageModelId,
      dustRunId: run.dustRunId,
    });

    await recordModelCallConsumption(auth, {
      context,
      dustRunId: run.dustRunId,
      emittedActions: [action],
    });

    const items = await listConsumptionItems(auth, agentMessageModelId);
    const toolItem = items.find((item) => item.itemType === "tool");
    expect(toolItem).toMatchObject({
      agentMCPActionId: action.id,
      completedAt: null,
      directCreditAmountMicro: null,
      inputTokensCount: null,
      outputTokensCount: TOKENS_PER_FOOTPRINT,
      runKey: RUN_KEY,
    });

    const [usage] = await RunResource.listRunUsagesForRuns(auth, {
      runs: [run],
    });
    expect(
      items.reduce(
        (total, item) => total + (item.reconciledCreditAmountMicro ?? 0),
        0
      )
    ).toBe(creditAmountMicroFromCostMicroUsd(usage.costMicroUsd));
    expect(
      items.find((item) => item.itemType === "output")?.outputTokensCount
    ).toBe(OUTPUT_TOKENS_COUNT - TOKENS_PER_FOOTPRINT);
  });

  it("records one model call once, however often the writer retries", async () => {
    const { auth, context, run, agentMessageModelId } = await setupExecution();

    await recordModelCallConsumption(auth, {
      context,
      dustRunId: run.dustRunId,
      emittedActions: [],
    });
    const firstPass = await listConsumptionItems(auth, agentMessageModelId);

    await recordModelCallConsumption(auth, {
      context,
      dustRunId: run.dustRunId,
      emittedActions: [],
    });
    const secondPass = await listConsumptionItems(auth, agentMessageModelId);
    const events = await AgentMessageConsumptionEventResource.listUnprocessed(
      auth,
      {
        runKey: RUN_KEY,
        limit: 10,
      }
    );

    expect(secondPass).toHaveLength(firstPass.length);
    expect(events).toHaveLength(1);
    expect(secondPass.map((item) => item.reconciledCreditAmountMicro)).toEqual(
      firstPass.map((item) => item.reconciledCreditAmountMicro)
    );
  });
});
