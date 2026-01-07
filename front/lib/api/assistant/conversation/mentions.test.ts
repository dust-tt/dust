import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock signalAgentUsage before importing the module that uses it
vi.mock("@app/lib/api/assistant/agent_usage", () => ({
  signalAgentUsage: vi.fn(),
}));

// Mock runAgentLoopWorkflow before importing the module that uses it
vi.mock("@app/lib/api/assistant/conversation/agent_loop", () => ({
  runAgentLoopWorkflow: vi.fn(),
}));

import { signalAgentUsage } from "@app/lib/api/assistant/agent_usage";
import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { runAgentLoopWorkflow } from "@app/lib/api/assistant/conversation/agent_loop";
import { getConversation } from "@app/lib/api/assistant/conversation/fetch";
import {
  createAgentMessages,
  createUserMentions,
  createUserMessage,
} from "@app/lib/api/assistant/conversation/mentions";
import { Authenticator } from "@app/lib/auth";
import { AgentConfigurationModel } from "@app/lib/models/agent/agent";
import {
  AgentMessageModel,
  ConversationModel,
  ConversationParticipantModel,
  MentionModel,
  MessageModel,
} from "@app/lib/models/agent/conversation";
import { TriggerModel } from "@app/lib/models/agent/triggers/triggers";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import {
  generateRandomModelSId,
  getResourceIdFromSId,
} from "@app/lib/resources/string_ids";
import { withTransaction } from "@app/lib/utils/sql_utils";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import type {
  AgenticMessageData,
  AgentMention,
  AgentMessageTypeWithoutMentions,
  ConversationType,
  ConversationWithoutContentType,
  LightAgentConfigurationType,
  MentionType,
  UserMessageContext,
  WorkspaceType,
} from "@app/types";
import { isRichUserMention } from "@app/types/assistant/mentions";

