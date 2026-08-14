import { buildAgentMessageConsumptionAnalyticsDocuments } from "@app/lib/analytics/agent_message_consumption/documents";
import { loadAgentMessageConsumptionAnalyticsInput } from "@app/lib/analytics/agent_message_consumption/load";
import { makeEnableSkillResultOutput } from "@app/lib/api/actions/servers/skill_management/rendering";
import { AGENT_MESSAGE_CONSUMPTION_ATTRIBUTION_VERSION } from "@app/lib/api/assistant/agent_message_consumption_attribution/attribution_builder";
import { USAGE_TYPE_USER } from "@app/lib/metronome/constants";
import { intelligenceAwuFromRunUsagesGroupedByRunKey } from "@app/lib/metronome/events";
import { AgentMessageModel } from "@app/lib/models/agent/conversation";
import { AgentMessageConsumptionItemResource } from "@app/lib/resources/agent_message_consumption_item_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { RemoteMCPServerToolMetadataResource } from "@app/lib/resources/remote_mcp_server_tool_metadata_resource";
import { RunResource } from "@app/lib/resources/run_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { AgentMCPActionFactory } from "@app/tests/utils/AgentMCPActionFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MCPServerViewFactory } from "@app/tests/utils/MCPServerViewFactory";
import { RemoteMCPServerFactory } from "@app/tests/utils/RemoteMCPServerFactory";
import { RunFactory } from "@app/tests/utils/RunFactory";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import type { AgentMessageConsumptionAnalyticsData } from "@app/types/assistant/analytics";
import type { UserMessageOrigin } from "@app/types/assistant/conversation";
import { GPT_5_MINI_MODEL_CONFIG } from "@app/types/assistant/models/openai";
import { describe, expect, it } from "vitest";

type ResourceTestContext = Awaited<ReturnType<typeof createResourceTest>>;

type SettledMessageOptions = {
  agentName?: string;
  agenticOriginMessageId?: string;
  depth?: number;
  origin?: UserMessageOrigin;
  testContext?: ResourceTestContext;
};

async function setupSettledMessage({
  agentName,
  agenticOriginMessageId,
  depth = 0,
  origin,
  testContext,
}: SettledMessageOptions = {}) {
  const resourceTestContext =
    testContext ?? (await createResourceTest({ role: "admin" }));
  const { authenticator: auth, globalSpace, workspace } = resourceTestContext;
  const agent = await AgentConfigurationFactory.createTestAgent(auth, {
    name: agentName,
  });
  const conversationType = await ConversationFactory.create(auth, {
    agentConfigurationId: agent.sId,
    messagesCreatedAt: [],
    depth,
  });
  const conversation = await ConversationResource.fetchById(
    auth,
    conversationType.sId
  );
  if (!conversation) {
    throw new Error("Conversation was not created");
  }
  const userMessage = agenticOriginMessageId
    ? (
        await ConversationFactory.createUserMessage({
          auth,
          workspace,
          conversation,
          rank: 0,
          content: "Hello",
          agenticMessageType: "run_agent",
          agenticOriginMessageId,
        })
      ).messageRow
    : await ConversationFactory.createUserMessageWithRank({
        auth,
        workspace,
        conversationId: conversation.id,
        rank: 0,
        content: "Hello",
        ...(origin ? { origin } : {}),
      });
  const { run, runUsageModelId } = await RunFactory.createWithUsage(auth, {
    inputTokens: 100,
    outputTokens: 20,
    modelId: GPT_5_MINI_MODEL_CONFIG.modelId,
  });
  const agentMessage = await ConversationFactory.createAgentMessageWithRank({
    workspace,
    conversationId: conversation.id,
    rank: 1,
    parentId: userMessage.id,
    agentConfigurationId: agent.sId,
    agentConfigurationVersion: agent.version,
    resolvedModel: {
      providerId: GPT_5_MINI_MODEL_CONFIG.providerId,
      modelId: GPT_5_MINI_MODEL_CONFIG.modelId,
      reasoningEffort: "none",
    },
    modelResolutionMethod: "agent",
  });
  const agentMessageModelId = agentMessage.agentMessageId;
  if (!agentMessageModelId) {
    throw new Error("Agent message was not created");
  }

  const completedAt = new Date("2026-08-05T12:00:00.000Z");
  await AgentMessageModel.update(
    {
      completedAt,
      costCredits: 5,
      runIds: [run.dustRunId],
      status: "succeeded",
    },
    {
      where: {
        id: agentMessageModelId,
        workspaceId: workspace.id,
      },
    }
  );
  await RunResource.setUsageTypeForRuns(auth, {
    runs: [run],
    usageType: USAGE_TYPE_USER,
  });

  return {
    agent,
    agentMessage,
    agentMessageModelId,
    auth,
    completedAt,
    conversation,
    globalSpace,
    run,
    runUsageModelId,
    testContext: resourceTestContext,
    userMessage,
    workspace,
  };
}

