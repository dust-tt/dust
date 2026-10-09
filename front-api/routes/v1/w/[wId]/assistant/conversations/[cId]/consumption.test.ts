import { AGENT_MESSAGE_CONSUMPTION_ATTRIBUTION_VERSION } from "@app/lib/api/assistant/agent_message_consumption_attribution/attribution_builder";
import { Authenticator } from "@app/lib/auth";
import { AgentMessageConsumptionItemResource } from "@app/lib/resources/agent_message_consumption_item_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import type { KeyResource } from "@app/lib/resources/key_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { AgentMCPActionFactory } from "@app/tests/utils/AgentMCPActionFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createPublicApiMockRequest } from "@app/tests/utils/generic_public_api_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { RunFactory } from "@app/tests/utils/RunFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import type { AgentMessageType } from "@app/types/assistant/conversation";
import type { ModelId } from "@app/types/shared/model_id";
import type { WorkspaceType } from "@app/types/user";
import { honoApp } from "@front-api/app";
import { assert, beforeEach, describe, expect, it } from "vitest";

const BILLED_CREDITS = 7;

describe("GET /api/v1/w/:wId/assistant/conversations/:cId/consumption", () => {
  let auth: Authenticator;
  let workspace: WorkspaceType;
  let key: KeyResource;
  let conversation: ConversationResource;
  let agentConfiguration: LightAgentConfigurationType;
  let agentMessage: AgentMessageType;
  let runUsageModelId: ModelId;
  let dustRunId: string;

  beforeEach(async () => {
    const request = await createPublicApiMockRequest({ method: "GET" });
    workspace = request.workspace;
    key = request.key;
    const owner = await UserFactory.basic();
    await MembershipFactory.associate(workspace, owner, { role: "user" });
    auth = await Authenticator.fromUserIdAndWorkspaceId(
      owner.sId,
      workspace.sId
    );
    agentConfiguration = await AgentConfigurationFactory.createTestAgent(auth);
    const createdConversation = await ConversationFactory.create(auth, {
      agentConfigurationId: agentConfiguration.sId,
      messagesCreatedAt: [],
    });
    const fetchedConversation = await ConversationResource.fetchById(
      auth,
      createdConversation.sId
    );
    assert(fetchedConversation);
    conversation = fetchedConversation;

    const usage = await RunFactory.createWithUsage(auth, {
      inputTokens: 100,
      outputTokens: 20,
      reasoningTokens: 5,
    });
    runUsageModelId = usage.runUsageModelId;
    dustRunId = usage.run.dustRunId;
    const createdMessage = await ConversationFactory.createAgentMessage(auth, {
      workspace,
      conversation,
      agentConfig: agentConfiguration,
      runIds: [dustRunId],
    });
    agentMessage = createdMessage.agentMessage;
    await ConversationResource.updateAgentMessageCostCredits(auth, {
      agentMessageModelId: agentMessage.agentMessageId,
      costCredits: BILLED_CREDITS,
    });
    await ConversationFactory.setAgentMessageStatus({
      workspace,
      agentMessageModelId: agentMessage.agentMessageId,
      status: "succeeded",
    });
  });

  function getConsumption(conversationId = conversation.sId) {
    return honoApp.request(
      `/api/v1/w/${workspace.sId}/assistant/conversations/${conversationId}/consumption`,
      { headers: { authorization: `Bearer ${key.secret}` } }
    );
  }

  it("returns reconciled agent, model and tool attribution with a regular API key", async () => {
    const { action } = await AgentMCPActionFactory.create(auth, {
      workspace,
      conversationModelId: conversation.id,
      agentMessageModelId: agentMessage.agentMessageId,
      status: "succeeded",
      dustRunId,
    });
    await AgentMessageConsumptionItemResource.recordItemsIdempotently(auth, {
      conversation,
      agentMessageModelId: agentMessage.agentMessageId,
      attributionVersion: AGENT_MESSAGE_CONSUMPTION_ATTRIBUTION_VERSION,
      records: [
        {
          itemType: "input",
          runUsageModelId,
          inputTokensCount: 80,
          grossAttributedCreditAmountMicro: 8_000_000,
        },
        {
          itemType: "output",
          runUsageModelId,
          outputTokensCount: 10,
          grossAttributedCreditAmountMicro: 1_000_000,
        },
        {
          itemType: "reasoning",
          runUsageModelId,
          outputTokensCount: 5,
          grossAttributedCreditAmountMicro: 1_000_000,
        },
        {
          itemType: "tool",
          runUsageModelId,
          action,
          attributedSkillIds: [],
          inputTokensCount: 20,
          outputTokensCount: 5,
          grossAttributedCreditAmountMicro: 2_000_000,
          directCreditAmountMicro: 1_000_000,
        },
      ],
      pendingToolItems: [],
    });

    const response = await getConsumption();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      billedCredits: BILLED_CREDITS,
      details: {
        agentWorkCredits: 5,
        tools: [
          {
            toolName: "test_tool",
            callCount: 1,
            attributedCredits: 2,
            directCredits: 1,
            pending: false,
          },
        ],
        models: [
          { providerId: "openai", modelId: "gpt-5-mini", attributedCredits: 7 },
        ],
        agents: [
          {
            agentId: agentConfiguration.sId,
            billedCredits: BILLED_CREDITS,
            agentWorkCredits: 5,
            tools: [{ toolName: "test_tool", attributedCredits: 2 }],
            models: [{ modelId: "gpt-5-mini", attributedCredits: 7 }],
          },
        ],
      },
    });
  });

  it("preserves the bill when attribution is unavailable", async () => {
    const response = await getConsumption();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      billedCredits: BILLED_CREDITS,
      details: null,
    });
  });

  it("excludes in-progress messages from the stable bill", async () => {
    await ConversationFactory.setAgentMessageStatus({
      workspace,
      agentMessageModelId: agentMessage.agentMessageId,
      status: "created",
    });

    const response = await getConsumption();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      billedCredits: 0,
      details: null,
    });
  });

  it("rejects unauthenticated requests", async () => {
    const response = await honoApp.request(
      `/api/v1/w/${workspace.sId}/assistant/conversations/${conversation.sId}/consumption`
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: { type: "not_authenticated" },
    });
  });

  it("returns not found for an unknown conversation", async () => {
    const response = await getConsumption("missing-conversation");

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: { type: "conversation_not_found" },
    });
  });

  it("does not expose another workspace's consumption", async () => {
    const other = await createPublicApiMockRequest({ method: "GET" });
    const response = await honoApp.request(
      `/api/v1/w/${other.workspace.sId}/assistant/conversations/${conversation.sId}/consumption`,
      { headers: { authorization: `Bearer ${other.key.secret}` } }
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: { type: "conversation_not_found" },
    });
  });

  it("does not expose conversations in spaces the key cannot read", async () => {
    const restrictedSpace = await SpaceFactory.regular(workspace);
    await ConversationFactory.setRequestedSpaceIdsForTest(
      conversation.id,
      workspace.id,
      [restrictedSpace.id]
    );

    const response = await getConsumption();

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: { type: "conversation_not_found" },
    });
  });

  it("does not expose deleted conversations", async () => {
    const deletedConversation = await ConversationFactory.create(auth, {
      agentConfigurationId: agentConfiguration.sId,
      messagesCreatedAt: [],
      visibility: "deleted",
    });

    const response = await getConsumption(deletedConversation.sId);

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: { type: "conversation_not_found" },
    });
  });
});
