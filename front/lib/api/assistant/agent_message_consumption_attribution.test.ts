import {
  getAgentMessageConsumptionAttribution,
  materializeAgentMessageConsumptionAttribution,
} from "@app/lib/api/assistant/agent_message_consumption_attribution";
import { getLlmCredentials } from "@app/lib/api/provider_credentials";
import type { Authenticator } from "@app/lib/auth";
import {
  AgentMCPActionModel,
  AgentMCPActionOutputItemModel,
} from "@app/lib/models/agent/actions/mcp";
import { AgentMessageModel } from "@app/lib/models/agent/conversation";
import type { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import { AgentMessageConsumptionItemResource } from "@app/lib/resources/agent_message_consumption_item_resource";
import { RunResource } from "@app/lib/resources/run_resource";
import { generateRandomModelSId } from "@app/lib/resources/string_ids_server";
import { tokenCountForTexts } from "@app/lib/tokenization";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { AgentMCPActionFactory } from "@app/tests/utils/AgentMCPActionFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import type { AgentMessageType } from "@app/types/assistant/conversation";
import { GPT_5_MINI_MODEL_CONFIG } from "@app/types/assistant/models/openai";
import type { ModelId } from "@app/types/shared/model_id";
import { Err, Ok } from "@app/types/shared/result";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/api/provider_credentials", () => ({
  getLlmCredentials: vi.fn(),
}));

vi.mock("@app/lib/tokenization", () => ({
  tokenCountForTexts: vi.fn(),
}));