type SettledMessageContext = Awaited<ReturnType<typeof setupSettledMessage>>;

async function setupLlmAndToolConsumptionScenario(
  options?: SettledMessageOptions
): Promise<{
  action: Awaited<ReturnType<typeof AgentMCPActionFactory.create>>["action"];
  billedMessageCreditMicro: number;
  context: SettledMessageContext;
}> {
  const context = await setupSettledMessage(options);
  const { action } = await AgentMCPActionFactory.create(context.auth, {
    workspace: context.workspace,
    conversationModelId: context.conversation.id,
    agentMessageModelId: context.agentMessageModelId,
    dustRunId: context.run.dustRunId,
    status: "succeeded",
  });

  await AgentMessageConsumptionItemResource.recordItemsIdempotently(
    context.auth,
    {
      conversation: context.conversation,
      agentMessageModelId: context.agentMessageModelId,
      attributionVersion: AGENT_MESSAGE_CONSUMPTION_ATTRIBUTION_VERSION,
      records: [
        {
          itemType: "input",
          runUsageModelId: context.runUsageModelId,
          inputTokensCount: 100,
          grossAttributedCreditAmountMicro: 1_000_000,
        },
        {
          itemType: "output",
          runUsageModelId: context.runUsageModelId,
          outputTokensCount: 18,
          grossAttributedCreditAmountMicro: 500_000,
        },
        {
          itemType: "tool",
          runUsageModelId: context.runUsageModelId,
          action,
          inputTokensCount: 2,
          outputTokensCount: 2,
          directCreditAmountMicro: 3_000_000,
          grossAttributedCreditAmountMicro: 3_100_000,
        },
      ],
      pendingToolItems: [],
    }
  );

  const runUsages = await RunResource.listRunUsagesForRuns(context.auth, {
    runs: [context.run],
  });
  const billedLlmCredits = intelligenceAwuFromRunUsagesGroupedByRunKey(
    runUsages,
    "web"
  );
  const billedCredits = billedLlmCredits + 3;
  await ConversationResource.updateAgentMessageCostCredits(context.auth, {
    agentMessageModelId: context.agentMessageModelId,
    costCredits: billedCredits,
  });

  return {
    action,
    billedMessageCreditMicro: billedCredits * 1_000_000,
    context,
  };
}

async function buildDocuments(
  context: SettledMessageContext
): Promise<AgentMessageConsumptionAnalyticsData[] | null> {
  const input = await loadAgentMessageConsumptionAnalyticsInput(context.auth, {
    agentMessageId: context.agentMessage.sId,
  });
  return input ? buildAgentMessageConsumptionAnalyticsDocuments(input) : null;
}

