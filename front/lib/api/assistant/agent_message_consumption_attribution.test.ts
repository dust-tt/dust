import {
  getAgentMessageConsumptionAttribution,
  materializeAgentMessageConsumptionAttribution,
  recordAgentMessageModelCallEvidence,
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
import { RunUsageModel } from "@app/lib/resources/storage/models/runs";
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

  it("materializes a complete, idempotent model attribution", async () => {
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

    const firstResult = await recordAgentMessageModelCallEvidence(auth, {
      agentMessageId: agentMessage.sId,
      dustRunId: run.dustRunId,
      actionModelIds: [],
    });
    const secondResult = await recordAgentMessageModelCallEvidence(auth, {
      agentMessageId: agentMessage.sId,
      dustRunId: run.dustRunId,
      actionModelIds: [],
    });

    expect(firstResult.isOk()).toBe(true);
    expect(secondResult.isOk()).toBe(true);
    const materializeResult =
      await materializeAgentMessageConsumptionAttribution(auth, {
        agentMessageId: agentMessage.sId,
      });
    expect(materializeResult.isOk()).toBe(true);

    const items = await AgentMessageConsumptionItemResource.listByAgentMessage(
      auth,
      {
        agentMessageModelId: agentMessage.agentMessageId,
        attributionVersion: 1,
      }
    );
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

    const readResult = await getAgentMessageConsumptionAttribution(auth, {
      agentMessageId: agentMessage.sId,
    });
    expect(readResult.isOk()).toBe(true);
    if (readResult.isErr()) {
      throw readResult.error;
    }
    expect(readResult.value).not.toBeNull();
    expect(readResult.value?.items).toHaveLength(3);
    expect(readResult.value?.grossAttributedCreditAmountMicro).toBeGreaterThan(
      0
    );
  });

  it("uses the model boundary for tool input and output token semantics", async () => {
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
    vi.mocked(tokenCountForTexts)
      .mockResolvedValueOnce(new Ok([8]))
      .mockResolvedValueOnce(new Ok([12]));

    const modelResult = await recordAgentMessageModelCallEvidence(auth, {
      agentMessageId: agentMessage.sId,
      dustRunId: run.dustRunId,
      actionModelIds: [action.id],
    });
    expect(modelResult.isOk()).toBe(true);

    await AgentMCPActionOutputItemModel.create({
      workspaceId: workspace.id,
      agentMCPActionId: action.id,
      content: { type: "text", text: "tool result" },
      contentGcsPath: null,
      fileId: null,
      citations: null,
      generatedFilePath: null,
      generatedFileContentType: null,
    });

    const toolResult = await materializeAgentMessageConsumptionAttribution(
      auth,
      {
        agentMessageId: agentMessage.sId,
        directToolCreditAmounts: [
          { actionModelId: action.id, directCreditAmountMicro: 3_000_000 },
        ],
      }
    );
    if (toolResult.isErr()) {
      throw toolResult.error;
    }

    const items = await AgentMessageConsumptionItemResource.listByAgentMessage(
      auth,
      {
        agentMessageModelId: agentMessage.agentMessageId,
        attributionVersion: 1,
      }
    );
    const toolItem = items.find((item) => item.itemType === "tool");
    expect(toolItem).toMatchObject({
      inputTokensCount: 12,
      outputTokensCount: 8,
    });
    expect(toolItem?.completedAt).not.toBeNull();
    expect(toolItem?.grossAttributedCreditAmountMicro).toBeGreaterThanOrEqual(
      toolItem?.directCreditAmountMicro ?? 0
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

    const outputTokensCount = items.reduce(
      (total, item) => total + (item.outputTokensCount ?? 0),
      0
    );
    expect(outputTokensCount).toBe(20);

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
        internalMCPServerName: null,
        toolName: "test_tool",
      },
    });
  });

  it("normalizes parallel tool calls together within the provider completion total", async () => {
    const { authenticator: auth, workspace } = await createResourceTest({});
    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: generateRandomModelSId(),
      messagesCreatedAt: [],
    });
    const { agentMessage, action: firstAction } =
      await AgentMCPActionFactory.createWithAgentMessage(auth, {
        workspace,
        conversation,
      });
    const remainingActions: AgentMCPActionResource[] = [];
    for (let index = 0; index < 4; index++) {
      const { action } = await AgentMCPActionFactory.create(auth, {
        workspace,
        conversationModelId: conversation.id,
        agentMessageModelId: agentMessage.agentMessageId,
      });
      remainingActions.push(action);
    }
    const actions = [firstAction, ...remainingActions];
    const run = await createRunWithUsage(auth, workspace.id, {
      promptTokens: 100,
      completionTokens: 25,
      reasoningTokens: 5,
    });
    vi.mocked(tokenCountForTexts).mockResolvedValueOnce(
      new Ok([10, 10, 10, 10, 10])
    );
    await attachRunToMessage(agentMessage, run.dustRunId, workspace.id);

    const result = await recordAgentMessageModelCallEvidence(auth, {
      agentMessageId: agentMessage.sId,
      dustRunId: run.dustRunId,
      actionModelIds: actions.map((action) => action.id),
    });
    expect(result.isOk()).toBe(true);
    const materializeResult =
      await materializeAgentMessageConsumptionAttribution(auth, {
        agentMessageId: agentMessage.sId,
        directToolCreditAmounts: actions.map((action) => ({
          actionModelId: action.id,
          directCreditAmountMicro: 3_000_000,
        })),
      });
    expect(materializeResult.isOk()).toBe(true);

    const items = await AgentMessageConsumptionItemResource.listByAgentMessage(
      auth,
      {
        agentMessageModelId: agentMessage.agentMessageId,
        attributionVersion: 1,
      }
    );
    const toolItems = items.filter((item) => item.itemType === "tool");
    expect(toolItems).toHaveLength(5);
    expect(toolItems.map((item) => item.outputTokensCount)).toEqual([
      4, 4, 4, 4, 4,
    ]);
    expect(
      items.reduce((total, item) => total + (item.outputTokensCount ?? 0), 0)
    ).toBe(25);
  });

  it("completes a denied tool without inventing result input tokens", async () => {
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

    const modelResult = await recordAgentMessageModelCallEvidence(auth, {
      agentMessageId: agentMessage.sId,
      dustRunId: run.dustRunId,
      actionModelIds: [action.id],
    });
    expect(modelResult.isOk()).toBe(true);

    const completionResult =
      await materializeAgentMessageConsumptionAttribution(auth, {
        agentMessageId: agentMessage.sId,
        directToolCreditAmounts: [
          { actionModelId: action.id, directCreditAmountMicro: 3_000_000 },
        ],
      });
    expect(completionResult.isOk()).toBe(true);

    const items = await AgentMessageConsumptionItemResource.listByAgentMessage(
      auth,
      {
        agentMessageModelId: agentMessage.agentMessageId,
        attributionVersion: 1,
      }
    );
    expect(items.find((item) => item.itemType === "tool")).toMatchObject({
      inputTokensCount: null,
      outputTokensCount: 8,
    });
    expect(
      items.find((item) => item.itemType === "tool")?.completedAt
    ).not.toBeNull();
    expect(tokenCountForTexts).toHaveBeenCalledTimes(1);
  });

  it("does not complete a tool before a failed model partition can retry", async () => {
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
    const evidenceResult = await recordAgentMessageModelCallEvidence(auth, {
      agentMessageId: agentMessage.sId,
      dustRunId: run.dustRunId,
      actionModelIds: [action.id],
    });
    expect(evidenceResult.isOk()).toBe(true);
    vi.mocked(tokenCountForTexts)
      .mockResolvedValueOnce(new Err(new Error("tokenizer unavailable")))
      .mockResolvedValueOnce(new Ok([8]));

    const directToolCreditAmounts = [
      { actionModelId: action.id, directCreditAmountMicro: 3_000_000 },
    ];
    const firstResult = await materializeAgentMessageConsumptionAttribution(
      auth,
      { agentMessageId: agentMessage.sId, directToolCreditAmounts }
    );
    expect(firstResult.isErr()).toBe(true);
    const pendingItem = await AgentMessageConsumptionItemResource.findToolItem(
      auth,
      {
        agentMCPActionModelId: action.id,
        attributionVersion: 1,
      }
    );
    expect(pendingItem?.completedAt).toBeNull();
    expect(pendingItem?.outputTokensCount).toBeNull();

    const retryResult = await materializeAgentMessageConsumptionAttribution(
      auth,
      { agentMessageId: agentMessage.sId, directToolCreditAmounts }
    );
    expect(retryResult.isOk()).toBe(true);
    const completedItem =
      await AgentMessageConsumptionItemResource.findToolItem(auth, {
        agentMCPActionModelId: action.id,
        attributionVersion: 1,
      });
    expect(completedItem?.completedAt).not.toBeNull();
    expect(completedItem?.outputTokensCount).toBe(8);
  });

  it("rebuilds model-only attribution in the background", async () => {
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
      promptTokens: 50,
      completionTokens: 10,
      reasoningTokens: 2,
    });
    await attachRunToMessage(agentMessage, run.dustRunId, workspace.id);

    const result = await materializeAgentMessageConsumptionAttribution(auth, {
      agentMessageId: agentMessage.sId,
    });
    expect(result.isOk()).toBe(true);

    const readResult = await getAgentMessageConsumptionAttribution(auth, {
      agentMessageId: agentMessage.sId,
    });
    expect(readResult.isOk() && readResult.value).not.toBeNull();
  });

  it("rejects a run owned by another agent message", async () => {
    const { authenticator: auth, workspace } = await createResourceTest({});
    const agentConfig = await AgentConfigurationFactory.createTestAgent(auth);
    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: agentConfig.sId,
      messagesCreatedAt: [],
    });
    const { agentMessage: firstMessage } =
      await ConversationFactory.createAgentMessage(auth, {
        workspace,
        conversation,
        agentConfig,
      });
    const secondConversation = await ConversationFactory.create(auth, {
      agentConfigurationId: agentConfig.sId,
      messagesCreatedAt: [],
    });
    const { agentMessage: secondMessage } =
      await ConversationFactory.createAgentMessage(auth, {
        workspace,
        conversation: secondConversation,
        agentConfig,
      });
    const run = await createRunWithUsage(auth, workspace.id, {
      promptTokens: 50,
      completionTokens: 10,
      reasoningTokens: 0,
    });
    await attachRunToMessage(secondMessage, run.dustRunId, workspace.id);

    const result = await recordAgentMessageModelCallEvidence(auth, {
      agentMessageId: firstMessage.sId,
      dustRunId: run.dustRunId,
      actionModelIds: [],
    });
    expect(result.isErr()).toBe(true);
  });

  it("attributes sandbox child actions without an emitting model usage", async () => {
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

    const items = await AgentMessageConsumptionItemResource.listByAgentMessage(
      auth,
      {
        agentMessageModelId: agentMessage.agentMessageId,
        attributionVersion: 1,
      }
    );
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      itemType: "tool",
      runUsageId: null,
      inputTokensCount: null,
      outputTokensCount: null,
    });
    expect(items[0].completedAt).not.toBeNull();
  });

  it("cascades attribution when its run usage is hard deleted", async () => {
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
      promptTokens: 50,
      completionTokens: 10,
      reasoningTokens: 0,
    });
    await attachRunToMessage(agentMessage, run.dustRunId, workspace.id);
    const materializeResult =
      await materializeAgentMessageConsumptionAttribution(auth, {
        agentMessageId: agentMessage.sId,
      });
    expect(materializeResult.isOk()).toBe(true);

    await RunUsageModel.destroy({
      where: { runId: run.id, workspaceId: workspace.id },
    });
    const remainingItems =
      await AgentMessageConsumptionItemResource.listByAgentMessage(auth, {
        agentMessageModelId: agentMessage.agentMessageId,
        attributionVersion: 1,
      });
    expect(remainingItems).toHaveLength(0);
  });
});

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