describe("createAgentMessages", () => {
  let workspace: WorkspaceType;
  let auth: Authenticator;
  let conversation: ConversationWithoutContentType;
  let agentConfig1: LightAgentConfigurationType;
  let agentConfig2: LightAgentConfigurationType;

  beforeEach(async () => {
    // Reset mocks before each test
    vi.clearAllMocks();

    // Create workspace, user, spaces, and groups using the helper
    const setup = await createResourceTest({});
    workspace = setup.workspace;
    auth = setup.authenticator;

    // Create test agent configurations
    agentConfig1 = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Test Agent 1",
      description: "First test agent",
    });

    agentConfig2 = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Test Agent 2",
      description: "Second test agent",
    });

    // Create a conversation using the factory
    conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: agentConfig1.sId,
      messagesCreatedAt: [], // No messages initially
      visibility: "unlisted",
    });
  });

  it("should create agent messages for valid agent mentions", async () => {
    const { messageRow, userMessage } =
      await ConversationFactory.createUserMessage({
        auth,
        workspace,
        conversation,
        content: `Hello @${agentConfig1.name}`,
      });

    const mentions: MentionType[] = [
      {
        configurationId: agentConfig1.sId,
      } satisfies AgentMention,
    ];

    const result = await createAgentMessages(auth, {
      conversation,
      metadata: {
        type: "create",
        mentions,
        agentConfigurations: [agentConfig1],
        skipToolsValidation: false,
        nextMessageRank: 1,
        userMessage,
      },
    });

    expect(result).toHaveLength(1);
    expect(result[0].configuration.sId).toBe(agentConfig1.sId);
    expect(result[0].status).toBe("created");
    expect(result[0].skipToolsValidation).toBe(false);

    // Verify database records were created
    const mentionInDb = await MentionModel.findOne({
      where: {
        workspaceId: workspace.id,
        messageId: messageRow.id,
        agentConfigurationId: agentConfig1.sId,
      },
    });
    expect(mentionInDb).not.toBeNull();

    const { agentMessage: agentMessageInDb, message: messageInDb } =
      await ConversationFactory.getMessage(auth, result[0].id);
    expect(agentMessageInDb).not.toBeNull();
    expect(agentMessageInDb?.status).toBe("created");

    expect(messageInDb).not.toBeNull();
    expect(messageInDb?.rank).toBe(1);
    expect(messageInDb?.parentId).toBe(messageRow.id);
    expect(messageInDb?.agentMessageId).toBe(result[0].agentMessageId);
    expect(messageInDb?.workspaceId).toBe(workspace.id);
    expect(messageInDb?.visibility).toBe("visible");
    expect(messageInDb?.version).toBe(0);
    expect(messageInDb?.createdAt).toBeDefined();

    // Verify signalAgentUsage was called with correct arguments
    expect(signalAgentUsage).toHaveBeenCalledTimes(1);
    expect(signalAgentUsage).toHaveBeenCalledWith({
      agentConfigurationId: agentConfig1.sId,
      workspaceId: workspace.sId,
    });
  });

  it("should create multiple agent messages for multiple mentions", async () => {
    const { messageRow, userMessage } =
      await ConversationFactory.createUserMessage({
        auth,
        workspace,
        conversation,
        content: `Hello @${agentConfig1.name} and @${agentConfig2.name}`,
      });

    const mentions: MentionType[] = [
      {
        configurationId: agentConfig1.sId,
      } as AgentMention,
      {
        configurationId: agentConfig2.sId,
      } as AgentMention,
    ];

    const result = await createAgentMessages(auth, {
      conversation,
      metadata: {
        type: "create",
        mentions,
        agentConfigurations: [agentConfig1, agentConfig2],
        skipToolsValidation: false,
        nextMessageRank: 1,
        userMessage,
      },
    });

    expect(result).toHaveLength(2);
    expect(result[0].configuration.sId).toBe(agentConfig1.sId);
    expect(result[1].configuration.sId).toBe(agentConfig2.sId);

    // Verify both mentions were created
    const mentionsInDb = await MentionModel.findAll({
      where: {
        workspaceId: workspace.id,
        messageId: messageRow.id,
      },
    });
    expect(mentionsInDb).toHaveLength(2);

    // Verify signalAgentUsage was called for each agent configuration
    expect(signalAgentUsage).toHaveBeenCalledTimes(2);
    expect(signalAgentUsage).toHaveBeenCalledWith({
      agentConfigurationId: agentConfig1.sId,
      workspaceId: workspace.sId,
    });
    expect(signalAgentUsage).toHaveBeenCalledWith({
      agentConfigurationId: agentConfig2.sId,
      workspaceId: workspace.sId,
    });
  });

  it("should skip mentions for configurations not in the list", async () => {
    const { userMessage } = await ConversationFactory.createUserMessage({
      auth,
      workspace,
      conversation,
      content: "Hello agent",
    });

    const mentions: MentionType[] = [
      {
        configurationId: agentConfig1.sId,
      } as AgentMention,
      {
        configurationId: "non-existent-agent",
      } as AgentMention,
    ];

    // Only pass agentConfig1, not the non-existent one
    const result = await createAgentMessages(auth, {
      conversation,
      metadata: {
        type: "create",
        mentions,
        agentConfigurations: [agentConfig1],
        skipToolsValidation: false,
        nextMessageRank: 1,
        userMessage,
      },
    });

    // Should only create one agent message for the valid configuration
    expect(result).toHaveLength(1);
    expect(result[0].configuration.sId).toBe(agentConfig1.sId);

    // Verify signalAgentUsage was called only for the valid configuration
    expect(signalAgentUsage).toHaveBeenCalledTimes(1);
    expect(signalAgentUsage).toHaveBeenCalledWith({
      agentConfigurationId: agentConfig1.sId,
      workspaceId: workspace.sId,
    });

    // Verify runAgentLoopWorkflow was called with correct arguments
    expect(runAgentLoopWorkflow).toHaveBeenCalledTimes(1);
    expect(runAgentLoopWorkflow).toHaveBeenCalledWith({
      auth,
      agentMessages: result,
      conversation,
      userMessage,
    });
  });

  it("should return empty array when no agent mentions are provided", async () => {
    const { userMessage } = await ConversationFactory.createUserMessage({
      auth,
      workspace,
      conversation,
      content: "Hello",
    });

    const result = await createAgentMessages(auth, {
      conversation,
      metadata: {
        type: "create",
        mentions: [],
        agentConfigurations: [agentConfig1],
        skipToolsValidation: false,
        nextMessageRank: 1,
        userMessage,
      },
    });

    expect(result).toHaveLength(0);

    // Verify signalAgentUsage was not called when no agent mentions are provided
    expect(signalAgentUsage).not.toHaveBeenCalled();

    // Verify runAgentLoopWorkflow was not called when no agent messages are created
    expect(runAgentLoopWorkflow).not.toHaveBeenCalled();
  });

  it("should set skipToolsValidation correctly", async () => {
    const { userMessage } = await ConversationFactory.createUserMessage({
      auth,
      workspace,
      conversation,
      content: `Hello @${agentConfig1.name}`,
    });

    const mentions: MentionType[] = [
      {
        configurationId: agentConfig1.sId,
      } as AgentMention,
    ];

    const result = await createAgentMessages(auth, {
      conversation,
      metadata: {
        type: "create",
        mentions,
        agentConfigurations: [agentConfig1],
        skipToolsValidation: true,
        nextMessageRank: 1,
        userMessage,
      },
    });

    expect(result).toHaveLength(1);
    expect(result[0].skipToolsValidation).toBe(true);

    // Verify signalAgentUsage was called with correct arguments
    expect(signalAgentUsage).toHaveBeenCalledTimes(1);
    expect(signalAgentUsage).toHaveBeenCalledWith({
      agentConfigurationId: agentConfig1.sId,
      workspaceId: workspace.sId,
    });

    // Verify runAgentLoopWorkflow was called with correct arguments
    expect(runAgentLoopWorkflow).toHaveBeenCalledTimes(1);
    expect(runAgentLoopWorkflow).toHaveBeenCalledWith({
      auth,
      agentMessages: result,
      conversation,
      userMessage,
    });
  });

  it("should set parentAgentMessageId when context origin is agent_handover", async () => {
    const originMessageId = "original-agent-msg-123";

    const { userMessage } = await ConversationFactory.createUserMessage({
      auth,
      workspace,
      conversation,
      content: `Hello @${agentConfig1.name}`,
      origin: "web",
      agenticMessageType: "agent_handover",
      agenticOriginMessageId: originMessageId,
    });

    const mentions: MentionType[] = [
      {
        configurationId: agentConfig1.sId,
      } as AgentMention,
    ];

    const result = await createAgentMessages(auth, {
      conversation,
      metadata: {
        type: "create",
        mentions,
        agentConfigurations: [agentConfig1],
        skipToolsValidation: true,
        nextMessageRank: 1,
        userMessage,
      },
    });

    expect(result).toHaveLength(1);
    expect(result[0].parentAgentMessageId).toBe(originMessageId);

    // Verify signalAgentUsage was called with correct arguments
    expect(signalAgentUsage).toHaveBeenCalledTimes(1);
    expect(signalAgentUsage).toHaveBeenCalledWith({
      agentConfigurationId: agentConfig1.sId,
      workspaceId: workspace.sId,
    });

    // Verify runAgentLoopWorkflow was called with correct arguments
    expect(runAgentLoopWorkflow).toHaveBeenCalledTimes(1);
    expect(runAgentLoopWorkflow).toHaveBeenCalledWith({
      auth,
      agentMessages: result,
      conversation,
      userMessage,
    });
  });

  it("should set parentAgentMessageId to null when context origin is not agent_handover", async () => {
    const { userMessage } = await ConversationFactory.createUserMessage({
      auth,
      workspace,
      conversation,
      content: `Hello @${agentConfig1.name}`,
      origin: "web",
    });

    const mentions: MentionType[] = [
      {
        configurationId: agentConfig1.sId,
      } as AgentMention,
    ];

    const result = await createAgentMessages(auth, {
      conversation,
      metadata: {
        type: "create",
        mentions,
        agentConfigurations: [agentConfig1],
        skipToolsValidation: false,
        nextMessageRank: 1,
        userMessage,
      },
    });

    expect(result).toHaveLength(1);
    expect(result[0].parentAgentMessageId).toBeNull();

    // Verify signalAgentUsage was called with correct arguments
    expect(signalAgentUsage).toHaveBeenCalledTimes(1);
    expect(signalAgentUsage).toHaveBeenCalledWith({
      agentConfigurationId: agentConfig1.sId,
      workspaceId: workspace.sId,
    });

    // Verify runAgentLoopWorkflow was called with correct arguments
    expect(runAgentLoopWorkflow).toHaveBeenCalledTimes(1);
    expect(runAgentLoopWorkflow).toHaveBeenCalledWith({
      auth,
      agentMessages: result,
      conversation,
      userMessage,
    });
  });

  it("should increment message rank correctly for multiple agent messages", async () => {
    const { userMessage } = await ConversationFactory.createUserMessage({
      auth,
      workspace,
      conversation,
      content: `Hello @${agentConfig1.name} and @${agentConfig2.name}`,
    });

    const mentions: MentionType[] = [
      {
        configurationId: agentConfig1.sId,
      } as AgentMention,
      {
        configurationId: agentConfig2.sId,
      } as AgentMention,
    ];

    const nextMessageRank = 10;

    const result = await createAgentMessages(auth, {
      conversation,
      metadata: {
        type: "create",
        mentions,
        agentConfigurations: [agentConfig1, agentConfig2],
        skipToolsValidation: false,
        nextMessageRank: 10,
        userMessage,
      },
    });

    expect(result).toHaveLength(2);
    // Note: The function increments nextMessageRank internally, so ranks should be 10 and 11
    expect(result[0].rank).toBe(nextMessageRank);
    expect(result[1].rank).toBe(nextMessageRank + 1);

    // Verify signalAgentUsage was called for each agent configuration
    expect(signalAgentUsage).toHaveBeenCalledTimes(2);
    expect(signalAgentUsage).toHaveBeenCalledWith({
      agentConfigurationId: agentConfig1.sId,
      workspaceId: workspace.sId,
    });
    expect(signalAgentUsage).toHaveBeenCalledWith({
      agentConfigurationId: agentConfig2.sId,
      workspaceId: workspace.sId,
    });

    // Verify runAgentLoopWorkflow was called with correct arguments
    expect(runAgentLoopWorkflow).toHaveBeenCalledTimes(1);
    expect(runAgentLoopWorkflow).toHaveBeenCalledWith({
      auth,
      agentMessages: result,
      conversation,
      userMessage,
    });
  });

  it("should propagate requestedSpaceIds from agent configuration to conversation", async () => {
    // Create spaces
    const space1 = await SpaceFactory.regular(workspace);
    const space2 = await SpaceFactory.regular(workspace);

    // Add user to spaces so they can access agents with space requirements
    const user = auth.getNonNullableUser();
    const adminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    const addToSpace1Res = await space1.addMembers(adminAuth, {
      userIds: [user.sId],
    });
    expect(addToSpace1Res.isOk()).toBe(true);
    const addToSpace2Res = await space2.addMembers(adminAuth, {
      userIds: [user.sId],
    });
    expect(addToSpace2Res.isOk()).toBe(true);

    // Create agent configuration
    const agentConfig = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Agent with Space Requirements",
    });

    // Update agent configuration with requestedSpaceIds (as modelIds)
    const space1ModelId = getResourceIdFromSId(space1.sId);
    const space2ModelId = getResourceIdFromSId(space2.sId);
    expect(space1ModelId).not.toBeNull();
    expect(space2ModelId).not.toBeNull();

    await AgentConfigurationModel.update(
      {
        requestedSpaceIds: [space1ModelId!, space2ModelId!],
      },
      {
        where: {
          workspaceId: workspace.id,
          sId: agentConfig.sId,
          version: agentConfig.version,
        },
      }
    );

    // Fetch updated agent configuration
    const updatedAgentConfig = await AgentConfigurationModel.findOne({
      where: {
        workspaceId: workspace.id,
        sId: agentConfig.sId,
        version: agentConfig.version,
      },
    });
    expect(updatedAgentConfig).not.toBeNull();
    expect(updatedAgentConfig?.requestedSpaceIds).toContain(space1ModelId);
    expect(updatedAgentConfig?.requestedSpaceIds).toContain(space2ModelId);

    // Create conversation
    const testConversation = await ConversationFactory.create(auth, {
      agentConfigurationId: agentConfig.sId,
      messagesCreatedAt: [],
      visibility: "unlisted",
    });

    // Fetch conversation before createAgentMessages
    const conversationBefore = await ConversationResource.fetchById(
      auth,
      testConversation.sId
    );
    expect(conversationBefore).not.toBeNull();
    const requestedSpaceIdsBefore =
      conversationBefore!.getRequestedSpaceIdsFromModel();
    expect(requestedSpaceIdsBefore).toEqual([]);

    // Create user message
    const { userMessage } = await ConversationFactory.createUserMessage({
      auth,
      workspace,
      conversation: testConversation,
      content: `Hello @${agentConfig.name}`,
    });

    const mentions: MentionType[] = [
      {
        configurationId: agentConfig.sId,
      } satisfies AgentMention,
    ];

    // Get the updated agent configuration with requestedSpaceIds as sIds
    const agentConfigWithSpaces = await getAgentConfiguration(auth, {
      agentId: agentConfig.sId,
      agentVersion: agentConfig.version,
      variant: "light",
    });
    expect(agentConfigWithSpaces).not.toBeNull();
    expect(agentConfigWithSpaces?.requestedSpaceIds).toContain(space1.sId);
    expect(agentConfigWithSpaces?.requestedSpaceIds).toContain(space2.sId);

    // Call createAgentMessages
    const agentMessages = await withTransaction(async (transaction) => {
      return createAgentMessages(auth, {
        conversation: testConversation,
        metadata: {
          type: "create",
          mentions,
          agentConfigurations: [agentConfigWithSpaces!],
          skipToolsValidation: false,
          nextMessageRank: 1,
          userMessage,
        },
        transaction,
      });
    });

    // Verify runAgentLoopWorkflow was called with correct arguments
    expect(runAgentLoopWorkflow).toHaveBeenCalledTimes(1);
    expect(runAgentLoopWorkflow).toHaveBeenCalledWith({
      auth,
      agentMessages,
      conversation: testConversation,
      userMessage,
    });

    // Fetch conversation after createAgentMessages
    const conversationAfter = await ConversationResource.fetchById(
      auth,
      testConversation.sId
    );
    expect(conversationAfter).not.toBeNull();
    const requestedSpaceIdsAfter =
      conversationAfter!.getRequestedSpaceIdsFromModel();

    // Verify requestedSpaceIds were propagated
    expect(requestedSpaceIdsAfter).toHaveLength(2);
    expect(requestedSpaceIdsAfter).toContain(space1.sId);
    expect(requestedSpaceIdsAfter).toContain(space2.sId);
  });

  it("should add new requestedSpaceIds when agent has different spaces than conversation", async () => {
    // Create spaces
    const space1 = await SpaceFactory.regular(workspace);
    const space2 = await SpaceFactory.regular(workspace);
    const space3 = await SpaceFactory.regular(workspace);

    // Add user to spaces so they can access agents with space requirements
    const user = auth.getNonNullableUser();
    const adminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    const addToSpace1Res = await space1.addMembers(adminAuth, {
      userIds: [user.sId],
    });
    expect(addToSpace1Res.isOk()).toBe(true);
    const addToSpace2Res = await space2.addMembers(adminAuth, {
      userIds: [user.sId],
    });
    expect(addToSpace2Res.isOk()).toBe(true);

    // Create agent configuration
    const agentConfig = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Agent with New Space Requirements",
    });

    // Update agent configuration with requestedSpaceIds
    const space1ModelId = getResourceIdFromSId(space1.sId);
    const space2ModelId = getResourceIdFromSId(space2.sId);
    expect(space1ModelId).not.toBeNull();
    expect(space2ModelId).not.toBeNull();

    await AgentConfigurationModel.update(
      {
        requestedSpaceIds: [space1ModelId!, space2ModelId!],
      },
      {
        where: {
          workspaceId: workspace.id,
          sId: agentConfig.sId,
          version: agentConfig.version,
        },
      }
    );

    // Create conversation with initial requestedSpaceIds (space1 only)
    const space1ModelIdForConversation = getResourceIdFromSId(space1.sId);
    expect(space1ModelIdForConversation).not.toBeNull();

    const testConversation = await ConversationFactory.create(auth, {
      agentConfigurationId: agentConfig.sId,
      messagesCreatedAt: [],
      visibility: "unlisted",
      requestedSpaceIds: [space1ModelIdForConversation!],
    });

    // Fetch conversation before createAgentMessages
    const conversationBefore = await ConversationResource.fetchById(
      auth,
      testConversation.sId
    );
    expect(conversationBefore).not.toBeNull();
    const requestedSpaceIdsBefore =
      conversationBefore!.getRequestedSpaceIdsFromModel();
    expect(requestedSpaceIdsBefore).toEqual([space1.sId]);

    // Create user message
    const { userMessage } = await ConversationFactory.createUserMessage({
      auth,
      workspace,
      conversation: testConversation,
      content: `Hello @${agentConfig.name}`,
    });

    const mentions: MentionType[] = [
      {
        configurationId: agentConfig.sId,
      } satisfies AgentMention,
    ];

    // Agent has space1 and space2, conversation already has space1
    const agentConfigWithSpaces = await getAgentConfiguration(auth, {
      agentId: agentConfig.sId,
      agentVersion: agentConfig.version,
      variant: "light",
    });
    expect(agentConfigWithSpaces).not.toBeNull();
    expect(agentConfigWithSpaces?.requestedSpaceIds).toContain(space1.sId);
    expect(agentConfigWithSpaces?.requestedSpaceIds).toContain(space2.sId);

    // Call createAgentMessages
    const agentMessages = await withTransaction(async (transaction) => {
      return createAgentMessages(auth, {
        conversation: testConversation,
        metadata: {
          type: "create",
          mentions,
          agentConfigurations: [agentConfigWithSpaces!],
          skipToolsValidation: false,
          nextMessageRank: 1,
          userMessage,
        },
        transaction,
      });
    });

    // Verify runAgentLoopWorkflow was called with correct arguments
    expect(runAgentLoopWorkflow).toHaveBeenCalledTimes(1);
    expect(runAgentLoopWorkflow).toHaveBeenCalledWith({
      auth,
      agentMessages,
      conversation: testConversation,
      userMessage,
    });

    // Fetch conversation after createAgentMessages
    const conversationAfter = await ConversationResource.fetchById(
      auth,
      testConversation.sId
    );
    expect(conversationAfter).not.toBeNull();
    const requestedSpaceIdsAfter =
      conversationAfter!.getRequestedSpaceIdsFromModel();

    // Verify requestedSpaceIds were updated (space1 should remain, space2 should be added)
    expect(requestedSpaceIdsAfter).toHaveLength(2);
    expect(requestedSpaceIdsAfter).toContain(space1.sId);
    expect(requestedSpaceIdsAfter).toContain(space2.sId);
    // space3 should not be included
    expect(requestedSpaceIdsAfter).not.toContain(space3.sId);
  });

  it("should not duplicate requestedSpaceIds when agent spaces already exist in conversation", async () => {
    // Create spaces
    const space1 = await SpaceFactory.regular(workspace);
    const space2 = await SpaceFactory.regular(workspace);

    // Add user to spaces so they can access agents with space requirements
    const user = auth.getNonNullableUser();
    const adminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    const addToSpace1Res = await space1.addMembers(adminAuth, {
      userIds: [user.sId],
    });
    expect(addToSpace1Res.isOk()).toBe(true);
    const addToSpace2Res = await space2.addMembers(adminAuth, {
      userIds: [user.sId],
    });
    expect(addToSpace2Res.isOk()).toBe(true);

    // Create agent configuration
    const agentConfig = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Agent with Existing Space Requirements",
    });

    // Update agent configuration with requestedSpaceIds
    const space1ModelId = getResourceIdFromSId(space1.sId);
    const space2ModelId = getResourceIdFromSId(space2.sId);
    expect(space1ModelId).not.toBeNull();
    expect(space2ModelId).not.toBeNull();

    await AgentConfigurationModel.update(
      {
        requestedSpaceIds: [space1ModelId!, space2ModelId!],
      },
      {
        where: {
          workspaceId: workspace.id,
          sId: agentConfig.sId,
          version: agentConfig.version,
        },
      }
    );

    // Create conversation with requestedSpaceIds already set
    const testConversation = await ConversationFactory.create(auth, {
      agentConfigurationId: agentConfig.sId,
      messagesCreatedAt: [],
      visibility: "unlisted",
      requestedSpaceIds: [space1ModelId!, space2ModelId!],
    });

    // Fetch conversation before createAgentMessages
    const conversationBefore = await ConversationResource.fetchById(
      auth,
      testConversation.sId
    );
    expect(conversationBefore).not.toBeNull();
    const requestedSpaceIdsBefore =
      conversationBefore!.getRequestedSpaceIdsFromModel();
    expect(requestedSpaceIdsBefore).toHaveLength(2);
    expect(requestedSpaceIdsBefore).toContain(space1.sId);
    expect(requestedSpaceIdsBefore).toContain(space2.sId);

    // Create user message
    const { userMessage } = await ConversationFactory.createUserMessage({
      auth,
      workspace,
      conversation: testConversation,
      content: `Hello @${agentConfig.name}`,
    });

    const mentions: MentionType[] = [
      {
        configurationId: agentConfig.sId,
      } satisfies AgentMention,
    ];

    // Agent has the same spaces as conversation
    const agentConfigWithSpaces = await getAgentConfiguration(auth, {
      agentId: agentConfig.sId,
      agentVersion: agentConfig.version,
      variant: "light",
    });
    expect(agentConfigWithSpaces).not.toBeNull();
    expect(agentConfigWithSpaces?.requestedSpaceIds).toContain(space1.sId);
    expect(agentConfigWithSpaces?.requestedSpaceIds).toContain(space2.sId);

    // Call createAgentMessages
    const agentMessages = await withTransaction(async (transaction) => {
      return createAgentMessages(auth, {
        conversation: testConversation,
        metadata: {
          type: "create",
          mentions,
          agentConfigurations: [agentConfigWithSpaces!],
          skipToolsValidation: false,
          nextMessageRank: 1,
          userMessage,
        },
        transaction,
      });
    });

    // Verify runAgentLoopWorkflow was called with correct arguments
    expect(runAgentLoopWorkflow).toHaveBeenCalledTimes(1);
    expect(runAgentLoopWorkflow).toHaveBeenCalledWith({
      auth,
      agentMessages,
      conversation: testConversation,
      userMessage,
    });

    // Fetch conversation after createAgentMessages
    const conversationAfter = await ConversationResource.fetchById(
      auth,
      testConversation.sId
    );
    expect(conversationAfter).not.toBeNull();
    const requestedSpaceIdsAfter =
      conversationAfter!.getRequestedSpaceIdsFromModel();

    // Verify requestedSpaceIds remain the same (no duplicates)
    expect(requestedSpaceIdsAfter).toHaveLength(2);
    expect(requestedSpaceIdsAfter).toContain(space1.sId);
    expect(requestedSpaceIdsAfter).toContain(space2.sId);
  });
});