describe("buildAgentMessageConsumptionAnalyticsDocuments", () => {
  it("projects one additive LLM document and one tool document", async () => {
    const { action, billedMessageCreditMicro, context } =
      await setupLlmAndToolConsumptionScenario();
    const documents = await buildDocuments(context);
    if (!documents) {
      throw new Error("Consumption documents were not built");
    }

    const [llmDocument, toolDocument] = documents;
    const toolAttributedCreditMicro = 3_100_000;
    expect(llmDocument).toMatchObject({
      agent: {
        id: context.agent.sId,
        version: context.agent.version.toString(),
        parent_ids: [],
        direct_parent_id: null,
        root_id: context.agent.sId,
        depth: 0,
      },
      agent_message_id: context.agentMessage.sId,
      attribution_version: AGENT_MESSAGE_CONSUMPTION_ATTRIBUTION_VERSION,
      completed_at: context.completedAt.toISOString(),
      consumption_key: `run-usage:${context.runUsageModelId}`,
      consumption_type: "llm",
      conversation_id: context.conversation.sId,
      credit_micro: billedMessageCreditMicro - toolAttributedCreditMicro,
      model: {
        provider_id: GPT_5_MINI_MODEL_CONFIG.providerId,
        model_id: GPT_5_MINI_MODEL_CONFIG.modelId,
        reasoning_effort: "none",
        resolution_method: "agent",
      },
      run_usage_id: context.runUsageModelId.toString(),
      step_index: 1,
      tokens: {
        input: 100,
        output: 18,
      },
      usage_type: USAGE_TYPE_USER,
      user: { id: context.auth.getNonNullableUser().sId },
      workspace_id: context.workspace.sId,
      tool: null,
    });
    expect(toolDocument).toMatchObject({
      consumption_key: `tool-action:${action.id}`,
      consumption_type: "tool",
      credit_micro: toolAttributedCreditMicro,
      gross_credit_micro: {
        input: null,
        direct: 3_000_000,
        output: null,
        result_footprint: null,
        total: 3_100_000,
      },
      status: "succeeded",
      run_usage_id: context.runUsageModelId.toString(),
      step_index: 1,
      tokens: {
        input: null,
        output: 2,
        result_footprint: 2,
      },
      tool: {
        action_id: action.sId,
        name: action.toJSON().toolName,
        parent_server_name: "",
        attributed_skill_ids: [],
      },
    });
    expect(
      (llmDocument?.credit_micro ?? 0) + (toolDocument?.credit_micro ?? 0)
    ).toBe(billedMessageCreditMicro);
    expect(
      (llmDocument?.gross_credit_micro.total ?? 0) +
        (toolDocument?.gross_credit_micro.total ?? 0)
    ).toBe(billedMessageCreditMicro);
  });

  it("normalizes a programmatic origin onto the surface it belongs to", async () => {
    const { context } = await setupLlmAndToolConsumptionScenario({
      origin: "cli_programmatic",
    });
    const documents = await buildDocuments(context);

    expect(documents).not.toHaveLength(0);
    for (const document of documents ?? []) {
      expect(document).toMatchObject({
        context_origin: "cli_programmatic",
        normalized_origin: "cli",
      });
    }
  });

  it("keeps agent ancestry on every document", async () => {
    const parent = await setupSettledMessage({ agentName: "Parent agent" });
    const { context } = await setupLlmAndToolConsumptionScenario({
      agentName: "Child agent",
      agenticOriginMessageId: parent.agentMessage.sId,
      depth: 1,
      testContext: parent.testContext,
    });
    const documents = await buildDocuments(context);
    if (!documents) {
      throw new Error("Consumption documents were not built");
    }

    const expectedAncestry = {
      parent_ids: [parent.agent.sId],
      direct_parent_id: parent.agent.sId,
      root_id: parent.agent.sId,
      depth: 1,
    };
    const llmDocument = documents.find(
      (document) => document.consumption_type === "llm"
    );
    const toolDocument = documents.find(
      (document) => document.consumption_type === "tool"
    );

    expect(llmDocument?.agent).toMatchObject(expectedAncestry);
    expect(toolDocument?.agent).toMatchObject(expectedAncestry);
  });

  it("keeps the parent server on a tool called through the sandbox", async () => {
    const context = await setupSettledMessage();
    const { action: computerAction } = await AgentMCPActionFactory.create(
      context.auth,
      {
        workspace: context.workspace,
        conversationModelId: context.conversation.id,
        agentMessageModelId: context.agentMessageModelId,
        dustRunId: context.run.dustRunId,
        status: "succeeded",
        mcpServerName: "sandbox",
        toolName: "bash",
      }
    );
    const { action: frameAction } = await AgentMCPActionFactory.create(
      context.auth,
      {
        workspace: context.workspace,
        conversationModelId: context.conversation.id,
        agentMessageModelId: context.agentMessageModelId,
        dustRunId: context.run.dustRunId,
        status: "succeeded",
        mcpServerName: "interactive_content",
        toolName: "create_interactive_content_file",
        sandboxChildActionInfo: { parentActionId: computerAction.sId },
        parentAction: computerAction,
      }
    );

    await AgentMessageConsumptionItemResource.recordItemsIdempotently(
      context.auth,
      {
        conversation: context.conversation,
        agentMessageModelId: context.agentMessageModelId,
        attributionVersion: AGENT_MESSAGE_CONSUMPTION_ATTRIBUTION_VERSION,
        records: [
          {
            itemType: "input",
            runUsageModelId: context.runUsageModelId,
            inputTokensCount: 100,
            grossAttributedCreditAmountMicro: 1_500_000,
          },
          {
            itemType: "output",
            runUsageModelId: context.runUsageModelId,
            outputTokensCount: 16,
            grossAttributedCreditAmountMicro: 300_000,
          },
          {
            itemType: "tool",
            runUsageModelId: context.runUsageModelId,
            action: computerAction,
            inputTokensCount: 1,
            outputTokensCount: 1,
            directCreditAmountMicro: 0,
            grossAttributedCreditAmountMicro: 100_000,
          },
          {
            itemType: "tool",
            runUsageModelId: context.runUsageModelId,
            action: frameAction,
            inputTokensCount: 0,
            outputTokensCount: 0,
            directCreditAmountMicro: 3_000_000,
            grossAttributedCreditAmountMicro: 3_000_000,
          },
        ],
        pendingToolItems: [],
      }
    );

    const documents = await buildDocuments(context);
    if (!documents) {
      throw new Error("Consumption documents were not built");
    }

    const computerDocument = documents.find(
      (document) => document.tool?.action_id === computerAction.sId
    );
    const frameDocument = documents.find(
      (document) => document.tool?.action_id === frameAction.sId
    );

    expect(computerDocument?.tool).toMatchObject({
      server_name: "sandbox",
      parent_server_name: "",
    });
    expect(frameDocument).toMatchObject({
      credit_micro: 3_000_000,
      gross_credit_micro: {
        direct: 3_000_000,
        output: null,
        result_footprint: null,
        total: 3_000_000,
      },
      tokens: { output: 0, result_footprint: 0 },
      tool: {
        server_name: "interactive_content",
        parent_server_name: "sandbox",
      },
    });
    expect(
      documents.reduce((total, document) => total + document.credit_micro, 0)
    ).toBe(5_000_000);
  });

  it("reconciles the message bill while preserving full tool attribution", async () => {
    const context = await setupSettledMessage();
    const { action: freeToolAction } = await AgentMCPActionFactory.create(
      context.auth,
      {
        workspace: context.workspace,
        conversationModelId: context.conversation.id,
        agentMessageModelId: context.agentMessage.agentMessageId!,
        dustRunId: context.run.dustRunId,
        status: "succeeded",
      }
    );
    const { action: chargedToolAction } = await AgentMCPActionFactory.create(
      context.auth,
      {
        workspace: context.workspace,
        conversationModelId: context.conversation.id,
        agentMessageModelId: context.agentMessage.agentMessageId!,
        dustRunId: context.run.dustRunId,
        status: "succeeded",
      }
    );

    await AgentMessageConsumptionItemResource.recordItemsIdempotently(
      context.auth,
      {
        conversation: context.conversation,
        agentMessageModelId: context.agentMessage.agentMessageId!,
        attributionVersion: AGENT_MESSAGE_CONSUMPTION_ATTRIBUTION_VERSION,
        records: [
          {
            itemType: "input",
            runUsageModelId: context.runUsageModelId,
            inputTokensCount: 100,
            grossAttributedCreditAmountMicro: 2_000_000,
          },
          {
            itemType: "output",
            runUsageModelId: context.runUsageModelId,
            outputTokensCount: 18,
            grossAttributedCreditAmountMicro: 100_000,
          },
          {
            itemType: "tool",
            runUsageModelId: context.runUsageModelId,
            action: freeToolAction,
            inputTokensCount: 2,
            outputTokensCount: 2,
            directCreditAmountMicro: 0,
            grossAttributedCreditAmountMicro: 300_000,
          },
          {
            itemType: "tool",
            runUsageModelId: context.runUsageModelId,
            action: chargedToolAction,
            inputTokensCount: 2,
            outputTokensCount: 2,
            directCreditAmountMicro: 3_000_000,
            grossAttributedCreditAmountMicro: 3_400_000,
          },
        ],
        pendingToolItems: [],
      }
    );

    const documents = await buildDocuments(context);
    if (!documents) {
      throw new Error("Consumption documents were not built");
    }
    const llmDocument = documents.find(
      (document) => document.consumption_type === "llm"
    );
    const freeToolDocument = documents.find(
      (document) => document.tool?.action_id === freeToolAction.sId
    );
    const chargedToolDocument = documents.find(
      (document) => document.tool?.action_id === chargedToolAction.sId
    );

    expect(documents).toHaveLength(3);
    expect(llmDocument).toMatchObject({
      credit_micro: 1_300_000,
      gross_credit_micro: {
        input: 1_200_000,
        output: 100_000,
        total: 1_300_000,
      },
    });
    expect(freeToolDocument).toMatchObject({
      credit_micro: 300_000,
      gross_credit_micro: {
        input: null,
        direct: 0,
        total: 300_000,
      },
    });
    expect(chargedToolDocument).toMatchObject({
      credit_micro: 3_400_000,
      gross_credit_micro: {
        input: null,
        direct: 3_000_000,
        total: 3_400_000,
      },
    });

    expect(
      documents.every(
        (document) =>
          document.credit_micro === document.gross_credit_micro.total
      )
    ).toBe(true);
    expect(
      documents.reduce((total, document) => total + document.credit_micro, 0)
    ).toBe(5_000_000);
  });

  it("associates a tool with every skill that exposes its server", async () => {
    const context = await setupSettledMessage();
    const server = await RemoteMCPServerFactory.create(context.workspace, {
      description: "Test skill server",
      name: "Test skill server",
      tools: [
        {
          name: "test_tool",
          description: "Test tool",
          inputSchema: undefined,
        },
      ],
    });
    const serverView = await MCPServerViewFactory.create(
      context.workspace,
      server.sId,
      context.globalSpace
    );
    const skillA = await SkillFactory.create(context.auth, {
      name: "Skill A",
      mcpServerViews: [serverView],
    });
    const skillB = await SkillFactory.create(context.auth, {
      name: "Skill B",
      mcpServerViews: [serverView],
    });

    const enableSkillA = await skillA.upsertToConversation(context.auth, {
      conversationId: context.conversation.id,
      enabled: true,
    });
    const enableSkillB = await skillB.upsertToConversation(context.auth, {
      conversationId: context.conversation.id,
      enabled: true,
    });
    if (enableSkillA.isErr() || enableSkillB.isErr()) {
      throw new Error("Skills could not be enabled for the test conversation");
    }
    await SkillResource.snapshotConversationSkillsForMessage(context.auth, {
      agentConfigurationId: context.agent.sId,
      agentMessageId: context.agentMessage.agentMessageId!,
      conversationId: context.conversation.id,
    });

    const { action } = await AgentMCPActionFactory.create(context.auth, {
      workspace: context.workspace,
      conversationModelId: context.conversation.id,
      agentMessageModelId: context.agentMessage.agentMessageId!,
      dustRunId: context.run.dustRunId,
      status: "succeeded",
      toolServerId: server.sId,
    });
    await AgentMessageConsumptionItemResource.recordItemsIdempotently(
      context.auth,
      {
        conversation: context.conversation,
        agentMessageModelId: context.agentMessage.agentMessageId!,
        attributionVersion: AGENT_MESSAGE_CONSUMPTION_ATTRIBUTION_VERSION,
        records: [
          {
            itemType: "input",
            runUsageModelId: context.runUsageModelId,
            inputTokensCount: 100,
            grossAttributedCreditAmountMicro: 4_600_000,
          },
          {
            itemType: "output",
            runUsageModelId: context.runUsageModelId,
            outputTokensCount: 18,
            grossAttributedCreditAmountMicro: 100_000,
          },
          {
            itemType: "tool",
            runUsageModelId: context.runUsageModelId,
            action,
            inputTokensCount: 2,
            outputTokensCount: 2,
            directCreditAmountMicro: 0,
            grossAttributedCreditAmountMicro: 300_000,
          },
        ],
        pendingToolItems: [],
      }
    );

    const documents = await buildDocuments(context);
    if (!documents) {
      throw new Error("Consumption documents were not built");
    }
    const toolDocuments = documents.filter(
      (document) => document.consumption_type === "tool"
    );

    expect(toolDocuments).toHaveLength(1);
    expect(toolDocuments[0]).toMatchObject({
      credit_micro: 300_000,
      tool: {
        action_id: action.sId,
        attributed_skill_ids: expect.arrayContaining([skillA.sId, skillB.sId]),
      },
    });
    expect(toolDocuments[0]?.tool?.attributed_skill_ids).toHaveLength(2);
    expect(
      documents.reduce((total, document) => total + document.credit_micro, 0)
    ).toBe(5_000_000);
  });

  it("does not associate a skill when its tool is disabled", async () => {
    const context = await setupSettledMessage();
    const server = await RemoteMCPServerFactory.create(context.workspace, {
      description: "Test disabled skill server",
      name: "Test disabled skill server",
      tools: [
        {
          name: "disabled_tool",
          description: "Disabled tool",
          inputSchema: undefined,
        },
      ],
    });
    await RemoteMCPServerToolMetadataResource.updateOrCreateSettings(
      context.auth,
      {
        serverSId: server.sId,
        toolName: "disabled_tool",
        permission: "low",
        enabled: false,
      }
    );
    const serverView = await MCPServerViewFactory.create(
      context.workspace,
      server.sId,
      context.globalSpace
    );
    const skill = await SkillFactory.create(context.auth, {
      name: "Skill with disabled tool",
      mcpServerViews: [serverView],
    });

    const enabledSkill = await skill.upsertToConversation(context.auth, {
      conversationId: context.conversation.id,
      enabled: true,
    });
    if (enabledSkill.isErr()) {
      throw new Error("Skill could not be enabled for the test conversation");
    }
    await SkillResource.snapshotConversationSkillsForMessage(context.auth, {
      agentConfigurationId: context.agent.sId,
      agentMessageId: context.agentMessageModelId,
      conversationId: context.conversation.id,
    });

    const { action } = await AgentMCPActionFactory.create(context.auth, {
      workspace: context.workspace,
      conversationModelId: context.conversation.id,
      agentMessageModelId: context.agentMessageModelId,
      dustRunId: context.run.dustRunId,
      status: "succeeded",
      toolName: "disabled_tool",
      toolServerId: server.sId,
    });
    await AgentMessageConsumptionItemResource.recordItemsIdempotently(
      context.auth,
      {
        conversation: context.conversation,
        agentMessageModelId: context.agentMessageModelId,
        attributionVersion: AGENT_MESSAGE_CONSUMPTION_ATTRIBUTION_VERSION,
        records: [
          {
            itemType: "input",
            runUsageModelId: context.runUsageModelId,
            inputTokensCount: 100,
            grossAttributedCreditAmountMicro: 4_600_000,
          },
          {
            itemType: "output",
            runUsageModelId: context.runUsageModelId,
            outputTokensCount: 18,
            grossAttributedCreditAmountMicro: 100_000,
          },
          {
            itemType: "tool",
            runUsageModelId: context.runUsageModelId,
            action,
            inputTokensCount: 2,
            outputTokensCount: 2,
            directCreditAmountMicro: 0,
            grossAttributedCreditAmountMicro: 300_000,
          },
        ],
        pendingToolItems: [],
      }
    );

    const documents = await buildDocuments(context);
    if (!documents) {
      throw new Error("Consumption documents were not built");
    }
    const toolDocument = documents.find(
      (document) => document.tool?.action_id === action.sId
    );

    expect(toolDocument?.tool?.attributed_skill_ids).toEqual([]);
    expect(
      documents.reduce((total, document) => total + document.credit_micro, 0)
    ).toBe(5_000_000);
  });

  it("associates an enable-skill action with the skill it enables", async () => {
    const context = await setupSettledMessage();
    const skill = await SkillFactory.create(context.auth, {
      name: "Enabled by tool",
    });
    const { action } = await AgentMCPActionFactory.create(context.auth, {
      workspace: context.workspace,
      conversationModelId: context.conversation.id,
      agentMessageModelId: context.agentMessageModelId,
      dustRunId: context.run.dustRunId,
      status: "succeeded",
      functionCallName: "skill_management__enable_skill",
      toolName: "enable_skill",
      mcpServerName: "skill_management",
      output: [
        makeEnableSkillResultOutput({
          skillId: skill.sId,
          text: `Skill "${skill.name}" has been enabled.`,
        }),
      ],
    });
    await AgentMessageConsumptionItemResource.recordItemsIdempotently(
      context.auth,
      {
        conversation: context.conversation,
        agentMessageModelId: context.agentMessageModelId,
        attributionVersion: AGENT_MESSAGE_CONSUMPTION_ATTRIBUTION_VERSION,
        records: [
          {
            itemType: "input",
            runUsageModelId: context.runUsageModelId,
            inputTokensCount: 100,
            grossAttributedCreditAmountMicro: 4_600_000,
          },
          {
            itemType: "output",
            runUsageModelId: context.runUsageModelId,
            outputTokensCount: 18,
            grossAttributedCreditAmountMicro: 100_000,
          },
          {
            itemType: "tool",
            runUsageModelId: context.runUsageModelId,
            action,
            inputTokensCount: 2,
            outputTokensCount: 2,
            directCreditAmountMicro: 0,
            grossAttributedCreditAmountMicro: 300_000,
          },
        ],
        pendingToolItems: [],
      }
    );

    const documents = await buildDocuments(context);
    if (!documents) {
      throw new Error("Consumption documents were not built");
    }
    const toolDocument = documents.find(
      (document) => document.tool?.action_id === action.sId
    );

    expect(toolDocument?.tool?.attributed_skill_ids).toEqual([skill.sId]);
    expect(
      documents.reduce((total, document) => total + document.credit_micro, 0)
    ).toBe(5_000_000);
  });
});