describe("agent message consumption attribution", () => {
  beforeEach(() => {
    vi.mocked(getLlmCredentials).mockReset();
    vi.mocked(tokenCountForTexts).mockReset();
  });

  it("inserts a complete model attribution once", async () => {
    const { authenticator: auth, workspace } = await createResourceTest({});
    const agentConfig = await AgentConfigurationFactory.createTestAgent(auth);
    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: agentConfig.sId,
      messagesCreatedAt: [],
    });
    const { agentMessage } = await ConversationFactory.createAgentMessage(
      auth,
      { workspace, conversation, agentConfig }
    );
    const run = await createRunWithUsage(auth, workspace.id, {
      promptTokens: 100,
      completionTokens: 20,
      reasoningTokens: 5,
    });
    await attachRunToMessage(agentMessage, run.dustRunId, workspace.id);

    const firstResult = await materializeAgentMessageConsumptionAttribution(
      auth,
      { agentMessageId: agentMessage.sId }
    );
    const secondResult = await materializeAgentMessageConsumptionAttribution(
      auth,
      { agentMessageId: agentMessage.sId }
    );

    expect(firstResult.isOk()).toBe(true);
    expect(secondResult.isOk()).toBe(true);
    const items = await listItems(auth, agentMessage.agentMessageId);
    expect(items).toHaveLength(3);
    expect(items.map((item) => item.itemType)).toEqual([
      "input",
      "output",
      "reasoning",
    ]);
    expect(
      items.find((item) => item.itemType === "input")?.inputTokensCount
    ).toBe(100);
    expect(
      items.find((item) => item.itemType === "output")?.outputTokensCount
    ).toBe(15);
    expect(
      items.find((item) => item.itemType === "reasoning")?.outputTokensCount
    ).toBe(5);
    expect(items.every((item) => item.completedAt !== null)).toBe(true);

    const readResult = await getAgentMessageConsumptionAttribution(auth, {
      agentMessageId: agentMessage.sId,
    });
    expect(readResult.isOk()).toBe(true);
    if (readResult.isErr()) {
      throw readResult.error;
    }
    expect(readResult.value?.items).toHaveLength(3);
  });

  it("maps tool input to its result and output to its emitted call", async () => {
    const { authenticator: auth, workspace } = await createResourceTest({});
    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: generateRandomModelSId(),
      messagesCreatedAt: [],
    });
    const { agentMessage, action } =
      await AgentMCPActionFactory.createWithAgentMessage(auth, {
        workspace,
        conversation,
        status: "succeeded",
      });
    const run = await createRunWithUsage(auth, workspace.id, {
      promptTokens: 100,
      completionTokens: 20,
      reasoningTokens: 5,
    });
    await attachRunToMessage(agentMessage, run.dustRunId, workspace.id);
    await createToolOutput(workspace.id, action.id);
    vi.mocked(tokenCountForTexts)
      .mockResolvedValueOnce(new Ok([8]))
      .mockResolvedValueOnce(new Ok([12]));

    const result = await materializeAgentMessageConsumptionAttribution(auth, {
      agentMessageId: agentMessage.sId,
      evidence: [emittingEvidence(run, [action])],
      directToolCreditAmounts: [
        { actionModelId: action.id, directCreditAmountMicro: 3_000_000 },
      ],
    });
    if (result.isErr()) {
      throw result.error;
    }

    const items = await listItems(auth, agentMessage.agentMessageId);
    const toolItem = items.find((item) => item.itemType === "tool");
    expect(toolItem).toMatchObject({
      inputTokensCount: 12,
      outputTokensCount: 8,
      directCreditAmountMicro: 3_000_000,
    });
    expect(toolItem?.completedAt).not.toBeNull();
    expect(toolItem?.grossAttributedCreditAmountMicro).toBeGreaterThanOrEqual(
      3_000_000
    );

    const tokenizedToolCall: unknown = JSON.parse(
      vi.mocked(tokenCountForTexts).mock.calls[0][0][0]
    );
    expect(tokenizedToolCall).toEqual({
      name: "test_tool",
      arguments: "{}",
    });
    const tokenizedToolResult: unknown = JSON.parse(
      vi.mocked(tokenCountForTexts).mock.calls[1][0][0]
    );
    expect(tokenizedToolResult).toEqual({
      name: "test_tool",
      result: [{ type: "text", text: "tool result" }],
    });
    expect(
      items.reduce((total, item) => total + (item.outputTokensCount ?? 0), 0)
    ).toBe(20);

    const readResult = await getAgentMessageConsumptionAttribution(auth, {
      agentMessageId: agentMessage.sId,
    });
    expect(readResult.isOk()).toBe(true);
    if (readResult.isErr()) {
      throw readResult.error;
    }
    expect(
      readResult.value?.items.find((item) => item.itemType === "tool")
    ).toMatchObject({
      inputTokensCount: 12,
      outputTokensCount: 8,
      tool: {
        actionId: action.sId,
        displayName: "Test Tool",
        functionCallName: "test_tool",
      },
    });
  });

  it("normalizes parallel tool calls within the provider completion total", async () => {
    const { authenticator: auth, workspace } = await createResourceTest({});
    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: generateRandomModelSId(),
      messagesCreatedAt: [],
    });
    const { agentMessage, action: firstAction } =
      await AgentMCPActionFactory.createWithAgentMessage(auth, {
        workspace,
        conversation,
        status: "succeeded",
      });
    const remainingActions: AgentMCPActionResource[] = [];
    for (let index = 0; index < 4; index++) {
      const { action } = await AgentMCPActionFactory.create(auth, {
        workspace,
        conversationModelId: conversation.id,
        agentMessageModelId: agentMessage.agentMessageId,
        status: "succeeded",
      });
      remainingActions.push(action);
    }
    const actions = [firstAction, ...remainingActions];
    const run = await createRunWithUsage(auth, workspace.id, {
      promptTokens: 100,
      completionTokens: 25,
      reasoningTokens: 5,
    });
    await attachRunToMessage(agentMessage, run.dustRunId, workspace.id);
    vi.mocked(tokenCountForTexts).mockResolvedValueOnce(
      new Ok([10, 10, 10, 10, 10])
    );

    const result = await materializeAgentMessageConsumptionAttribution(auth, {
      agentMessageId: agentMessage.sId,
      evidence: [emittingEvidence(run, actions)],
      directToolCreditAmounts: actions.map((action) => ({
        actionModelId: action.id,
        directCreditAmountMicro: null,
      })),
    });
    expect(result.isOk()).toBe(true);

    const items = await listItems(auth, agentMessage.agentMessageId);
    const toolItems = items.filter((item) => item.itemType === "tool");
    expect(toolItems.map((item) => item.outputTokensCount)).toEqual([
      4, 4, 4, 4, 4,
    ]);
    expect(
      items.reduce((total, item) => total + (item.outputTokensCount ?? 0), 0)
    ).toBe(25);
  });

  it("preserves approval evidence when the tool advances before analytics", async () => {
    const { authenticator: auth, workspace } = await createResourceTest({});
    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: generateRandomModelSId(),
      messagesCreatedAt: [],
    });
    const { agentMessage, action } =
      await AgentMCPActionFactory.createWithAgentMessage(auth, {
        workspace,
        conversation,
        status: "blocked_validation_required",
      });
    const run = await createRunWithUsage(auth, workspace.id, {
      promptTokens: 100,
      completionTokens: 20,
      reasoningTokens: 5,
    });
    await attachRunToMessage(agentMessage, run.dustRunId, workspace.id);
    vi.mocked(tokenCountForTexts).mockResolvedValue(new Ok([8]));
    await AgentMCPActionModel.update(
      { status: "succeeded" },
      { where: { id: action.id, workspaceId: workspace.id } }
    );

    const firstResult = await materializeAgentMessageConsumptionAttribution(
      auth,
      {
        agentMessageId: agentMessage.sId,
        evidence: [emittingEvidence(run, [action])],
      }
    );
    expect(firstResult.isOk()).toBe(true);
    const pendingItems = await listItems(auth, agentMessage.agentMessageId);
    expect(
      pendingItems.filter((item) => item.completedAt === null)
    ).toHaveLength(1);
    expect(
      pendingItems.find((item) => item.completedAt === null)
    ).toMatchObject({
      itemType: "tool",
      inputTokensCount: null,
      outputTokensCount: 8,
      directCreditAmountMicro: null,
    });

    await createToolOutput(workspace.id, action.id);
    vi.mocked(tokenCountForTexts)
      .mockReset()
      .mockResolvedValueOnce(new Ok([12]));
    const resumedResult = await materializeAgentMessageConsumptionAttribution(
      auth,
      {
        agentMessageId: agentMessage.sId,
        directToolCreditAmounts: [
          { actionModelId: action.id, directCreditAmountMicro: null },
        ],
      }
    );
    expect(resumedResult.isOk()).toBe(true);

    const completedItems = await listItems(auth, agentMessage.agentMessageId);
    expect(completedItems.filter((item) => item.completedAt === null)).toEqual(
      []
    );
    expect(
      completedItems.find((item) => item.itemType === "tool")
    ).toMatchObject({
      inputTokensCount: 12,
      outputTokensCount: 8,
    });
    expect(tokenCountForTexts).toHaveBeenCalledTimes(1);
  });

  it("does not write partial facts when tokenization fails", async () => {
    const { authenticator: auth, workspace } = await createResourceTest({});
    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: generateRandomModelSId(),
      messagesCreatedAt: [],
    });
    const { agentMessage, action } =
      await AgentMCPActionFactory.createWithAgentMessage(auth, {
        workspace,
        conversation,
        status: "succeeded",
      });
    const run = await createRunWithUsage(auth, workspace.id, {
      promptTokens: 100,
      completionTokens: 20,
      reasoningTokens: 5,
    });
    await attachRunToMessage(agentMessage, run.dustRunId, workspace.id);
    const evidence = [emittingEvidence(run, [action])];
    const directToolCreditAmounts = [
      { actionModelId: action.id, directCreditAmountMicro: null },
    ];
    vi.mocked(tokenCountForTexts).mockResolvedValueOnce(
      new Err(new Error("tokenizer unavailable"))
    );

    const firstResult = await materializeAgentMessageConsumptionAttribution(
      auth,
      { agentMessageId: agentMessage.sId, evidence, directToolCreditAmounts }
    );
    expect(firstResult.isErr()).toBe(true);
    expect(await listItems(auth, agentMessage.agentMessageId)).toEqual([]);

    vi.mocked(tokenCountForTexts).mockResolvedValueOnce(new Ok([8]));
    const retryResult = await materializeAgentMessageConsumptionAttribution(
      auth,
      { agentMessageId: agentMessage.sId, evidence, directToolCreditAmounts }
    );
    expect(retryResult.isOk()).toBe(true);
    expect(await listItems(auth, agentMessage.agentMessageId)).toHaveLength(4);
  });

  it("completes output-only tools when the message cannot resume", async () => {
    const { authenticator: auth, workspace } = await createResourceTest({});
    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: generateRandomModelSId(),
      messagesCreatedAt: [],
    });
    const { agentMessage, action } =
      await AgentMCPActionFactory.createWithAgentMessage(auth, {
        workspace,
        conversation,
        status: "blocked_validation_required",
      });
    const run = await createRunWithUsage(auth, workspace.id, {
      promptTokens: 100,
      completionTokens: 20,
      reasoningTokens: 5,
    });
    await attachRunToMessage(agentMessage, run.dustRunId, workspace.id);
    vi.mocked(tokenCountForTexts).mockResolvedValueOnce(new Ok([8]));

    const pendingResult = await materializeAgentMessageConsumptionAttribution(
      auth,
      {
        agentMessageId: agentMessage.sId,
        evidence: [emittingEvidence(run, [action])],
        messageStatus: "created",
      }
    );
    expect(pendingResult.isOk()).toBe(true);
    expect(
      (await listItems(auth, agentMessage.agentMessageId)).find(
        (item) => item.itemType === "tool"
      )?.completedAt
    ).toBeNull();

    const result = await materializeAgentMessageConsumptionAttribution(auth, {
      agentMessageId: agentMessage.sId,
      messageStatus: "cancelled",
    });
    expect(result.isOk()).toBe(true);

    const toolItem = (await listItems(auth, agentMessage.agentMessageId)).find(
      (item) => item.itemType === "tool"
    );
    expect(toolItem).toMatchObject({
      inputTokensCount: null,
      outputTokensCount: 8,
      directCreditAmountMicro: null,
    });
    expect(toolItem?.completedAt).not.toBeNull();
  });

  it("completes a denied tool without inventing result input", async () => {
    const { authenticator: auth, workspace } = await createResourceTest({});
    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: generateRandomModelSId(),
      messagesCreatedAt: [],
    });
    const { agentMessage, action } =
      await AgentMCPActionFactory.createWithAgentMessage(auth, {
        workspace,
        conversation,
        status: "denied",
      });
    const run = await createRunWithUsage(auth, workspace.id, {
      promptTokens: 100,
      completionTokens: 20,
      reasoningTokens: 5,
    });
    await attachRunToMessage(agentMessage, run.dustRunId, workspace.id);
    vi.mocked(tokenCountForTexts).mockResolvedValueOnce(new Ok([8]));

    const result = await materializeAgentMessageConsumptionAttribution(auth, {
      agentMessageId: agentMessage.sId,
      evidence: [emittingEvidence(run, [action])],
      directToolCreditAmounts: [
        { actionModelId: action.id, directCreditAmountMicro: null },
      ],
    });
    expect(result.isOk()).toBe(true);

    const toolItem = (await listItems(auth, agentMessage.agentMessageId)).find(
      (item) => item.itemType === "tool"
    );
    expect(toolItem).toMatchObject({
      inputTokensCount: null,
      outputTokensCount: 8,
      directCreditAmountMicro: null,
    });
    expect(toolItem?.completedAt).not.toBeNull();
    expect(tokenCountForTexts).toHaveBeenCalledTimes(1);
  });

  it("rejects emitting run evidence owned by another message", async () => {
    const { authenticator: auth, workspace } = await createResourceTest({});
    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: generateRandomModelSId(),
      messagesCreatedAt: [],
    });
    const { agentMessage, action } =
      await AgentMCPActionFactory.createWithAgentMessage(auth, {
        workspace,
        conversation,
      });
    const foreignRun = await createRunWithUsage(auth, workspace.id, {
      promptTokens: 50,
      completionTokens: 10,
      reasoningTokens: 0,
    });

    const result = await materializeAgentMessageConsumptionAttribution(auth, {
      agentMessageId: agentMessage.sId,
      evidence: [emittingEvidence(foreignRun, [action])],
    });
    expect(result.isErr()).toBe(true);
  });

  it("attributes a sandbox child action without an emitting model usage", async () => {
    const { authenticator: auth, workspace } = await createResourceTest({});
    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: generateRandomModelSId(),
      messagesCreatedAt: [],
    });
    const { agentMessage, action } =
      await AgentMCPActionFactory.createWithAgentMessage(auth, {
        workspace,
        conversation,
        status: "succeeded",
      });
    await AgentMCPActionModel.update(
      {
        stepContext: {
          ...action.stepContext,
          sandboxChildActionInfo: { parentActionId: generateRandomModelSId() },
        },
      },
      { where: { id: action.id, workspaceId: workspace.id } }
    );

    const result = await materializeAgentMessageConsumptionAttribution(auth, {
      agentMessageId: agentMessage.sId,
      directToolCreditAmounts: [
        { actionModelId: action.id, directCreditAmountMicro: 3_000_000 },
      ],
    });
    expect(result.isOk()).toBe(true);

    const items = await listItems(auth, agentMessage.agentMessageId);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      itemType: "tool",
      runUsageId: null,
      inputTokensCount: null,
      outputTokensCount: null,
      directCreditAmountMicro: 3_000_000,
    });
  });

  it("prevents non-tool pending rows at the ORM boundary", async () => {
    const { authenticator: auth, workspace } = await createResourceTest({});
    const agentConfig = await AgentConfigurationFactory.createTestAgent(auth);
    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: agentConfig.sId,
      messagesCreatedAt: [],
    });
    const { agentMessage } = await ConversationFactory.createAgentMessage(
      auth,
      { workspace, conversation, agentConfig }
    );
    const run = await createRunWithUsage(auth, workspace.id, {
      promptTokens: 10,
      completionTokens: 5,
      reasoningTokens: 0,
    });
    const [usage] = await RunResource.listRunUsagesForRuns(auth, {
      runs: [run],
    });
    if (!usage) {
      throw new Error("Run usage not found");
    }

    await expect(
      AgentMessageConsumptionItemResource.model.create({
        workspaceId: workspace.id,
        conversationId: conversation.id,
        agentMessageId: agentMessage.agentMessageId,
        runUsageId: usage.runUsageModelId,
        agentMCPActionId: null,
        itemKey: `run-usage:${usage.runUsageModelId}:input`,
        itemType: "input",
        attributionVersion: 1,
        inputTokensCount: 10,
        outputTokensCount: null,
        grossAttributedCreditAmountMicro: 1,
        directCreditAmountMicro: null,
        completedAt: null,
      })
    ).rejects.toThrow("Only tool attribution items may be pending");
  });
});