describe("createUserMentions", () => {
  let workspace: WorkspaceType;
  let auth: Authenticator;
  let conversation: ConversationType;

  beforeEach(async () => {
    // Create workspace, user, spaces, and groups using the helper
    const setup = await createResourceTest({});
    workspace = setup.workspace;
    auth = setup.authenticator;

    // Create a conversation using the factory
    conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: "test-agent",
      messagesCreatedAt: [],
      visibility: "unlisted",
    });
  });

  it("should store user mentions in the database", async () => {
    const mentionedUser = await UserFactory.basic();
    await MembershipFactory.associate(workspace, mentionedUser, {
      role: "user",
    });

    const { userMessage } = await ConversationFactory.createUserMessage({
      auth,
      workspace,
      conversation,
      content: `Hello @${mentionedUser.username}`,
    });

    const mentions: MentionType[] = [
      {
        type: "user",
        userId: mentionedUser.sId.toString(),
      },
    ];

    const result = await createUserMentions(auth, {
      mentions,
      message: userMessage,
      conversation,
    });

    // Verify return value is an array of RichMentionWithStatus
    expect(result).toBeInstanceOf(Array);
    expect(result).toHaveLength(1);
    const mentionedUserJson = mentionedUser.toJSON();
    expect(result[0]).toMatchObject({
      id: mentionedUser.sId,
      type: "user",
      label: mentionedUserJson.fullName,
      pictureUrl:
        mentionedUserJson.image ?? "/static/humanavatar/anonymous.png",
      description: mentionedUserJson.email,
      status: "pending",
    });
    expect(isRichUserMention(result[0])).toBe(true);

    // Verify user mention was stored in the database
    const userMentionInDb = await MentionModel.findOne({
      where: {
        workspaceId: workspace.id,
        messageId: userMessage.id,
        userId: mentionedUser.id,
      },
    });
    expect(userMentionInDb).not.toBeNull();
    expect(userMentionInDb?.userId).toBe(mentionedUser.id);
    expect(userMentionInDb?.agentConfigurationId).toBeNull();

    // Verify the user is marked as a participant with "subscribed" action.
    const participant = await ConversationParticipantModel.findOne({
      where: {
        workspaceId: workspace.id,
        conversationId: conversation.id,
        userId: mentionedUser.id,
      },
    });
    expect(participant).toBeNull();
  });

  it("should handle multiple user mentions", async () => {
    const user1 = auth.getNonNullableUser();
    const user2 = await UserFactory.basic();
    await MembershipFactory.associate(workspace, user2, { role: "user" });

    const { userMessage } = await ConversationFactory.createUserMessage({
      auth,
      workspace,
      conversation,
      content: `Hello @${user1.username} and @${user2.username}`,
    });

    const mentions: MentionType[] = [
      {
        type: "user",
        userId: user1.sId.toString(),
      },
      {
        type: "user",
        userId: user2.sId.toString(),
      },
    ];

    const result = await createUserMentions(auth, {
      mentions,
      message: userMessage,
      conversation,
    });

    // Verify return value is an array of RichMentionWithStatus
    expect(result).toBeInstanceOf(Array);
    expect(result).toHaveLength(2);
    const user1Mention = result.find((m) => m.id === user1.sId);
    const user2Mention = result.find((m) => m.id === user2.sId);
    expect(user1Mention).toBeDefined();
    expect(user2Mention).toBeDefined();
    const user1Json = user1.toJSON();
    const user2Json = user2.toJSON();
    expect(user1Mention).toMatchObject({
      id: user1.sId,
      type: "user",
      label: user1Json.fullName,
      status: "pending",
    });
    expect(user2Mention).toMatchObject({
      id: user2.sId,
      type: "user",
      label: user2Json.fullName,
      status: "pending",
    });
    expect(isRichUserMention(user1Mention!)).toBe(true);
    expect(isRichUserMention(user2Mention!)).toBe(true);

    // Verify both user mentions were stored
    const allMentionsInDb = await MentionModel.findAll({
      where: {
        workspaceId: workspace.id,
        messageId: userMessage.id,
      },
      order: [["userId", "ASC"]],
    });
    expect(allMentionsInDb).toHaveLength(2);
    expect(allMentionsInDb[0].userId).toBe(user1.id);
    expect(allMentionsInDb[1].userId).toBe(user2.id);
    // Both should have null agentConfigurationId
    expect(allMentionsInDb[0].agentConfigurationId).toBeNull();
    expect(allMentionsInDb[1].agentConfigurationId).toBeNull();

    // Verify the users are marked as participants with "subscribed" action.
    const participant1 = await ConversationParticipantModel.findOne({
      where: {
        workspaceId: workspace.id,
        conversationId: conversation.id,
        userId: user1.id,
      },
    });
    expect(participant1).toBeNull();

    const participant2 = await ConversationParticipantModel.findOne({
      where: {
        workspaceId: workspace.id,
        conversationId: conversation.id,
        userId: user2.id,
      },
    });
    expect(participant2).toBeNull();
  });

  it("should handle empty user mentions array", async () => {
    const { userMessage } = await ConversationFactory.createUserMessage({
      auth,
      workspace,
      conversation,
      content: "Hello",
    });

    const mentions: MentionType[] = [];

    const result = await createUserMentions(auth, {
      mentions,
      message: userMessage,
      conversation,
    });

    // Verify return value is an empty array
    expect(result).toBeInstanceOf(Array);
    expect(result).toHaveLength(0);

    // Verify no mentions were stored
    const allMentionsInDb = await MentionModel.findAll({
      where: {
        workspaceId: workspace.id,
        messageId: userMessage.id,
      },
    });
    expect(allMentionsInDb).toHaveLength(0);

    // Verify no participants were created
    const participantsInDb = await ConversationParticipantModel.findAll({
      where: {
        workspaceId: workspace.id,
        conversationId: conversation.id,
      },
    });
    expect(participantsInDb).toHaveLength(0);
  });

  it("should only process user mentions and ignore agent mentions", async () => {
    const mentionedUser = await UserFactory.basic();
    await MembershipFactory.associate(workspace, mentionedUser, {
      role: "user",
    });

    const { userMessage } = await ConversationFactory.createUserMessage({
      auth,
      workspace,
      conversation,
      content: `Hello @${mentionedUser.username} and @agent`,
    });

    const mentions: MentionType[] = [
      {
        type: "user",
        userId: mentionedUser.sId.toString(),
      },
      {
        configurationId: "some-agent-id",
      } as AgentMention,
    ];

    const result = await createUserMentions(auth, {
      mentions,
      message: userMessage,
      conversation,
    });

    // Verify return value only contains the user mention
    expect(result).toBeInstanceOf(Array);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: mentionedUser.sId,
      type: "user",
      status: "pending",
    });
    expect(isRichUserMention(result[0])).toBe(true);

    // Verify only user mention was stored, agent mention should be ignored
    const allMentionsInDb = await MentionModel.findAll({
      where: {
        workspaceId: workspace.id,
        messageId: userMessage.id,
      },
    });
    expect(allMentionsInDb).toHaveLength(1);
    expect(allMentionsInDb[0].userId).toBe(mentionedUser.id);
    expect(allMentionsInDb[0].agentConfigurationId).toBeNull();
  });

  describe("auto-approval behavior", () => {
    it("should not auto approve mentions in user messages", async () => {
      const mentionedUser = await UserFactory.basic();
      await MembershipFactory.associate(workspace, mentionedUser, {
        role: "user",
      });

      const { userMessage } = await ConversationFactory.createUserMessage({
        auth,
        workspace,
        conversation,
        content: `Hello @${mentionedUser.username}`,
      });

      const mentions: MentionType[] = [
        {
          type: "user",
          userId: mentionedUser.sId.toString(),
        },
      ];

      const result = await createUserMentions(auth, {
        mentions,
        message: userMessage,
        conversation,
      });

      // Verify return value
      expect(result).toBeInstanceOf(Array);
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: mentionedUser.sId,
        type: "user",
        status: "pending",
      });
      expect(isRichUserMention(result[0])).toBe(true);

      // Verify mention was auto-approved
      const mentionInDb = await MentionModel.findOne({
        where: {
          workspaceId: workspace.id,
          messageId: userMessage.id,
          userId: mentionedUser.id,
        },
      });
      expect(mentionInDb).not.toBeNull();
      expect(mentionInDb?.status).toBe("pending");
    });

    it("should always auto approve mentions for existing participants", async () => {
      const mentionedUser = await UserFactory.basic();
      await MembershipFactory.associate(workspace, mentionedUser, {
        role: "user",
      });

      // Add user as participant first
      await ConversationResource.upsertParticipation(auth, {
        conversation,
        action: "subscribed",
        user: mentionedUser.toJSON(),
      });

      // Create an agent message
      const agentConfig = await AgentConfigurationFactory.createTestAgent(
        auth,
        {
          name: "Test Agent",
        }
      );

      const agentMessageRow = await AgentMessageModel.create({
        status: "created",
        agentConfigurationId: agentConfig.sId,
        agentConfigurationVersion: agentConfig.version,
        workspaceId: workspace.id,
        skipToolsValidation: false,
      });

      const messageRow = await MessageModel.create({
        sId: generateRandomModelSId(),
        rank: 0,
        conversationId: conversation.id,
        parentId: null,
        agentMessageId: agentMessageRow.id,
        workspaceId: workspace.id,
      });

      const agentMessage: AgentMessageTypeWithoutMentions = {
        id: messageRow.id,
        agentMessageId: agentMessageRow.id,
        created: agentMessageRow.createdAt.getTime(),
        completedTs: null,
        sId: messageRow.sId,
        type: "agent_message",
        visibility: messageRow.visibility,
        version: messageRow.version,
        parentMessageId: "",
        parentAgentMessageId: null,
        status: agentMessageRow.status,
        content: null,
        chainOfThought: null,
        error: null,
        configuration: agentConfig,
        skipToolsValidation: false,
        actions: [],
        rawContents: [],
        contents: [],
        parsedContents: {},
        reactions: [],
        modelInteractionDurationMs: null,
        completionDurationMs: null,
        rank: messageRow.rank,
      };

      const mentions: MentionType[] = [
        {
          type: "user",
          userId: mentionedUser.sId.toString(),
        },
      ];

      const result = await createUserMentions(auth, {
        mentions,
        message: agentMessage,
        conversation,
      });

      // Verify return value
      expect(result).toBeInstanceOf(Array);
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: mentionedUser.sId,
        type: "user",
        status: "approved",
      });
      expect(isRichUserMention(result[0])).toBe(true);

      // Verify mention was auto-approved because user is already a participant
      const mentionInDb = await MentionModel.findOne({
        where: {
          workspaceId: workspace.id,
          messageId: messageRow.id,
          userId: mentionedUser.id,
        },
      });
      expect(mentionInDb).not.toBeNull();
      expect(mentionInDb?.status).toBe("approved");
    });

    it("should require approval for mentions in agent messages (non-triggered conversation)", async () => {
      const mentionedUser = await UserFactory.basic();
      await MembershipFactory.associate(workspace, mentionedUser, {
        role: "user",
      });

      // Create an agent message
      const agentConfig = await AgentConfigurationFactory.createTestAgent(
        auth,
        {
          name: "Test Agent",
        }
      );

      const agentMessageRow = await AgentMessageModel.create({
        status: "created",
        agentConfigurationId: agentConfig.sId,
        agentConfigurationVersion: agentConfig.version,
        workspaceId: workspace.id,
        skipToolsValidation: false,
      });

      const messageRow = await MessageModel.create({
        sId: generateRandomModelSId(),
        rank: 0,
        conversationId: conversation.id,
        parentId: null,
        agentMessageId: agentMessageRow.id,
        workspaceId: workspace.id,
      });

      const agentMessage: AgentMessageTypeWithoutMentions = {
        id: messageRow.id,
        agentMessageId: agentMessageRow.id,
        created: agentMessageRow.createdAt.getTime(),
        completedTs: null,
        sId: messageRow.sId,
        type: "agent_message",
        visibility: messageRow.visibility,
        version: messageRow.version,
        parentMessageId: "",
        parentAgentMessageId: null,
        status: agentMessageRow.status,
        content: null,
        chainOfThought: null,
        error: null,
        configuration: agentConfig,
        skipToolsValidation: false,
        actions: [],
        rawContents: [],
        contents: [],
        parsedContents: {},
        reactions: [],
        modelInteractionDurationMs: null,
        completionDurationMs: null,
        rank: messageRow.rank,
      };

      const mentions: MentionType[] = [
        {
          type: "user",
          userId: mentionedUser.sId.toString(),
        },
      ];

      const result = await createUserMentions(auth, {
        mentions,
        message: agentMessage,
        conversation,
      });

      // Verify return value
      expect(result).toBeInstanceOf(Array);
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: mentionedUser.sId,
        type: "user",
        status: "pending",
      });
      expect(isRichUserMention(result[0])).toBe(true);

      // Verify mention requires approval (pending status)
      const mentionInDb = await MentionModel.findOne({
        where: {
          workspaceId: workspace.id,
          messageId: messageRow.id,
          userId: mentionedUser.id,
        },
      });
      expect(mentionInDb).not.toBeNull();
      expect(mentionInDb?.status).toBe("pending");
    });

    it("should auto approve mentions in agent messages on triggered conversations if user is mentioned in instructions", async () => {
      const mentionedUser = await UserFactory.basic();
      await MembershipFactory.associate(workspace, mentionedUser, {
        role: "user",
      });

      // Create an agent config for the trigger
      const triggerAgentConfig =
        await AgentConfigurationFactory.createTestAgent(auth, {
          name: "Trigger Agent",
        });

      // Create a trigger
      const trigger = await TriggerModel.create({
        workspaceId: workspace.id,
        name: "Test Trigger",
        kind: "webhook",
        agentConfigurationId: triggerAgentConfig.sId,
        editor: auth.getNonNullableUser().id,
        customPrompt: null,
        enabled: true,
        configuration: { includePayload: true },
        origin: "user",
      });

      // Create a conversation with triggerId
      const triggeredConversation = await ConversationFactory.create(auth, {
        agentConfigurationId: triggerAgentConfig.sId,
        messagesCreatedAt: [],
        visibility: "unlisted",
      });

      // Update conversation to have a triggerId
      await ConversationModel.update(
        { triggerId: trigger.id },
        { where: { id: triggeredConversation.id } }
      );

      // Fetch updated conversation
      const updatedConversationResult = await getConversation(
        auth,
        triggeredConversation.sId
      );
      expect(updatedConversationResult.isOk()).toBe(true);
      if (!updatedConversationResult.isOk()) {
        throw new Error("Failed to fetch conversation");
      }
      const updatedConversation = updatedConversationResult.value;
      expect(updatedConversation.triggerId).not.toBeNull();

      // Create agent config with instructions mentioning the user
      const agentConfig = await AgentConfigurationFactory.createTestAgent(
        auth,
        {
          name: "Test Agent",
        }
      );

      // Update agent config to include user mention in instructions
      const instructionsWithMention = `Please notify :mention_user[${mentionedUser.username}]{sId=${mentionedUser.sId}} about this.`;
      await AgentConfigurationModel.update(
        { instructions: instructionsWithMention },
        {
          where: {
            workspaceId: workspace.id,
            sId: agentConfig.sId,
            version: agentConfig.version,
          },
        }
      );

      // Fetch updated agent config
      const updatedAgentConfig = await getAgentConfiguration(auth, {
        agentId: agentConfig.sId,
        agentVersion: agentConfig.version,
        variant: "light",
      });
      expect(updatedAgentConfig).not.toBeNull();
      expect(updatedAgentConfig?.instructions).toContain(mentionedUser.sId);

      const agentMessageRow = await AgentMessageModel.create({
        status: "created",
        agentConfigurationId: updatedAgentConfig!.sId,
        agentConfigurationVersion: updatedAgentConfig!.version,
        workspaceId: workspace.id,
        skipToolsValidation: false,
      });

      const messageRow = await MessageModel.create({
        sId: generateRandomModelSId(),
        rank: 0,
        conversationId: updatedConversation.id,
        parentId: null,
        agentMessageId: agentMessageRow.id,
        workspaceId: workspace.id,
      });

      const agentMessage: AgentMessageTypeWithoutMentions = {
        id: messageRow.id,
        agentMessageId: agentMessageRow.id,
        created: agentMessageRow.createdAt.getTime(),
        completedTs: null,
        sId: messageRow.sId,
        type: "agent_message",
        visibility: messageRow.visibility,
        version: messageRow.version,
        parentMessageId: "",
        parentAgentMessageId: null,
        status: agentMessageRow.status,
        content: null,
        chainOfThought: null,
        error: null,
        configuration: updatedAgentConfig!,
        skipToolsValidation: false,
        actions: [],
        rawContents: [],
        contents: [],
        parsedContents: {},
        reactions: [],
        modelInteractionDurationMs: null,
        completionDurationMs: null,
        rank: messageRow.rank,
      };

      const mentions: MentionType[] = [
        {
          type: "user",
          userId: mentionedUser.sId.toString(),
        },
      ];

      const result = await createUserMentions(auth, {
        mentions,
        message: agentMessage,
        conversation: updatedConversation,
      });

      // Verify return value
      expect(result).toBeInstanceOf(Array);
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: mentionedUser.sId,
        type: "user",
        status: "approved",
      });
      expect(isRichUserMention(result[0])).toBe(true);

      // Verify mention was auto-approved because user is mentioned in instructions
      const mentionInDb = await MentionModel.findOne({
        where: {
          workspaceId: workspace.id,
          messageId: messageRow.id,
          userId: mentionedUser.id,
        },
      });
      expect(mentionInDb).not.toBeNull();
      expect(mentionInDb?.status).toBe("approved");
    });

    it("should require approval for mentions in agent messages on triggered conversations if user is NOT mentioned in instructions", async () => {
      const mentionedUser = await UserFactory.basic();
      await MembershipFactory.associate(workspace, mentionedUser, {
        role: "user",
      });

      // Create an agent config for the trigger
      const triggerAgentConfig =
        await AgentConfigurationFactory.createTestAgent(auth, {
          name: "Trigger Agent",
        });

      // Create a trigger
      const trigger = await TriggerModel.create({
        workspaceId: workspace.id,
        name: "Test Trigger",
        kind: "webhook",
        agentConfigurationId: triggerAgentConfig.sId,
        editor: auth.getNonNullableUser().id,
        customPrompt: null,
        enabled: true,
        configuration: { includePayload: true },
        origin: "user",
      });

      // Create a conversation with triggerId
      const triggeredConversation = await ConversationFactory.create(auth, {
        agentConfigurationId: triggerAgentConfig.sId,
        messagesCreatedAt: [],
        visibility: "unlisted",
      });

      // Update conversation to have a triggerId
      await ConversationModel.update(
        { triggerId: trigger.id },
        { where: { id: triggeredConversation.id } }
      );

      // Fetch updated conversation
      const updatedConversationResult = await getConversation(
        auth,
        triggeredConversation.sId
      );
      expect(updatedConversationResult.isOk()).toBe(true);
      if (!updatedConversationResult.isOk()) {
        throw new Error("Failed to fetch conversation");
      }
      const updatedConversation = updatedConversationResult.value;
      expect(updatedConversation.triggerId).not.toBeNull();

      // Create agent config WITHOUT mentioning the user in instructions
      const agentConfig = await AgentConfigurationFactory.createTestAgent(
        auth,
        {
          name: "Test Agent",
        }
      );

      // Ensure instructions don't mention the user
      await AgentConfigurationModel.update(
        { instructions: "Standard instructions without user mentions." },
        {
          where: {
            workspaceId: workspace.id,
            sId: agentConfig.sId,
            version: agentConfig.version,
          },
        }
      );

      // Fetch updated agent config
      const updatedAgentConfig = await getAgentConfiguration(auth, {
        agentId: agentConfig.sId,
        agentVersion: agentConfig.version,
        variant: "light",
      });
      expect(updatedAgentConfig).not.toBeNull();
      expect(updatedAgentConfig?.instructions).not.toContain(mentionedUser.sId);

      const agentMessageRow = await AgentMessageModel.create({
        status: "created",
        agentConfigurationId: updatedAgentConfig!.sId,
        agentConfigurationVersion: updatedAgentConfig!.version,
        workspaceId: workspace.id,
        skipToolsValidation: false,
      });

      const messageRow = await MessageModel.create({
        sId: generateRandomModelSId(),
        rank: 0,
        conversationId: updatedConversation.id,
        parentId: null,
        agentMessageId: agentMessageRow.id,
        workspaceId: workspace.id,
      });

      const agentMessage: AgentMessageTypeWithoutMentions = {
        id: messageRow.id,
        agentMessageId: agentMessageRow.id,
        created: agentMessageRow.createdAt.getTime(),
        completedTs: null,
        sId: messageRow.sId,
        type: "agent_message",
        visibility: messageRow.visibility,
        version: messageRow.version,
        parentMessageId: "",
        parentAgentMessageId: null,
        status: agentMessageRow.status,
        content: null,
        chainOfThought: null,
        error: null,
        configuration: updatedAgentConfig!,
        skipToolsValidation: false,
        actions: [],
        rawContents: [],
        contents: [],
        parsedContents: {},
        reactions: [],
        modelInteractionDurationMs: null,
        completionDurationMs: null,
        rank: messageRow.rank,
      };

      const mentions: MentionType[] = [
        {
          type: "user",
          userId: mentionedUser.sId.toString(),
        },
      ];

      const result = await createUserMentions(auth, {
        mentions,
        message: agentMessage,
        conversation: updatedConversation,
      });

      // Verify return value
      expect(result).toBeInstanceOf(Array);
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: mentionedUser.sId,
        type: "user",
        status: "pending",
      });
      expect(isRichUserMention(result[0])).toBe(true);

      // Verify mention requires approval (pending status) because user is NOT mentioned in instructions
      const mentionInDb = await MentionModel.findOne({
        where: {
          workspaceId: workspace.id,
          messageId: messageRow.id,
          userId: mentionedUser.id,
        },
      });
      expect(mentionInDb).not.toBeNull();
      expect(mentionInDb?.status).toBe("pending");
    });

    it("should require approval for mentions in agent messages on triggered conversations if instructions are null", async () => {
      const mentionedUser = await UserFactory.basic();
      await MembershipFactory.associate(workspace, mentionedUser, {
        role: "user",
      });

      // Create an agent config for the trigger
      const triggerAgentConfig =
        await AgentConfigurationFactory.createTestAgent(auth, {
          name: "Trigger Agent",
        });

      // Create a trigger
      const trigger = await TriggerModel.create({
        workspaceId: workspace.id,
        name: "Test Trigger",
        kind: "webhook",
        agentConfigurationId: triggerAgentConfig.sId,
        editor: auth.getNonNullableUser().id,
        customPrompt: null,
        enabled: true,
        configuration: { includePayload: true },
        origin: "user",
      });

      // Create a conversation with triggerId
      const triggeredConversation = await ConversationFactory.create(auth, {
        agentConfigurationId: triggerAgentConfig.sId,
        messagesCreatedAt: [],
        visibility: "unlisted",
      });

      // Update conversation to have a triggerId
      await ConversationModel.update(
        { triggerId: trigger.id },
        { where: { id: triggeredConversation.id } }
      );

      // Fetch updated conversation
      const updatedConversationResult = await getConversation(
        auth,
        triggeredConversation.sId
      );
      expect(updatedConversationResult.isOk()).toBe(true);
      if (!updatedConversationResult.isOk()) {
        throw new Error("Failed to fetch conversation");
      }
      const updatedConversation = updatedConversationResult.value;
      expect(updatedConversation.triggerId).not.toBeNull();

      // Create agent config with null instructions
      const agentConfig = await AgentConfigurationFactory.createTestAgent(
        auth,
        {
          name: "Test Agent",
        }
      );

      // Set instructions to null
      await AgentConfigurationModel.update(
        { instructions: null },
        {
          where: {
            workspaceId: workspace.id,
            sId: agentConfig.sId,
            version: agentConfig.version,
          },
        }
      );

      // Fetch updated agent config
      const updatedAgentConfig = await getAgentConfiguration(auth, {
        agentId: agentConfig.sId,
        agentVersion: agentConfig.version,
        variant: "light",
      });
      expect(updatedAgentConfig).not.toBeNull();
      expect(updatedAgentConfig?.instructions).toBeNull();

      const agentMessageRow = await AgentMessageModel.create({
        status: "created",
        agentConfigurationId: updatedAgentConfig!.sId,
        agentConfigurationVersion: updatedAgentConfig!.version,
        workspaceId: workspace.id,
        skipToolsValidation: false,
      });

      const messageRow = await MessageModel.create({
        sId: generateRandomModelSId(),
        rank: 0,
        conversationId: updatedConversation.id,
        parentId: null,
        agentMessageId: agentMessageRow.id,
        workspaceId: workspace.id,
      });

      const agentMessage: AgentMessageTypeWithoutMentions = {
        id: messageRow.id,
        agentMessageId: agentMessageRow.id,
        created: agentMessageRow.createdAt.getTime(),
        completedTs: null,
        sId: messageRow.sId,
        type: "agent_message",
        visibility: messageRow.visibility,
        version: messageRow.version,
        parentMessageId: "",
        parentAgentMessageId: null,
        status: agentMessageRow.status,
        content: null,
        chainOfThought: null,
        error: null,
        configuration: updatedAgentConfig!,
        skipToolsValidation: false,
        actions: [],
        rawContents: [],
        contents: [],
        parsedContents: {},
        reactions: [],
        modelInteractionDurationMs: null,
        completionDurationMs: null,
        rank: messageRow.rank,
      };

      const mentions: MentionType[] = [
        {
          type: "user",
          userId: mentionedUser.sId.toString(),
        },
      ];

      const result = await createUserMentions(auth, {
        mentions,
        message: agentMessage,
        conversation: updatedConversation,
      });

      // Verify return value
      expect(result).toBeInstanceOf(Array);
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: mentionedUser.sId,
        type: "user",
        status: "pending",
      });
      expect(isRichUserMention(result[0])).toBe(true);

      // Verify mention requires approval (pending status) because instructions are null
      const mentionInDb = await MentionModel.findOne({
        where: {
          workspaceId: workspace.id,
          messageId: messageRow.id,
          userId: mentionedUser.id,
        },
      });
      expect(mentionInDb).not.toBeNull();
      expect(mentionInDb?.status).toBe("pending");
    });
  });
});

describe("createUserMessage", () => {
  let workspace: WorkspaceType;
  let auth: Authenticator;
  let conversation: ConversationWithoutContentType;
  let agentConfig1: LightAgentConfigurationType;

  beforeEach(async () => {
    // Create workspace, user, spaces, and groups using the helper
    const setup = await createResourceTest({});
    workspace = setup.workspace;
    auth = setup.authenticator;

    // Create test agent configuration
    agentConfig1 = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Test Agent 1",
      description: "First test agent",
    });

    // Create a conversation using the factory
    conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: agentConfig1.sId,
      messagesCreatedAt: [],
      visibility: "unlisted",
    });
  });

  it("should create a new user message with user provided", async () => {
    const user = auth.getNonNullableUser();
    const userJson = user.toJSON();
    const content = "Hello, this is a test message";
    const rank = 0;

    const context: UserMessageContext = {
      username: userJson.username,
      timezone: "UTC",
      fullName: userJson.fullName,
      email: userJson.email,
      profilePictureUrl: userJson.image,
      origin: "web",
    };

    const userMessage = await withTransaction(async (transaction) => {
      return createUserMessage(auth, {
        conversation,
        content,
        metadata: {
          type: "create",
          user: userJson,
          rank,
          context,
        },
        transaction,
      });
    });

    expect(userMessage).toBeDefined();
    expect(userMessage.type).toBe("user_message");
    expect(userMessage.content).toBe(content);
    expect(userMessage.rank).toBe(rank);
    expect(userMessage.version).toBe(0);
    expect(userMessage.user).toEqual(userJson);
    expect(userMessage.context).toEqual(context);
    expect(userMessage.agenticMessageData).toBeUndefined();

    // Verify database records were created
    const { message: messageInDb, userMessage: userMessageInDb } =
      await ConversationFactory.getMessage(auth, userMessage.id);
    expect(messageInDb).not.toBeNull();
    expect(messageInDb?.rank).toBe(rank);
    expect(messageInDb?.version).toBe(0);
    expect(messageInDb?.parentId).toBeNull();

    expect(userMessageInDb).not.toBeNull();
    expect(userMessageInDb?.content).toBe(content);
    expect(userMessageInDb?.userId).toBe(user.id);
    expect(userMessageInDb?.userContextUsername).toBe(context.username);
    expect(userMessageInDb?.userContextTimezone).toBe(context.timezone);
    expect(userMessageInDb?.userContextEmail).toBe(context.email);
    expect(userMessageInDb?.userContextOrigin).toBe(context.origin);
  });

  it("should create a new user message with user attributed from email", async () => {
    const user = auth.getNonNullableUser();
    const userJson = user.toJSON();
    const content = "Hello, this is a test message";
    const rank = 0;

    const context: UserMessageContext = {
      username: userJson.username,
      timezone: "UTC",
      fullName: userJson.fullName,
      email: userJson.email,
      profilePictureUrl: userJson.image,
      origin: "web",
    };

    const userMessage = await withTransaction(async (transaction) => {
      return createUserMessage(auth, {
        conversation,
        content,
        metadata: {
          type: "create",
          user: null, // User should be attributed from email
          rank,
          context,
        },
        transaction,
      });
    });

    expect(userMessage).toBeDefined();
    expect(userMessage.user).not.toBeNull();
    expect(userMessage.user?.email).toBe(userJson.email);
  });

  it("should create a user message with agenticMessageData and originMessage lookup", async () => {
    const user = auth.getNonNullableUser();
    const content = "Hello, this is an agentic message";

    // Create an origin message first with rank 0
    const originMessage = await withTransaction(async (transaction) => {
      const originAgentMessage = await AgentMessageModel.create(
        {
          workspaceId: workspace.id,
          skipToolsValidation: false,
          agentConfigurationId: "not-a-real-agent",
          agentConfigurationVersion: 0,
        },
        { transaction }
      );

      return MessageModel.create(
        {
          sId: generateRandomModelSId(),
          rank: 0,
          conversationId: conversation.id,
          agentMessageId: originAgentMessage.id,
          workspaceId: workspace.id,
        },
        { transaction }
      );
    });

    const userJson = user.toJSON();
    const context: UserMessageContext = {
      username: userJson.username,
      timezone: "UTC",
      fullName: userJson.fullName,
      email: userJson.email,
      profilePictureUrl: userJson.image,
      origin: "web",
    };

    const agenticMessageData: AgenticMessageData = {
      type: "agent_handover",
      originMessageId: originMessage.sId,
    };

    // Create the new message with rank 1 to avoid unique constraint violation
    const rank = 1;
    const userMessage = await withTransaction(async (transaction) => {
      return createUserMessage(auth, {
        conversation,
        content,
        metadata: {
          type: "create",
          user: userJson,
          rank,
          context,
          agenticMessageData,
        },
        transaction,
      });
    });

    expect(userMessage).toBeDefined();
    expect(userMessage.agenticMessageData).toEqual(agenticMessageData);

    // Verify database records
    const { userMessage: userMessageInDb } =
      await ConversationFactory.getMessage(auth, userMessage.id);
    expect(userMessageInDb?.agenticMessageType).toBe("agent_handover");
    expect(userMessageInDb?.agenticOriginMessageId).toBe(originMessage.sId);
  });

  it("should handle agenticMessageData with non-existent originMessage", async () => {
    const user = auth.getNonNullableUser();
    const userJson = user.toJSON();
    const content = "Hello, this is an agentic message";
    const rank = 0;

    const context: UserMessageContext = {
      username: userJson.username,
      timezone: "UTC",
      fullName: userJson.fullName,
      email: userJson.email,
      profilePictureUrl: userJson.image,
      origin: "web",
    };

    const agenticMessageData: AgenticMessageData = {
      type: "run_agent",
      originMessageId: "non-existent-message-id",
    };

    const userMessage = await withTransaction(async (transaction) => {
      return createUserMessage(auth, {
        conversation,
        content,
        metadata: {
          type: "create",
          user: userJson,
          rank,
          context,
          agenticMessageData,
        },
        transaction,
      });
    });

    expect(userMessage).toBeDefined();
    // agenticMessageData is preserved in the API response even if origin message doesn't exist
    expect(userMessage.agenticMessageData).toEqual(agenticMessageData);

    // Verify database records - both fields should be null since origin message doesn't exist
    // The model validation requires agenticMessageType and agenticOriginMessageId to be set together
    const { userMessage: userMessageInDb } =
      await ConversationFactory.getMessage(auth, userMessage.id);
    expect(userMessageInDb?.agenticMessageType).toBeNull();
    expect(userMessageInDb?.agenticOriginMessageId).toBeNull();
  });

  it("should edit an existing user message", async () => {
    const user = auth.getNonNullableUser();
    const originalContent = "Original message";
    const editedContent = "Edited message";

    // Create original message
    const userJson = user.toJSON();
    const originalMessage = await withTransaction(async (transaction) => {
      return createUserMessage(auth, {
        conversation,
        content: originalContent,
        metadata: {
          type: "create",
          user: userJson,
          rank: 0,
          context: {
            username: userJson.username,
            timezone: "UTC",
            fullName: userJson.fullName,
            email: userJson.email,
            profilePictureUrl: userJson.image,
            origin: "web",
          },
        },
        transaction,
      });
    });

    // Edit the message
    const editedMessage = await withTransaction(async (transaction) => {
      return createUserMessage(auth, {
        conversation,
        content: editedContent,
        metadata: {
          type: "edit",
          message: { ...originalMessage, mentions: [], richMentions: [] },
        },
        transaction,
      });
    });

    expect(editedMessage).toBeDefined();
    expect(editedMessage.content).toBe(editedContent);
    expect(editedMessage.version).toBe(originalMessage.version + 1);
    expect(editedMessage.rank).toBe(originalMessage.rank);
    expect(editedMessage.user).toEqual(originalMessage.user);
    expect(editedMessage.context).toEqual(originalMessage.context);

    // Verify database records
    const { message: messageInDb, userMessage: userMessageInDb } =
      await ConversationFactory.getMessage(auth, editedMessage.id);
    expect(messageInDb).not.toBeNull();
    expect(messageInDb?.version).toBe(originalMessage.version + 1);
    expect(messageInDb?.parentId).toBe(originalMessage.id);

    expect(userMessageInDb?.content).toBe(editedContent);
  });

  it("should preserve agenticMessageData when editing", async () => {
    const user = auth.getNonNullableUser();
    const userJson = user.toJSON();

    // Create origin message
    const originMessage = await withTransaction(async (transaction) => {
      const originAgentMessage = await AgentMessageModel.create(
        {
          workspaceId: workspace.id,
          skipToolsValidation: false,
          agentConfigurationId: "not-a-real-agent",
          agentConfigurationVersion: 0,
        },
        { transaction }
      );

      return MessageModel.create(
        {
          sId: generateRandomModelSId(),
          rank: 0,
          conversationId: conversation.id,
          agentMessageId: originAgentMessage.id,
          workspaceId: workspace.id,
        },
        { transaction }
      );
    });

    const agenticMessageData: AgenticMessageData = {
      type: "agent_handover",
      originMessageId: originMessage.sId,
    };

    // Create original message with agenticMessageData
    const originalMessage = await withTransaction(async (transaction) => {
      return createUserMessage(auth, {
        conversation,
        content: "Original agentic message",
        metadata: {
          type: "create",
          user: userJson,
          rank: 1,
          context: {
            username: userJson.username,
            timezone: "UTC",
            fullName: userJson.fullName,
            email: userJson.email,
            profilePictureUrl: userJson.image,
            origin: "web",
          },
          agenticMessageData,
        },
        transaction,
      });
    });

    expect(originalMessage.agenticMessageData).toEqual(agenticMessageData);

    // Edit the message - agenticMessageData should be preserved
    const editedMessage = await withTransaction(async (transaction) => {
      return createUserMessage(auth, {
        conversation,
        content: "Edited agentic message",
        metadata: {
          type: "edit",
          message: { ...originalMessage, mentions: [], richMentions: [] },
        },
        transaction,
      });
    });

    expect(editedMessage).toBeDefined();
    expect(editedMessage.content).toBe("Edited agentic message");
    expect(editedMessage.agenticMessageData).toEqual(agenticMessageData);
    expect(editedMessage.version).toBe(originalMessage.version + 1);
    expect(editedMessage.rank).toBe(originalMessage.rank);

    // Verify database records
    const { userMessage: userMessageInDb } =
      await ConversationFactory.getMessage(auth, editedMessage.id);
    expect(userMessageInDb?.agenticMessageType).toBe("agent_handover");
    expect(userMessageInDb?.agenticOriginMessageId).toBe(originMessage.sId);
  });

  it("should preserve all context fields when editing", async () => {
    const user = auth.getNonNullableUser();
    const userJson = user.toJSON();

    const originalContext: UserMessageContext = {
      username: userJson.username,
      timezone: "America/New_York",
      fullName: "Test User Full Name",
      email: userJson.email,
      profilePictureUrl: "https://example.com/avatar.jpg",
      origin: "slack",
      clientSideMCPServerIds: ["mcp-server-1", "mcp-server-2"],
      selectedMCPServerViewIds: ["view-1"],
      lastTriggerRunAt: Date.now(),
    };

    // Create original message with full context
    const originalMessage = await withTransaction(async (transaction) => {
      return createUserMessage(auth, {
        conversation,
        content: "Original message",
        metadata: {
          type: "create",
          user: userJson,
          rank: 0,
          context: originalContext,
        },
        transaction,
      });
    });

    // Edit the message - context should be preserved
    const editedMessage = await withTransaction(async (transaction) => {
      return createUserMessage(auth, {
        conversation,
        content: "Edited message",
        metadata: {
          type: "edit",
          message: { ...originalMessage, mentions: [], richMentions: [] },
        },
        transaction,
      });
    });

    expect(editedMessage).toBeDefined();
    expect(editedMessage.context).toEqual(originalContext);
    expect(editedMessage.context.timezone).toBe(originalContext.timezone);
    expect(editedMessage.context.fullName).toBe(originalContext.fullName);
    expect(editedMessage.context.profilePictureUrl).toBe(
      originalContext.profilePictureUrl
    );
    expect(editedMessage.context.origin).toBe(originalContext.origin);
    expect(editedMessage.context.clientSideMCPServerIds).toEqual(
      originalContext.clientSideMCPServerIds
    );
    expect(editedMessage.context.selectedMCPServerViewIds).toEqual(
      originalContext.selectedMCPServerViewIds
    );
    expect(editedMessage.context.lastTriggerRunAt).toBe(
      originalContext.lastTriggerRunAt
    );

    // Verify database records
    const { userMessage: userMessageInDb } =
      await ConversationFactory.getMessage(auth, editedMessage.id);
    expect(userMessageInDb?.userContextTimezone).toBe(originalContext.timezone);
    expect(userMessageInDb?.userContextFullName).toBe(originalContext.fullName);
    expect(userMessageInDb?.userContextProfilePictureUrl).toBe(
      originalContext.profilePictureUrl
    );
    expect(userMessageInDb?.userContextOrigin).toBe(originalContext.origin);
    expect(userMessageInDb?.clientSideMCPServerIds).toEqual(
      originalContext.clientSideMCPServerIds
    );
  });

  it("should handle multiple edits with version increments", async () => {
    const user = auth.getNonNullableUser();
    const userJson = user.toJSON();

    // Create original message
    const originalMessage = await withTransaction(async (transaction) => {
      return createUserMessage(auth, {
        conversation,
        content: "Original message",
        metadata: {
          type: "create",
          user: userJson,
          rank: 0,
          context: {
            username: userJson.username,
            timezone: "UTC",
            fullName: userJson.fullName,
            email: userJson.email,
            profilePictureUrl: userJson.image,
            origin: "web",
          },
        },
        transaction,
      });
    });

    expect(originalMessage.version).toBe(0);

    // First edit
    const firstEdit = await withTransaction(async (transaction) => {
      return createUserMessage(auth, {
        conversation,
        content: "First edit",
        metadata: {
          type: "edit",
          message: { ...originalMessage, mentions: [], richMentions: [] },
        },
        transaction,
      });
    });

    expect(firstEdit.version).toBe(1);
    expect(firstEdit.rank).toBe(originalMessage.rank);

    // Verify parentId points to original message
    const { message: firstEditMessageInDb } =
      await ConversationFactory.getMessage(auth, firstEdit.id);
    expect(firstEditMessageInDb?.parentId).toBe(originalMessage.id);

    // Second edit
    const secondEdit = await withTransaction(async (transaction) => {
      return createUserMessage(auth, {
        conversation,
        content: "Second edit",
        metadata: {
          type: "edit",
          message: { ...firstEdit, mentions: [], richMentions: [] },
        },
        transaction,
      });
    });

    expect(secondEdit.version).toBe(2);
    expect(secondEdit.rank).toBe(originalMessage.rank);

    // Verify parentId points to first edit
    const { message: secondEditMessageInDb } =
      await ConversationFactory.getMessage(auth, secondEdit.id);
    expect(secondEditMessageInDb?.parentId).toBe(firstEdit.id);

    // Third edit
    const thirdEdit = await withTransaction(async (transaction) => {
      return createUserMessage(auth, {
        conversation,
        content: "Third edit",
        metadata: {
          type: "edit",
          message: { ...secondEdit, mentions: [], richMentions: [] },
        },
        transaction,
      });
    });

    expect(thirdEdit.version).toBe(3);
    expect(thirdEdit.rank).toBe(originalMessage.rank);

    // Verify parentId points to second edit
    const { message: thirdEditMessageInDb } =
      await ConversationFactory.getMessage(auth, thirdEdit.id);
    expect(thirdEditMessageInDb?.parentId).toBe(secondEdit.id);
  });

  it("should preserve null user when editing", async () => {
    const content = "Original anonymous message";
    const editedContent = "Edited anonymous message";

    // Create original message with null user
    const originalMessage = await withTransaction(async (transaction) => {
      return createUserMessage(auth, {
        conversation,
        content,
        metadata: {
          type: "create",
          user: null,
          rank: 0,
          context: {
            username: "anonymous",
            timezone: "UTC",
            fullName: null,
            email: null,
            profilePictureUrl: null,
            origin: "web",
          },
        },
        transaction,
      });
    });

    expect(originalMessage.user).toBeNull();

    // Edit the message - user should remain null
    const editedMessage = await withTransaction(async (transaction) => {
      return createUserMessage(auth, {
        conversation,
        content: editedContent,
        metadata: {
          type: "edit",
          message: { ...originalMessage, mentions: [], richMentions: [] },
        },
        transaction,
      });
    });

    expect(editedMessage).toBeDefined();
    expect(editedMessage.user).toBeNull();
    expect(editedMessage.content).toBe(editedContent);
    expect(editedMessage.version).toBe(originalMessage.version + 1);
    expect(editedMessage.rank).toBe(originalMessage.rank);

    // Verify database records
    const { userMessage: userMessageInDb } =
      await ConversationFactory.getMessage(auth, editedMessage.id);
    expect(userMessageInDb?.userId).toBeNull();
  });

  it("should preserve user when editing", async () => {
    const user = auth.getNonNullableUser();
    const userJson = user.toJSON();
    const originalContent = "Original message";
    const editedContent = "Edited message";

    // Create original message
    const originalMessage = await withTransaction(async (transaction) => {
      return createUserMessage(auth, {
        conversation,
        content: originalContent,
        metadata: {
          type: "create",
          user: userJson,
          rank: 0,
          context: {
            username: userJson.username,
            timezone: "UTC",
            fullName: userJson.fullName,
            email: userJson.email,
            profilePictureUrl: userJson.image,
            origin: "web",
          },
        },
        transaction,
      });
    });

    // Edit the message - user should be preserved
    const editedMessage = await withTransaction(async (transaction) => {
      return createUserMessage(auth, {
        conversation,
        content: editedContent,
        metadata: {
          type: "edit",
          message: { ...originalMessage, mentions: [], richMentions: [] },
        },
        transaction,
      });
    });

    expect(editedMessage).toBeDefined();
    expect(editedMessage.user).toEqual(userJson);
    expect(editedMessage.user?.id).toBe(userJson.id);
    expect(editedMessage.user?.email).toBe(userJson.email);
    expect(editedMessage.user?.username).toBe(userJson.username);

    // Verify database records
    const { userMessage: userMessageInDb } =
      await ConversationFactory.getMessage(auth, editedMessage.id);
    expect(userMessageInDb?.userId).toBe(userJson.id);
  });

  it("should handle context with all optional fields", async () => {
    const user = auth.getNonNullableUser();
    const userJson = user.toJSON();
    const content = "Hello with full context";
    const rank = 0;

    const context: UserMessageContext = {
      username: userJson.username,
      timezone: "America/New_York",
      fullName: "Test User Full Name",
      email: userJson.email,
      profilePictureUrl: "https://example.com/avatar.jpg",
      origin: "slack",
      clientSideMCPServerIds: ["mcp-server-1", "mcp-server-2"],
      selectedMCPServerViewIds: ["view-1"],
      lastTriggerRunAt: Date.now(),
    };

    const userMessage = await withTransaction(async (transaction) => {
      return createUserMessage(auth, {
        conversation,
        content,
        metadata: {
          type: "create",
          user: userJson,
          rank,
          context,
        },
        transaction,
      });
    });

    expect(userMessage).toBeDefined();
    expect(userMessage.context).toEqual(context);

    // Verify database records
    const { userMessage: userMessageInDb } =
      await ConversationFactory.getMessage(auth, userMessage.id);
    expect(userMessageInDb?.userContextTimezone).toBe(context.timezone);
    expect(userMessageInDb?.userContextFullName).toBe(context.fullName);
    expect(userMessageInDb?.userContextProfilePictureUrl).toBe(
      context.profilePictureUrl
    );
    expect(userMessageInDb?.userContextOrigin).toBe(context.origin);
    expect(userMessageInDb?.clientSideMCPServerIds).toEqual(
      context.clientSideMCPServerIds
    );
    expect(userMessageInDb?.userContextLastTriggerRunAt).not.toBeNull();
  });

  it("should handle context with null optional fields", async () => {
    const user = auth.getNonNullableUser();
    const userJson = user.toJSON();
    const content = "Hello with minimal context";
    const rank = 0;

    const context: UserMessageContext = {
      username: userJson.username,
      timezone: "UTC",
      fullName: null,
      email: null,
      profilePictureUrl: null,
      origin: "web",
    };

    const userMessage = await withTransaction(async (transaction) => {
      return createUserMessage(auth, {
        conversation,
        content,
        metadata: {
          type: "create",
          user: userJson,
          rank,
          context,
        },
        transaction,
      });
    });

    expect(userMessage).toBeDefined();
    expect(userMessage.context).toEqual(context);

    // Verify database records
    const { userMessage: userMessageInDb } =
      await ConversationFactory.getMessage(auth, userMessage.id);
    expect(userMessageInDb?.userContextFullName).toBeNull();
    expect(userMessageInDb?.userContextEmail).toBeNull();
    expect(userMessageInDb?.userContextProfilePictureUrl).toBeNull();
    expect(userMessageInDb?.clientSideMCPServerIds).toEqual([]);
    expect(userMessageInDb?.userContextLastTriggerRunAt).toBeNull();
  });

  it("should create multiple user messages with correct ranks", async () => {
    const user = auth.getNonNullableUser();
    const userJson = user.toJSON();

    const context: UserMessageContext = {
      username: userJson.username,
      timezone: "UTC",
      fullName: userJson.fullName,
      email: userJson.email,
      profilePictureUrl: userJson.image,
      origin: "web",
    };

    const userMessage1 = await withTransaction(async (transaction) => {
      return createUserMessage(auth, {
        conversation,
        content: "First message",
        metadata: {
          type: "create",
          user: userJson,
          rank: 0,
          context,
        },
        transaction,
      });
    });

    const userMessage2 = await withTransaction(async (transaction) => {
      return createUserMessage(auth, {
        conversation,
        content: "Second message",
        metadata: {
          type: "create",
          user: userJson,
          rank: 1,
          context,
        },
        transaction,
      });
    });

    expect(userMessage1.rank).toBe(0);
    expect(userMessage2.rank).toBe(1);
    expect(userMessage1.version).toBe(0);
    expect(userMessage2.version).toBe(0);
  });

  it("should handle user message with null user", async () => {
    const content = "Hello from anonymous user";
    const rank = 0;

    const context: UserMessageContext = {
      username: "anonymous",
      timezone: "UTC",
      fullName: null,
      email: null,
      profilePictureUrl: null,
      origin: "web",
    };

    const userMessage = await withTransaction(async (transaction) => {
      return createUserMessage(auth, {
        conversation,
        content,
        metadata: {
          type: "create",
          user: null,
          rank,
          context,
        },
        transaction,
      });
    });

    expect(userMessage).toBeDefined();
    expect(userMessage.user).toBeNull();

    // Verify database records
    const { userMessage: userMessageInDb } =
      await ConversationFactory.getMessage(auth, userMessage.id);
    expect(userMessageInDb?.userId).toBeNull();
  });
});