function emittingEvidence(run: RunResource, actions: AgentMCPActionResource[]) {
  return {
    dustRunId: run.dustRunId,
    actionModelIds: actions.map((action) => action.id),
  };
}

async function listItems(auth: Authenticator, agentMessageModelId: ModelId) {
  return AgentMessageConsumptionItemResource.listByAgentMessageModelIds(auth, {
    agentMessageModelIds: [agentMessageModelId],
    attributionVersion: 1,
  });
}

async function createToolOutput(
  workspaceModelId: ModelId,
  actionModelId: ModelId
): Promise<void> {
  await AgentMCPActionOutputItemModel.create({
    workspaceId: workspaceModelId,
    agentMCPActionId: actionModelId,
    content: { type: "text", text: "tool result" },
    contentGcsPath: null,
    fileId: null,
    citations: null,
    generatedFilePath: null,
    generatedFileContentType: null,
  });
}

async function createRunWithUsage(
  auth: Authenticator,
  workspaceId: ModelId,
  {
    promptTokens,
    completionTokens,
    reasoningTokens,
  }: {
    promptTokens: number;
    completionTokens: number;
    reasoningTokens: number;
  }
): Promise<RunResource> {
  const run = await RunResource.makeNew({
    appId: null,
    dustRunId: generateRandomModelSId(),
    runType: "deploy",
    useWorkspaceCredentials: false,
    workspaceId,
  });
  await run.recordTokenUsage(
    auth,
    {
      inputTokens: promptTokens,
      totalOutputTokens: completionTokens,
      reasoningTokens,
      totalTokens: promptTokens + completionTokens,
    },
    GPT_5_MINI_MODEL_CONFIG.modelId
  );
  return run;
}

async function attachRunToMessage(
  agentMessage: AgentMessageType,
  dustRunId: string,
  workspaceId: ModelId
): Promise<void> {
  await AgentMessageModel.update(
    { runIds: [dustRunId] },
    {
      where: {
        id: agentMessage.agentMessageId,
        workspaceId,
      },
    }
  );
}
