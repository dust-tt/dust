import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock signalAgentUsage before importing the module that uses it
vi.mock("@app/lib/api/assistant/agent_usage", () => ({
  signalAgentUsage: vi.fn(),
}));

import { signalAgentUsage } from "@app/lib/api/assistant/agent_usage";
import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { createConversation } from "@app/lib/api/assistant/conversation";
import { getConversation } from "@app/lib/api/assistant/conversation/fetch";
import {
  createAgentMessages,
  createUserMentions,
  createUserMessage,
  getMentionStatus,
  updateConversationRequirements,
  validateUserMention,
} from "@app/lib/api/assistant/conversation/mentions";
import { getUserForWorkspace } from "@app/lib/api/user";
import { Authenticator } from "@app/lib/auth";
import { AgentConfigurationModel } from "@app/lib/models/agent/agent";
import {
  AgentMessageModel,
  ConversationModel,
  ConversationParticipantModel,
  MentionModel,
  MessageModel,
  UserConversationReadsModel,
} from "@app/lib/models/agent/conversation";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { GroupResource } from "@app/lib/resources/group_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import {
  generateRandomModelSId,
  getResourceIdFromSId,
} from "@app/lib/resources/string_ids";
import { withTransaction } from "@app/lib/utils/sql_utils";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { GroupSpaceFactory } from "@app/tests/utils/GroupSpaceFactory";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { TriggerFactory } from "@app/tests/utils/TriggerFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import type { ContentFragmentInputWithContentNode } from "@app/types/api/internal/assistant";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import type {
  AgenticMessageData,
  ConversationType,
  ConversationWithoutContentType,
  UserMessageContext,
} from "@app/types/assistant/conversation";
import type { AgentMention, MentionType } from "@app/types/assistant/mentions";
import {
  isRichAgentMention,
  isRichUserMention,
} from "@app/types/assistant/mentions";
import type { WorkspaceType } from "@app/types/user";

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

    const { agentMessages, richMentions } = await createAgentMessages(auth, {
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

    expect(agentMessages).toHaveLength(1);
    expect(agentMessages[0].configuration.sId).toBe(agentConfig1.sId);
    expect(agentMessages[0].status).toBe("created");
    expect(agentMessages[0].skipToolsValidation).toBe(false);

    // Verify richMentions are returned correctly
    expect(richMentions).toHaveLength(1);
    expect(isRichAgentMention(richMentions[0])).toBe(true);
    if (isRichAgentMention(richMentions[0])) {
      expect(richMentions[0].id).toBe(agentConfig1.sId);
      expect(richMentions[0].type).toBe("agent");
      expect(richMentions[0].label).toBe(agentConfig1.name);
      expect(richMentions[0].status).toBe("approved");
      expect(richMentions[0].pictureUrl).toBe(agentConfig1.pictureUrl);
      expect(richMentions[0].description).toBe(agentConfig1.description);
    }

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
      await ConversationFactory.getMessage(auth, agentMessages[0].id);
    expect(agentMessageInDb).not.toBeNull();
    expect(agentMessageInDb?.status).toBe("created");

    expect(messageInDb).not.toBeNull();
    expect(messageInDb?.rank).toBe(1);
    expect(messageInDb?.parentId).toBe(messageRow.id);
    expect(messageInDb?.agentMessageId).toBe(agentMessages[0].agentMessageId);
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

    const { agentMessages, richMentions } = await createAgentMessages(auth, {
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

    expect(agentMessages).toHaveLength(2);
    expect(agentMessages[0].configuration.sId).toBe(agentConfig1.sId);
    expect(agentMessages[1].configuration.sId).toBe(agentConfig2.sId);

    // Verify richMentions are returned correctly
    expect(richMentions).toHaveLength(2);
    const agent1Mention = richMentions.find((m) => m.id === agentConfig1.sId);
    const agent2Mention = richMentions.find((m) => m.id === agentConfig2.sId);
    expect(agent1Mention).toBeDefined();
    expect(agent2Mention).toBeDefined();
    if (agent1Mention && isRichAgentMention(agent1Mention)) {
      expect(agent1Mention.type).toBe("agent");
      expect(agent1Mention.label).toBe(agentConfig1.name);
      expect(agent1Mention.status).toBe("approved");
    }
    if (agent2Mention && isRichAgentMention(agent2Mention)) {
      expect(agent2Mention.type).toBe("agent");
      expect(agent2Mention.label).toBe(agentConfig2.name);
      expect(agent2Mention.status).toBe("approved");
    }

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
    const { agentMessages, richMentions } = await createAgentMessages(auth, {
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
    expect(agentMessages).toHaveLength(1);
    expect(agentMessages[0].configuration.sId).toBe(agentConfig1.sId);

    // Verify richMentions only contains the valid agent mention
    expect(richMentions).toHaveLength(1);
    if (isRichAgentMention(richMentions[0])) {
      expect(richMentions[0].id).toBe(agentConfig1.sId);
      expect(richMentions[0].status).toBe("approved");
    }

    // Verify signalAgentUsage was called only for the valid configuration
    expect(signalAgentUsage).toHaveBeenCalledTimes(1);
    expect(signalAgentUsage).toHaveBeenCalledWith({
      agentConfigurationId: agentConfig1.sId,
      workspaceId: workspace.sId,
    });

    // Note: runAgentLoopWorkflow is no longer called from createAgentMessages.
    // It's now called from postUserMessage/editUserMessage after the transaction commits.
  });

  it("should return empty array when no agent mentions are provided", async () => {
    const { userMessage } = await ConversationFactory.createUserMessage({
      auth,
      workspace,
      conversation,
      content: "Hello",
    });

    const { agentMessages, richMentions } = await createAgentMessages(auth, {
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

    expect(agentMessages).toHaveLength(0);

    // Verify richMentions is empty when no agent mentions are provided
    expect(richMentions).toHaveLength(0);

    // Verify signalAgentUsage was not called when no agent mentions are provided
    expect(signalAgentUsage).not.toHaveBeenCalled();
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

    const { agentMessages, richMentions } = await createAgentMessages(auth, {
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

    expect(agentMessages).toHaveLength(1);
    expect(agentMessages[0].skipToolsValidation).toBe(true);

    // Verify richMentions are returned correctly
    expect(richMentions).toHaveLength(1);
    if (isRichAgentMention(richMentions[0])) {
      expect(richMentions[0].id).toBe(agentConfig1.sId);
      expect(richMentions[0].status).toBe("approved");
    }

    // Verify signalAgentUsage was called with correct arguments
    expect(signalAgentUsage).toHaveBeenCalledTimes(1);
    expect(signalAgentUsage).toHaveBeenCalledWith({
      agentConfigurationId: agentConfig1.sId,
      workspaceId: workspace.sId,
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

    const { agentMessages, richMentions } = await createAgentMessages(auth, {
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

    expect(agentMessages).toHaveLength(1);
    expect(agentMessages[0].parentAgentMessageId).toBe(originMessageId);

    // Verify richMentions are returned correctly
    expect(richMentions).toHaveLength(1);
    if (isRichAgentMention(richMentions[0])) {
      expect(richMentions[0].id).toBe(agentConfig1.sId);
      expect(richMentions[0].status).toBe("approved");
    }

    // Verify signalAgentUsage was called with correct arguments
    expect(signalAgentUsage).toHaveBeenCalledTimes(1);
    expect(signalAgentUsage).toHaveBeenCalledWith({
      agentConfigurationId: agentConfig1.sId,
      workspaceId: workspace.sId,
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

    const { agentMessages, richMentions } = await createAgentMessages(auth, {
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

    expect(agentMessages).toHaveLength(1);
    expect(agentMessages[0].parentAgentMessageId).toBeNull();

    // Verify richMentions are returned correctly
    expect(richMentions).toHaveLength(1);
    if (isRichAgentMention(richMentions[0])) {
      expect(richMentions[0].id).toBe(agentConfig1.sId);
      expect(richMentions[0].status).toBe("approved");
    }

    // Verify signalAgentUsage was called with correct arguments
    expect(signalAgentUsage).toHaveBeenCalledTimes(1);
    expect(signalAgentUsage).toHaveBeenCalledWith({
      agentConfigurationId: agentConfig1.sId,
      workspaceId: workspace.sId,
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

    const { agentMessages, richMentions } = await createAgentMessages(auth, {
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

    expect(agentMessages).toHaveLength(2);
    // Note: The function increments nextMessageRank internally, so ranks should be 10 and 11
    expect(agentMessages[0].rank).toBe(nextMessageRank);
    expect(agentMessages[1].rank).toBe(nextMessageRank + 1);

    // Verify richMentions are returned correctly
    expect(richMentions).toHaveLength(2);
    const agent1Mention = richMentions.find((m) => m.id === agentConfig1.sId);
    const agent2Mention = richMentions.find((m) => m.id === agentConfig2.sId);
    expect(agent1Mention).toBeDefined();
    expect(agent2Mention).toBeDefined();
    if (agent1Mention && isRichAgentMention(agent1Mention)) {
      expect(agent1Mention.status).toBe("approved");
    }
    if (agent2Mention && isRichAgentMention(agent2Mention)) {
      expect(agent2Mention.status).toBe("approved");
    }

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
    const { richMentions } = await withTransaction(async (transaction) => {
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

    // Verify richMentions are returned correctly
    expect(richMentions).toHaveLength(1);
    if (isRichAgentMention(richMentions[0])) {
      expect(richMentions[0].id).toBe(agentConfig.sId);
      expect(richMentions[0].status).toBe("approved");
    }

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
    const { richMentions } = await withTransaction(async (transaction) => {
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

    // Verify richMentions are returned correctly
    expect(richMentions).toHaveLength(1);
    if (isRichAgentMention(richMentions[0])) {
      expect(richMentions[0].id).toBe(agentConfig.sId);
      expect(richMentions[0].status).toBe("approved");
    }

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
    const { richMentions } = await withTransaction(async (transaction) => {
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

    // Verify richMentions are returned correctly
    expect(richMentions).toHaveLength(1);
    if (isRichAgentMention(richMentions[0])) {
      expect(richMentions[0].id).toBe(agentConfig.sId);
      expect(richMentions[0].status).toBe("approved");
    }

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

  it("should deduplicate agent mentions and create only unique agent messages", async () => {
    const { messageRow, userMessage } =
      await ConversationFactory.createUserMessage({
        auth,
        workspace,
        conversation,
        content: `Hello @${agentConfig1.name}`,
      });

    // Create duplicate mentions for the same agent
    const mentions: MentionType[] = [
      {
        configurationId: agentConfig1.sId,
      } as AgentMention,
      {
        configurationId: agentConfig1.sId,
      } as AgentMention,
      {
        configurationId: agentConfig1.sId,
      } as AgentMention,
    ];

    const { agentMessages, richMentions } = await createAgentMessages(auth, {
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

    // Should only create one agent message despite 3 duplicate mentions
    expect(agentMessages).toHaveLength(1);
    expect(agentMessages[0].configuration.sId).toBe(agentConfig1.sId);

    // Should only have one rich mention
    expect(richMentions).toHaveLength(1);
    expect(richMentions[0].id).toBe(agentConfig1.sId);
    if (isRichAgentMention(richMentions[0])) {
      expect(richMentions[0].status).toBe("approved");
    }

    // Verify only one mention was created in the database
    const mentionsInDb = await MentionModel.findAll({
      where: {
        workspaceId: workspace.id,
        messageId: messageRow.id,
      },
    });
    expect(mentionsInDb).toHaveLength(1);
    expect(mentionsInDb[0].agentConfigurationId).toBe(agentConfig1.sId);

    // Verify signalAgentUsage was called only once
    expect(signalAgentUsage).toHaveBeenCalledTimes(1);
    expect(signalAgentUsage).toHaveBeenCalledWith({
      agentConfigurationId: agentConfig1.sId,
      workspaceId: workspace.sId,
    });
  });

  describe("conversations that belong to a space", () => {
    it("should create agent messages when agent only uses the conversation's space", async () => {
      // Create a space for the conversation
      const conversationSpace = await SpaceFactory.regular(workspace);
      const user = auth.getNonNullableUser();
      const adminAuth = await Authenticator.internalAdminForWorkspace(
        workspace.sId
      );
      // Add user to the space so they can create conversations in it
      const addMembersRes = await conversationSpace.addMembers(adminAuth, {
        userIds: [user.sId],
      });
      expect(addMembersRes.isOk()).toBe(true);

      // Create a fresh authenticator after adding user to space to refresh permissions
      const userAuth = await Authenticator.fromUserIdAndWorkspaceId(
        user.sId,
        workspace.sId
      );

      // Refresh the space to get updated permissions
      const refreshedConversationSpace = await SpaceResource.fetchById(
        userAuth,
        conversationSpace.sId
      );
      expect(refreshedConversationSpace).not.toBeNull();

      // Create conversation in the space
      const spaceConversation = await createConversation(userAuth, {
        title: "Space Conversation",
        visibility: "unlisted",
        spaceId: refreshedConversationSpace!.id,
      });

      // Create agent configuration that only uses the conversation's space
      const agentConfig = await AgentConfigurationFactory.createTestAgent(
        auth,
        {
          name: "Space Agent",
        }
      );

      const spaceModelId = getResourceIdFromSId(conversationSpace.sId);
      expect(spaceModelId).not.toBeNull();

      await AgentConfigurationModel.update(
        {
          requestedSpaceIds: [spaceModelId!],
        },
        {
          where: {
            workspaceId: workspace.id,
            sId: agentConfig.sId,
            version: agentConfig.version,
          },
        }
      );

      const updatedAgentConfig = await getAgentConfiguration(auth, {
        agentId: agentConfig.sId,
        agentVersion: agentConfig.version,
        variant: "light",
      });
      expect(updatedAgentConfig).not.toBeNull();

      const { userMessage } = await ConversationFactory.createUserMessage({
        auth,
        workspace,
        conversation: spaceConversation,
        content: `Hello @${agentConfig.name}`,
      });

      const mentions: MentionType[] = [
        {
          configurationId: agentConfig.sId,
        } satisfies AgentMention,
      ];

      const { agentMessages, richMentions } = await createAgentMessages(auth, {
        conversation: spaceConversation,
        metadata: {
          type: "create",
          mentions,
          agentConfigurations: [updatedAgentConfig!],
          skipToolsValidation: false,
          nextMessageRank: 1,
          userMessage,
        },
      });

      // Should create agent message successfully
      expect(agentMessages).toHaveLength(1);
      expect(agentMessages[0].configuration.sId).toBe(agentConfig.sId);

      // Verify richMentions are returned correctly
      expect(richMentions).toHaveLength(1);
      if (isRichAgentMention(richMentions[0])) {
        expect(richMentions[0].id).toBe(agentConfig.sId);
        expect(richMentions[0].status).toBe("approved");
      }

      // Verify mention was created with approved status
      const mentionInDb = await MentionModel.findOne({
        where: {
          workspaceId: workspace.id,
          messageId: userMessage.id,
          agentConfigurationId: agentConfig.sId,
        },
      });
      expect(mentionInDb).not.toBeNull();
      expect(mentionInDb?.status).toBe("approved");
    });

    it("should reject agent mentions when agent uses restricted spaces other than conversation's space", async () => {
      // Create a space for the conversation
      const conversationSpace = await SpaceFactory.regular(workspace);
      const user = auth.getNonNullableUser();
      const adminAuth = await Authenticator.internalAdminForWorkspace(
        workspace.sId
      );
      await conversationSpace.addMembers(adminAuth, {
        userIds: [user.sId],
      });

      // Create a fresh authenticator after adding user to space to refresh permissions
      const userAuth = await Authenticator.fromUserIdAndWorkspaceId(
        user.sId,
        workspace.sId
      );

      // Create a restricted space (regular space without global group)
      // SpaceFactory.regular creates a space with a regular group, which is restricted by default
      const restrictedSpace = await SpaceFactory.regular(workspace);
      // Refresh to get updated groups
      const refreshedRestrictedSpace = await SpaceResource.fetchById(
        adminAuth,
        restrictedSpace.sId
      );
      expect(refreshedRestrictedSpace).not.toBeNull();
      // Regular spaces created by SpaceFactory.regular are restricted (no global group)
      expect(refreshedRestrictedSpace?.isOpen()).toBe(false);

      // Refresh the conversation space to get updated permissions
      const refreshedConversationSpace = await SpaceResource.fetchById(
        userAuth,
        conversationSpace.sId
      );
      expect(refreshedConversationSpace).not.toBeNull();

      // Create conversation in the conversationSpace
      const spaceConversation = await createConversation(userAuth, {
        title: "Space Conversation",
        visibility: "unlisted",
        spaceId: conversationSpace.id,
      });

      // Create agent configuration that uses both the conversation's space and a restricted space
      const agentConfig = await AgentConfigurationFactory.createTestAgent(
        auth,
        {
          name: "Restricted Space Agent",
        }
      );

      const conversationSpaceModelId = getResourceIdFromSId(
        conversationSpace.sId
      );
      const restrictedSpaceModelId = getResourceIdFromSId(
        refreshedRestrictedSpace!.sId
      );
      expect(conversationSpaceModelId).not.toBeNull();
      expect(restrictedSpaceModelId).not.toBeNull();

      await AgentConfigurationModel.update(
        {
          requestedSpaceIds: [
            conversationSpaceModelId!,
            restrictedSpaceModelId!,
          ],
        },
        {
          where: {
            workspaceId: workspace.id,
            sId: agentConfig.sId,
            version: agentConfig.version,
          },
        }
      );

      // Manually construct the updated agent config with requestedSpaceIds as sIds
      // We can't use getAgentConfiguration because it filters by space access,
      // and the agent now has restricted space requirements
      const updatedAgentConfig: LightAgentConfigurationType = {
        ...agentConfig,
        requestedSpaceIds: [
          conversationSpace.sId,
          refreshedRestrictedSpace!.sId,
        ],
      };

      const { userMessage } = await ConversationFactory.createUserMessage({
        auth: userAuth,
        workspace,
        conversation: spaceConversation,
        content: `Hello @${agentConfig.name}`,
      });

      const mentions: MentionType[] = [
        {
          configurationId: agentConfig.sId,
        } satisfies AgentMention,
      ];

      const { agentMessages, richMentions } = await createAgentMessages(
        userAuth,
        {
          conversation: spaceConversation,
          metadata: {
            type: "create",
            mentions,
            agentConfigurations: [updatedAgentConfig],
            skipToolsValidation: false,
            nextMessageRank: 1,
            userMessage,
          },
        }
      );

      // Should NOT create agent message because agent uses restricted space
      expect(agentMessages).toHaveLength(0);

      // Verify richMentions shows the restriction
      expect(richMentions).toHaveLength(1);
      if (isRichAgentMention(richMentions[0])) {
        expect(richMentions[0].id).toBe(agentConfig.sId);
        expect(richMentions[0].status).toBe("agent_restricted_by_space_usage");
      }

      // Verify mention was created with restricted status
      const mentionInDb = await MentionModel.findOne({
        where: {
          workspaceId: workspace.id,
          messageId: userMessage.id,
          agentConfigurationId: agentConfig.sId,
        },
      });
      expect(mentionInDb).not.toBeNull();
      expect(mentionInDb?.status).toBe("agent_restricted_by_space_usage");
    });

    it("should allow agent mentions when agent uses global space other than conversation's space", async () => {
      // Create a space for the conversation
      const conversationSpace = await SpaceFactory.regular(workspace);
      const user = auth.getNonNullableUser();
      const adminAuth = await Authenticator.internalAdminForWorkspace(
        workspace.sId
      );
      await conversationSpace.addMembers(adminAuth, {
        userIds: [user.sId],
      });

      // Create a fresh authenticator after adding user to space to refresh permissions
      const userAuth = await Authenticator.fromUserIdAndWorkspaceId(
        user.sId,
        workspace.sId
      );

      // Fetch the global space
      const globalSpace =
        await SpaceResource.fetchWorkspaceGlobalSpace(adminAuth);
      expect(globalSpace).not.toBeNull();
      expect(globalSpace.isGlobal()).toBe(true);

      // Refresh the conversation space to get updated permissions
      const refreshedConversationSpace = await SpaceResource.fetchById(
        userAuth,
        conversationSpace.sId
      );
      expect(refreshedConversationSpace).not.toBeNull();

      // Create conversation in the conversationSpace
      const spaceConversation = await createConversation(userAuth, {
        title: "Space Conversation",
        visibility: "unlisted",
        spaceId: refreshedConversationSpace!.id,
      });

      // Create agent configuration that uses both the conversation's space and the global space
      const agentConfig = await AgentConfigurationFactory.createTestAgent(
        userAuth,
        {
          name: "Global Space Agent",
        }
      );

      const conversationSpaceModelId = getResourceIdFromSId(
        refreshedConversationSpace!.sId
      );
      const globalSpaceModelId = getResourceIdFromSId(globalSpace.sId);
      expect(conversationSpaceModelId).not.toBeNull();
      expect(globalSpaceModelId).not.toBeNull();

      await AgentConfigurationModel.update(
        {
          requestedSpaceIds: [conversationSpaceModelId!, globalSpaceModelId!],
        },
        {
          where: {
            workspaceId: workspace.id,
            sId: agentConfig.sId,
            version: agentConfig.version,
          },
        }
      );

      // Manually construct the updated agent config with requestedSpaceIds as sIds
      // We can't use getAgentConfiguration because it filters by space access,
      // and the agent now has global space requirements
      const updatedAgentConfig: LightAgentConfigurationType = {
        ...agentConfig,
        requestedSpaceIds: [refreshedConversationSpace!.sId, globalSpace.sId],
      };

      const { userMessage } = await ConversationFactory.createUserMessage({
        auth: userAuth,
        workspace,
        conversation: spaceConversation,
        content: `Hello @${agentConfig.name}`,
      });

      const mentions: MentionType[] = [
        {
          configurationId: agentConfig.sId,
        } satisfies AgentMention,
      ];

      const { agentMessages, richMentions } = await createAgentMessages(
        userAuth,
        {
          conversation: spaceConversation,
          metadata: {
            type: "create",
            mentions,
            agentConfigurations: [updatedAgentConfig],
            skipToolsValidation: false,
            nextMessageRank: 1,
            userMessage,
          },
        }
      );

      // Should create agent message successfully because global space is allowed
      expect(agentMessages).toHaveLength(1);
      expect(agentMessages[0].configuration.sId).toBe(agentConfig.sId);

      // Verify richMentions are returned correctly
      expect(richMentions).toHaveLength(1);
      if (isRichAgentMention(richMentions[0])) {
        expect(richMentions[0].id).toBe(agentConfig.sId);
        expect(richMentions[0].status).toBe("approved");
      }

      // Verify mention was created with approved status
      const mentionInDb = await MentionModel.findOne({
        where: {
          workspaceId: workspace.id,
          messageId: userMessage.id,
          agentConfigurationId: agentConfig.sId,
        },
      });
      expect(mentionInDb).not.toBeNull();
      expect(mentionInDb?.status).toBe("approved");
    });

    it("should allow agent mentions when agent uses open spaces other than conversation's space", async () => {
      // Create a space for the conversation
      const conversationSpace = await SpaceFactory.regular(workspace);
      const user = auth.getNonNullableUser();
      const adminAuth = await Authenticator.internalAdminForWorkspace(
        workspace.sId
      );
      await conversationSpace.addMembers(adminAuth, {
        userIds: [user.sId],
      });

      // Create a fresh authenticator after adding user to space to refresh permissions
      const userAuth = await Authenticator.fromUserIdAndWorkspaceId(
        user.sId,
        workspace.sId
      );

      // Create an open space (regular space with global group)
      const openSpace = await SpaceFactory.regular(workspace);
      // Add global group to make it open
      const globalGroupRes =
        await GroupResource.fetchWorkspaceGlobalGroup(adminAuth);
      expect(globalGroupRes.isOk()).toBe(true);
      if (!globalGroupRes.isOk()) {
        throw new Error("Failed to fetch global group");
      }
      const globalGroup = globalGroupRes.value;

      // Add global group directly to make it open (if not already there)
      const existingGroupIds = openSpace.groups.map((g) => g.sId);
      const hasGlobalGroup = existingGroupIds.includes(globalGroup.sId);

      // If global group is not already there, associate it directly
      if (!hasGlobalGroup) {
        await GroupSpaceFactory.associate(openSpace, globalGroup);
      }

      // Refresh to get updated groups
      const refreshedOpenSpace = await SpaceResource.fetchById(
        adminAuth,
        openSpace.sId
      );
      expect(refreshedOpenSpace).not.toBeNull();
      expect(refreshedOpenSpace?.isOpen()).toBe(true);
      // Verify it's not global
      expect(refreshedOpenSpace?.isGlobal()).toBe(false);

      // Refresh the conversation space to get updated permissions
      const refreshedConversationSpace = await SpaceResource.fetchById(
        userAuth,
        conversationSpace.sId
      );
      expect(refreshedConversationSpace).not.toBeNull();

      // Create conversation in the conversationSpace
      const spaceConversation = await createConversation(userAuth, {
        title: "Space Conversation",
        visibility: "unlisted",
        spaceId: refreshedConversationSpace!.id,
      });

      // Create agent configuration that uses both the conversation's space and an open space
      const agentConfig = await AgentConfigurationFactory.createTestAgent(
        userAuth,
        {
          name: "Open Space Agent",
        }
      );

      const conversationSpaceModelId = getResourceIdFromSId(
        refreshedConversationSpace!.sId
      );
      const openSpaceModelId = getResourceIdFromSId(refreshedOpenSpace!.sId);
      expect(conversationSpaceModelId).not.toBeNull();
      expect(openSpaceModelId).not.toBeNull();

      await AgentConfigurationModel.update(
        {
          requestedSpaceIds: [conversationSpaceModelId!, openSpaceModelId!],
        },
        {
          where: {
            workspaceId: workspace.id,
            sId: agentConfig.sId,
            version: agentConfig.version,
          },
        }
      );

      // Manually construct the updated agent config with requestedSpaceIds as sIds
      const updatedAgentConfig: LightAgentConfigurationType = {
        ...agentConfig,
        requestedSpaceIds: [
          refreshedConversationSpace!.sId,
          refreshedOpenSpace!.sId,
        ],
      };

      const { userMessage } = await ConversationFactory.createUserMessage({
        auth: userAuth,
        workspace,
        conversation: spaceConversation,
        content: `Hello @${agentConfig.name}`,
      });

      const mentions: MentionType[] = [
        {
          configurationId: agentConfig.sId,
        } satisfies AgentMention,
      ];

      const { agentMessages, richMentions } = await createAgentMessages(
        userAuth,
        {
          conversation: spaceConversation,
          metadata: {
            type: "create",
            mentions,
            agentConfigurations: [updatedAgentConfig],
            skipToolsValidation: false,
            nextMessageRank: 1,
            userMessage,
          },
        }
      );

      // Should create agent message successfully because open spaces are now allowed
      expect(agentMessages).toHaveLength(1);
      expect(agentMessages[0].configuration.sId).toBe(agentConfig.sId);

      // Verify richMentions are returned correctly
      expect(richMentions).toHaveLength(1);
      if (isRichAgentMention(richMentions[0])) {
        expect(richMentions[0].id).toBe(agentConfig.sId);
        expect(richMentions[0].status).toBe("approved");
      }

      // Verify mention was created with approved status
      const mentionInDb = await MentionModel.findOne({
        where: {
          workspaceId: workspace.id,
          messageId: userMessage.id,
          agentConfigurationId: agentConfig.sId,
        },
      });
      expect(mentionInDb).not.toBeNull();
      expect(mentionInDb?.status).toBe("approved");
    });
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
      status: "pending_conversation_access",
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
      status: "pending_conversation_access",
    });
    expect(user2Mention).toMatchObject({
      id: user2.sId,
      type: "user",
      label: user2Json.fullName,
      status: "pending_conversation_access",
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
      status: "pending_conversation_access",
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

  it("should deduplicate user mentions and create only unique mentions", async () => {
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

    // Create duplicate mentions for the same user
    const mentions: MentionType[] = [
      {
        type: "user",
        userId: mentionedUser.sId.toString(),
      },
      {
        type: "user",
        userId: mentionedUser.sId.toString(),
      },
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

    // Should only return one rich mention despite 3 duplicate mentions
    expect(result).toBeInstanceOf(Array);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: mentionedUser.sId,
      type: "user",
      status: "pending_conversation_access",
    });
    expect(isRichUserMention(result[0])).toBe(true);

    // Verify only one mention was stored in the database
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
        status: "pending_conversation_access",
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
      expect(mentionInDb?.status).toBe("pending_conversation_access");
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
        { name: "Test Agent" }
      );

      const { agentMessage } = await ConversationFactory.createAgentMessage({
        workspace,
        conversation,
        agentConfig,
      });

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

      // Verify return value - auto-approved because user is already a participant
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: mentionedUser.sId,
        type: "user",
        status: "approved",
      });
      expect(isRichUserMention(result[0])).toBe(true);
    });

    it("should require approval for mentions in agent messages (non-triggered conversation)", async () => {
      const mentionedUser = await UserFactory.basic();
      await MembershipFactory.associate(workspace, mentionedUser, {
        role: "user",
      });

      // Create an agent message
      const agentConfig = await AgentConfigurationFactory.createTestAgent(
        auth,
        { name: "Test Agent" }
      );

      const { agentMessage } = await ConversationFactory.createAgentMessage({
        workspace,
        conversation,
        agentConfig,
      });

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

      // Verify return value - requires approval (pending status)
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: mentionedUser.sId,
        type: "user",
        status: "pending_conversation_access",
      });
      expect(isRichUserMention(result[0])).toBe(true);
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
      const trigger = await TriggerFactory.webhook(auth, {
        name: "Test Trigger",
        agentConfigurationId: triggerAgentConfig.sId,
        status: "enabled",
        configuration: { includePayload: true },
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

      const { agentMessage } = await ConversationFactory.createAgentMessage({
        workspace,
        conversation: updatedConversation,
        agentConfig: updatedAgentConfig!,
      });

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

      // Verify return value - auto-approved because user is mentioned in instructions
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: mentionedUser.sId,
        type: "user",
        status: "approved",
      });
      expect(isRichUserMention(result[0])).toBe(true);
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
      const trigger = await TriggerFactory.webhook(auth, {
        name: "Test Trigger",
        agentConfigurationId: triggerAgentConfig.sId,
        status: "enabled",
        configuration: { includePayload: true },
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

      const { agentMessage } = await ConversationFactory.createAgentMessage({
        workspace,
        conversation: updatedConversation,
        agentConfig: updatedAgentConfig!,
      });

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

      // Verify return value - requires approval because user is NOT mentioned in instructions
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: mentionedUser.sId,
        type: "user",
        status: "pending_conversation_access",
      });
      expect(isRichUserMention(result[0])).toBe(true);
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
      const trigger = await TriggerFactory.webhook(auth, {
        name: "Test Trigger",
        agentConfigurationId: triggerAgentConfig.sId,
        status: "enabled",
        configuration: { includePayload: true },
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

      const { agentMessage } = await ConversationFactory.createAgentMessage({
        workspace,
        conversation: updatedConversation,
        agentConfig: updatedAgentConfig!,
      });

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

      // Verify return value - requires approval because instructions are null
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: mentionedUser.sId,
        type: "user",
        status: "pending_conversation_access",
      });
      expect(isRichUserMention(result[0])).toBe(true);
    });
  });

  describe("users that cannot access the conversation", () => {
    it("should set status to user_restricted_by_conversation_access when user cannot access conversation", async () => {
      // Create a restricted space
      // SpaceFactory.regular creates a space with a regular group, which is restricted by default
      const restrictedSpace = await SpaceFactory.regular(workspace);
      const adminAuth = await Authenticator.internalAdminForWorkspace(
        workspace.sId
      );
      // Refresh to get updated groups
      const refreshedRestrictedSpace = await SpaceResource.fetchById(
        adminAuth,
        restrictedSpace.sId
      );
      expect(refreshedRestrictedSpace).not.toBeNull();
      // Regular spaces created by SpaceFactory.regular are restricted (no global group)
      expect(refreshedRestrictedSpace?.isOpen()).toBe(false);

      // Create a user who is NOT a member of the restricted space
      const mentionedUser = await UserFactory.basic();
      await MembershipFactory.associate(workspace, mentionedUser, {
        role: "user",
      });

      // Create a conversation with requestedSpaceIds that includes the restricted space
      const restrictedSpaceModelId = getResourceIdFromSId(
        refreshedRestrictedSpace!.sId
      );
      expect(restrictedSpaceModelId).not.toBeNull();

      const restrictedConversation = await ConversationFactory.create(auth, {
        agentConfigurationId: "test-agent",
        messagesCreatedAt: [],
        visibility: "unlisted",
        requestedSpaceIds: [restrictedSpaceModelId!],
      });

      // Verify the mentioned user cannot access the conversation
      const canAccess = await ConversationResource.canAccess(
        await Authenticator.fromUserIdAndWorkspaceId(
          mentionedUser.sId,
          workspace.sId
        ),
        restrictedConversation.sId
      );
      expect(canAccess).toBe("conversation_access_restricted");

      const { userMessage } = await ConversationFactory.createUserMessage({
        auth,
        workspace,
        conversation: restrictedConversation,
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
        conversation: restrictedConversation,
      });

      // Verify return value shows restricted status
      expect(result).toBeInstanceOf(Array);
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: mentionedUser.sId,
        type: "user",
        status: "user_restricted_by_conversation_access",
      });
      expect(isRichUserMention(result[0])).toBe(true);

      // Verify mention was stored with restricted status
      const mentionInDb = await MentionModel.findOne({
        where: {
          workspaceId: workspace.id,
          messageId: userMessage.id,
          userId: mentionedUser.id,
        },
      });
      expect(mentionInDb).not.toBeNull();
      expect(mentionInDb?.status).toBe(
        "user_restricted_by_conversation_access"
      );
    });

    it("should set status to approved when user can access conversation even if not a participant", async () => {
      const adminAuth = await Authenticator.internalAdminForWorkspace(
        workspace.sId
      );
      // Create an open space (regular space with global group)
      const openSpace = await SpaceFactory.regular(workspace);
      // Add global group to make it open
      const globalGroupRes =
        await GroupResource.fetchWorkspaceGlobalGroup(adminAuth);
      expect(globalGroupRes.isOk()).toBe(true);
      if (!globalGroupRes.isOk()) {
        throw new Error("Failed to fetch global group");
      }
      const globalGroup = globalGroupRes.value;

      // Add global group directly to make it open (if not already there)
      const existingGroupIds = openSpace.groups.map((g) => g.sId);
      const hasGlobalGroup = existingGroupIds.includes(globalGroup.sId);

      // If global group is not already there, associate it directly
      if (!hasGlobalGroup) {
        await GroupSpaceFactory.associate(openSpace, globalGroup);
      }

      // Refresh to get updated groups
      const refreshedOpenSpace = await SpaceResource.fetchById(
        adminAuth,
        openSpace.sId
      );
      expect(refreshedOpenSpace).not.toBeNull();
      expect(refreshedOpenSpace?.isOpen()).toBe(true);

      // Create a user who can access the space (all users can access open spaces)
      const mentionedUser = await UserFactory.basic();
      await MembershipFactory.associate(workspace, mentionedUser, {
        role: "user",
      });

      // Create a conversation with requestedSpaceIds that includes the open space
      const openSpaceModelId = getResourceIdFromSId(refreshedOpenSpace!.sId);
      expect(openSpaceModelId).not.toBeNull();

      const openConversation = await ConversationFactory.create(auth, {
        agentConfigurationId: "test-agent",
        messagesCreatedAt: [],
        visibility: "unlisted",
        requestedSpaceIds: [openSpaceModelId!],
      });

      // Verify the mentioned user can access the conversation
      const canAccess = await ConversationResource.canAccess(
        await Authenticator.fromUserIdAndWorkspaceId(
          mentionedUser.sId,
          workspace.sId
        ),
        openConversation.sId
      );
      expect(canAccess).toBe("allowed");

      const { userMessage } = await ConversationFactory.createUserMessage({
        auth,
        workspace,
        conversation: openConversation,
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
        conversation: openConversation,
      });

      // Verify return value shows pending status (not restricted, but requires approval for user messages)
      expect(result).toBeInstanceOf(Array);
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: mentionedUser.sId,
        type: "user",
        status: "pending_conversation_access",
      });
      expect(isRichUserMention(result[0])).toBe(true);

      // Verify mention was stored with pending status (not restricted)
      const mentionInDb = await MentionModel.findOne({
        where: {
          workspaceId: workspace.id,
          messageId: userMessage.id,
          userId: mentionedUser.id,
        },
      });
      expect(mentionInDb).not.toBeNull();
      expect(mentionInDb?.status).toBe("pending_conversation_access");
      expect(mentionInDb?.status).not.toBe(
        "user_restricted_by_conversation_access"
      );
    });

    it("should prioritize user_restricted_by_conversation_access over auto-approval", async () => {
      // Create a restricted space
      // SpaceFactory.regular creates a space with a regular group, which is restricted by default
      const restrictedSpace = await SpaceFactory.regular(workspace);
      const adminAuth = await Authenticator.internalAdminForWorkspace(
        workspace.sId
      );
      // Refresh to get updated groups
      const refreshedRestrictedSpace = await SpaceResource.fetchById(
        adminAuth,
        restrictedSpace.sId
      );
      expect(refreshedRestrictedSpace).not.toBeNull();
      // Regular spaces created by SpaceFactory.regular are restricted (no global group)
      expect(refreshedRestrictedSpace?.isOpen()).toBe(false);

      // Create a user who is NOT a member of the restricted space
      const mentionedUser = await UserFactory.basic();
      await MembershipFactory.associate(workspace, mentionedUser, {
        role: "user",
      });

      // Create a conversation with requestedSpaceIds that includes the restricted space
      const restrictedSpaceModelId = getResourceIdFromSId(
        refreshedRestrictedSpace!.sId
      );
      expect(restrictedSpaceModelId).not.toBeNull();

      const restrictedConversation = await ConversationFactory.create(auth, {
        agentConfigurationId: "test-agent",
        messagesCreatedAt: [],
        visibility: "unlisted",
        requestedSpaceIds: [restrictedSpaceModelId!],
      });

      // Add user as participant first (which would normally auto-approve)
      await ConversationResource.upsertParticipation(auth, {
        conversation: restrictedConversation,
        action: "subscribed",
        user: mentionedUser.toJSON(),
      });

      // Create an agent message
      const agentConfig = await AgentConfigurationFactory.createTestAgent(
        auth,
        { name: "Test Agent" }
      );

      const { agentMessage } = await ConversationFactory.createAgentMessage({
        workspace,
        conversation: restrictedConversation,
        agentConfig,
      });

      const mentions: MentionType[] = [
        {
          type: "user",
          userId: mentionedUser.sId.toString(),
        },
      ];

      const result = await createUserMentions(auth, {
        mentions,
        message: agentMessage,
        conversation: restrictedConversation,
      });

      // Verify return value - restricted status takes priority over auto-approval
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: mentionedUser.sId,
        type: "user",
        status: "user_restricted_by_conversation_access",
      });
      expect(isRichUserMention(result[0])).toBe(true);
    });
  });

  describe("project space members", () => {
    it("should auto-approve mentions for users who are members of the project space", async () => {
      // Create a project space
      const projectSpace = await SpaceFactory.project(workspace);
      const adminAuth = await Authenticator.internalAdminForWorkspace(
        workspace.sId
      );

      // Create a user who will be mentioned
      const mentionedUser = await UserFactory.basic();
      await MembershipFactory.associate(workspace, mentionedUser, {
        role: "user",
      });

      // Add the mentioned user to the project space
      const addMembersRes = await projectSpace.addMembers(adminAuth, {
        userIds: [mentionedUser.sId],
      });
      expect(addMembersRes.isOk()).toBe(true);

      // Create a conversation in the project space
      const user = auth.getNonNullableUser();
      await projectSpace.addMembers(adminAuth, {
        userIds: [user.sId],
      });

      // Create a fresh authenticator after adding user to space to refresh permissions
      const userAuth = await Authenticator.fromUserIdAndWorkspaceId(
        user.sId,
        workspace.sId
      );

      const refreshedProjectSpace = await SpaceResource.fetchById(
        userAuth,
        projectSpace.sId
      );
      expect(refreshedProjectSpace).not.toBeNull();

      const projectConversation = await createConversation(userAuth, {
        title: "Project Conversation",
        visibility: "unlisted",
        spaceId: refreshedProjectSpace!.id,
      });

      // Create an agent message
      const agentConfig = await AgentConfigurationFactory.createTestAgent(
        auth,
        {
          name: "Test Agent",
        }
      );

      const { agentMessage } = await ConversationFactory.createAgentMessage({
        workspace,
        conversation: projectConversation,
        agentConfig,
      });

      const mentions: MentionType[] = [
        {
          type: "user",
          userId: mentionedUser.sId.toString(),
        },
      ];

      const result = await createUserMentions(userAuth, {
        mentions,
        message: agentMessage,
        conversation: projectConversation,
      });

      // Verify return value shows approved status (auto-approved for project space members)
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: mentionedUser.sId,
        type: "user",
        status: "approved",
      });
      expect(isRichUserMention(result[0])).toBe(true);
    });

    it("should require approval for mentions of users who are NOT members of the project space", async () => {
      // Create a project space
      const projectSpace = await SpaceFactory.project(workspace);
      const adminAuth = await Authenticator.internalAdminForWorkspace(
        workspace.sId
      );

      // Create a user who will be mentioned but is NOT a member of the project space
      const mentionedUser = await UserFactory.basic();
      await MembershipFactory.associate(workspace, mentionedUser, {
        role: "user",
      });

      // Create a conversation in the project space
      const user = auth.getNonNullableUser();
      await projectSpace.addMembers(adminAuth, {
        userIds: [user.sId],
      });

      // Create a fresh authenticator after adding user to space to refresh permissions
      const userAuth = await Authenticator.fromUserIdAndWorkspaceId(
        user.sId,
        workspace.sId
      );

      const refreshedProjectSpace = await SpaceResource.fetchById(
        userAuth,
        projectSpace.sId
      );
      expect(refreshedProjectSpace).not.toBeNull();

      const projectConversation = await createConversation(userAuth, {
        title: "Project Conversation",
        visibility: "unlisted",
        spaceId: refreshedProjectSpace!.id,
      });

      // Create an agent message
      const agentConfig = await AgentConfigurationFactory.createTestAgent(
        auth,
        {
          name: "Test Agent",
        }
      );

      const { agentMessage } = await ConversationFactory.createAgentMessage({
        workspace,
        conversation: projectConversation,
        agentConfig,
      });

      const mentions: MentionType[] = [
        {
          type: "user",
          userId: mentionedUser.sId.toString(),
        },
      ];

      const result = await createUserMentions(userAuth, {
        mentions,
        message: agentMessage,
        conversation: projectConversation,
      });

      // Verify return value shows user_restricted_by_conversation_access status (requires approval for non-members)
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: mentionedUser.sId,
        type: "user",
        status: "user_restricted_by_conversation_access",
      });
      expect(isRichUserMention(result[0])).toBe(true);
    });
  });

  describe("getMentionStatus", () => {
    it("should return 'approved' for project conversations when mentioned user is project member", async () => {
      const mentionedUser = await UserFactory.basic();
      await MembershipFactory.associate(workspace, mentionedUser, {
        role: "user",
      });

      const projectSpace = await SpaceFactory.project(workspace);
      const adminAuth = await Authenticator.internalAdminForWorkspace(
        workspace.sId
      );

      // Add both test user and mentioned user to the project space
      const user = auth.getNonNullableUser();
      await projectSpace.addMembers(adminAuth, {
        userIds: [user.sId, mentionedUser.sId],
      });

      // Create a fresh authenticator after adding user to space
      const userAuth = await Authenticator.fromUserIdAndWorkspaceId(
        user.sId,
        workspace.sId
      );

      const projectConversation = await ConversationFactory.create(userAuth, {
        agentConfigurationId: "test-agent",
        messagesCreatedAt: [],
        visibility: "unlisted",
        spaceId: projectSpace.id,
      });

      // Create a user message
      const { userMessage } = await ConversationFactory.createUserMessage({
        auth: userAuth,
        workspace,
        conversation: projectConversation,
        content: `Hello @${mentionedUser.username}`,
      });

      const mentionedUserResource = await getUserForWorkspace(userAuth, {
        userId: mentionedUser.sId,
      });
      if (!mentionedUserResource) {
        throw new Error("User not found");
      }

      // Since mentioned user is a project member, isParticipant doesn't matter
      const status = await getMentionStatus(userAuth, {
        conversation: projectConversation,
        message: userMessage,
        isParticipant: false,
        mentionedUser: mentionedUserResource,
      });

      expect(status).toBe("approved");
    });

    it("should return 'pending_project_membership' when user is mentioned by project editor", async () => {
      const mentionedUser = await UserFactory.basic();
      await MembershipFactory.associate(workspace, mentionedUser, {
        role: "user",
      });

      // Create a project with auth user as editor
      const projectSpace = await SpaceFactory.project(
        workspace,
        auth.getNonNullableUser().id
      );
      const adminAuth = await Authenticator.internalAdminForWorkspace(
        workspace.sId
      );

      // Add the test user to the project space
      const user = auth.getNonNullableUser();
      await projectSpace.addMembers(adminAuth, {
        userIds: [user.sId],
      });

      // Create a fresh authenticator after adding user to space
      const userAuth = await Authenticator.fromUserIdAndWorkspaceId(
        user.sId,
        workspace.sId
      );

      const projectConversation = await ConversationFactory.create(userAuth, {
        agentConfigurationId: "test-agent",
        messagesCreatedAt: [],
        visibility: "unlisted",
        spaceId: projectSpace.id,
      });

      const mentionedUserResource = await getUserForWorkspace(userAuth, {
        userId: mentionedUser.sId,
      });
      if (!mentionedUserResource) {
        throw new Error("User not found");
      }

      // Create a user message
      const { userMessage } = await ConversationFactory.createUserMessage({
        auth: userAuth,
        workspace,
        conversation: projectConversation,
        content: `Hello @${mentionedUser.username}`,
      });

      const status = await getMentionStatus(userAuth, {
        conversation: projectConversation,
        message: userMessage,
        isParticipant: false,
        mentionedUser: mentionedUserResource,
      });

      expect(status).toBe("pending_project_membership");
    });

    it("should return 'user_restricted_by_conversation_access' when user mentioned by non project editor", async () => {
      const mentionedUser = await UserFactory.basic();
      await MembershipFactory.associate(workspace, mentionedUser, {
        role: "user",
      });

      const projectSpace = await SpaceFactory.project(workspace);
      const adminAuth = await Authenticator.internalAdminForWorkspace(
        workspace.sId
      );

      // Add the original test user to the project space
      const user = auth.getNonNullableUser();
      await projectSpace.addMembers(adminAuth, {
        userIds: [user.sId],
      });

      // Create a different user who will have limited permissions
      const limitedUser = await UserFactory.basic();
      await MembershipFactory.associate(workspace, limitedUser, {
        role: "user",
      });

      // Add limited user to project space but without admin rights
      await projectSpace.addMembers(adminAuth, {
        userIds: [limitedUser.sId],
      });

      const limitedAuth = await Authenticator.fromUserIdAndWorkspaceId(
        limitedUser.sId,
        workspace.sId
      );

      // Create conversation with the original user auth
      const userAuth = await Authenticator.fromUserIdAndWorkspaceId(
        user.sId,
        workspace.sId
      );

      const projectConversation = await ConversationFactory.create(userAuth, {
        agentConfigurationId: "test-agent",
        messagesCreatedAt: [],
        visibility: "unlisted",
        spaceId: projectSpace.id,
      });

      const mentionedUserResource = await getUserForWorkspace(limitedAuth, {
        userId: mentionedUser.sId,
      });
      if (!mentionedUserResource) {
        throw new Error("User not found");
      }

      // Create a user message
      const { userMessage } = await ConversationFactory.createUserMessage({
        auth: userAuth,
        workspace,
        conversation: projectConversation,
        content: `Hello @${mentionedUser.username}`,
      });

      const status = await getMentionStatus(limitedAuth, {
        conversation: projectConversation,
        message: userMessage,
        isParticipant: false,
        mentionedUser: mentionedUserResource,
      });

      expect(status).toBe("user_restricted_by_conversation_access");
    });

    it("should return 'approved' for regular conversations when user is participant", async () => {
      const mentionedUser = await UserFactory.basic();
      await MembershipFactory.associate(workspace, mentionedUser, {
        role: "user",
      });

      const regularConversation = await ConversationFactory.create(auth, {
        agentConfigurationId: "test-agent",
        messagesCreatedAt: [],
        visibility: "unlisted",
        // No spaceId for regular conversation
      });

      // Create a user message
      const { userMessage } = await ConversationFactory.createUserMessage({
        auth,
        workspace,
        conversation: regularConversation,
        content: `Hello @${mentionedUser.username}`,
      });

      const mentionedUserResource = await getUserForWorkspace(auth, {
        userId: mentionedUser.sId,
      });
      if (!mentionedUserResource) {
        throw new Error("User not found");
      }

      // Test when user is a participant - should be approved
      const status = await getMentionStatus(auth, {
        conversation: regularConversation,
        message: userMessage,
        isParticipant: true,
        mentionedUser: mentionedUserResource,
      });

      expect(status).toBe("approved");
    });

    it("should return 'pending_conversation_access' for regular conversations when user can access but is not participant", async () => {
      const mentionedUser = await UserFactory.basic();
      await MembershipFactory.associate(workspace, mentionedUser, {
        role: "user",
      });

      const regularConversation = await ConversationFactory.create(auth, {
        agentConfigurationId: "test-agent",
        messagesCreatedAt: [],
        visibility: "unlisted",
      });

      // Create a user message
      const { userMessage } = await ConversationFactory.createUserMessage({
        auth,
        workspace,
        conversation: regularConversation,
        content: `Hello @${mentionedUser.username}`,
      });

      const mentionedUserResource = await getUserForWorkspace(auth, {
        userId: mentionedUser.sId,
      });
      if (!mentionedUserResource) {
        throw new Error("User not found");
      }

      // User can access but is not participant and it's not a triggered conversation
      const status = await getMentionStatus(auth, {
        conversation: regularConversation,
        message: userMessage,
        isParticipant: false,
        mentionedUser: mentionedUserResource,
      });

      expect(status).toBe("pending_conversation_access");
    });

    it("should return 'user_restricted_by_conversation_access' for regular conversations when user cannot access", async () => {
      // Create a user who is a member of the workspace but has no access to the conversation
      const restrictedUser = await UserFactory.basic();
      await MembershipFactory.associate(workspace, restrictedUser, {
        role: "user",
      });

      // Create a conversation in a restricted space
      const restrictedSpace = await SpaceFactory.regular(workspace);
      const regularConversation = await ConversationFactory.create(auth, {
        agentConfigurationId: "test-agent",
        messagesCreatedAt: [],
        visibility: "unlisted",
        requestedSpaceIds: [restrictedSpace.id],
      });

      const restrictedUserResource = await getUserForWorkspace(auth, {
        userId: restrictedUser.sId,
      });
      if (!restrictedUserResource) {
        throw new Error("User not found");
      }

      // Create a user message
      const { userMessage } = await ConversationFactory.createUserMessage({
        auth,
        workspace,
        conversation: regularConversation,
        content: `Hello @${restrictedUser.username}`,
      });

      const status = await getMentionStatus(auth, {
        conversation: regularConversation,
        message: userMessage,
        isParticipant: false,
        mentionedUser: restrictedUserResource,
      });

      expect(status).toBe("user_restricted_by_conversation_access");
    });

    it("should return 'approved' for triggered conversations when user is mentioned in instructions", async () => {
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
      const trigger = await TriggerFactory.webhook(auth, {
        name: "Test Trigger",
        agentConfigurationId: triggerAgentConfig.sId,
        status: "enabled",
        configuration: { includePayload: true },
      });

      // Create a conversation
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

      // Update agent config to include user mention in instructions
      const instructionsWithMention = `Please help :mention_user[${mentionedUser.username}]{sId=${mentionedUser.sId}} with their request.`;
      await AgentConfigurationModel.update(
        {
          instructions: instructionsWithMention,
        },
        {
          where: {
            workspaceId: workspace.id,
            sId: triggerAgentConfig.sId,
          },
        }
      );

      // Fetch updated agent config
      const updatedAgentConfig = await getAgentConfiguration(auth, {
        agentId: triggerAgentConfig.sId,
        agentVersion: triggerAgentConfig.version,
        variant: "light",
      });
      expect(updatedAgentConfig).not.toBeNull();
      expect(updatedAgentConfig?.instructions).toContain(mentionedUser.sId);

      // Create an agent message
      const { agentMessage } = await ConversationFactory.createAgentMessage({
        workspace,
        conversation: updatedConversation,
        agentConfig: updatedAgentConfig!,
      });

      const mentionedUserResource = await getUserForWorkspace(auth, {
        userId: mentionedUser.sId,
      });
      if (!mentionedUserResource) {
        throw new Error("User not found");
      }

      const status = await getMentionStatus(auth, {
        conversation: updatedConversation,
        message: agentMessage,
        isParticipant: false,
        mentionedUser: mentionedUserResource,
      });

      expect(status).toBe("approved");
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

describe("validateUserMention", () => {
  let workspace: WorkspaceType;
  let auth: Authenticator;
  let conversation: ConversationType;

  beforeEach(async () => {
    const setup = await createResourceTest({});
    workspace = setup.workspace;
    auth = setup.authenticator;

    const agentConfig = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Test Agent",
      description: "Test agent",
    });

    conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: agentConfig.sId,
      messagesCreatedAt: [],
      visibility: "unlisted",
    });
  });

  it("should add a participant with lastReadAt=null when approving a user mention", async () => {
    // Create a second user who will be mentioned
    const mentionedUser = await UserFactory.basic();
    await MembershipFactory.associate(workspace, mentionedUser, {
      role: "user",
    });

    // Create a user message that mentions the second user
    const userJson = auth.getNonNullableUser().toJSON();
    const userMessage = await withTransaction(async (transaction) => {
      return createUserMessage(auth, {
        conversation,
        content: `Hello @${mentionedUser.sId}`,
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

    // Create the mention with status "pending_conversation_access"
    await MentionModel.create({
      messageId: userMessage.id,
      userId: mentionedUser.id,
      workspaceId: workspace.id,
      status: "pending_conversation_access",
    });

    // Verify the mentioned user is not a participant yet
    const isParticipantBefore =
      await ConversationResource.isConversationParticipant(auth, {
        conversation,
        user: mentionedUser.toJSON(),
      });
    expect(isParticipantBefore).toBe(false);

    // Approve the mention
    const result = await validateUserMention(auth, {
      conversationId: conversation.sId,
      userId: mentionedUser.sId,
      messageId: userMessage.sId,
      approvalState: "approved",
    });

    expect(result.isOk()).toBe(true);

    // Verify the mentioned user is now a participant with lastReadAt=null
    const participant = await ConversationParticipantModel.findOne({
      where: {
        workspaceId: workspace.id,
        conversationId: conversation.id,
        userId: mentionedUser.id,
      },
    });
    const conversationRead = await UserConversationReadsModel.findOne({
      where: {
        workspaceId: workspace.id,
        conversationId: conversation.id,
        userId: mentionedUser.id,
      },
    });

    expect(participant).not.toBeNull();
    expect(conversationRead?.lastReadAt).toBeUndefined();
    expect(participant?.action).toBe("subscribed");
  });

  it("should not add a participant when rejecting a user mention", async () => {
    // Create a second user who will be mentioned
    const mentionedUser = await UserFactory.basic();
    await MembershipFactory.associate(workspace, mentionedUser, {
      role: "user",
    });

    // Create a user message that mentions the second user
    const userJson = auth.getNonNullableUser().toJSON();
    const userMessage = await withTransaction(async (transaction) => {
      return createUserMessage(auth, {
        conversation,
        content: `Hello @${mentionedUser.sId}`,
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

    // Create the mention with status "pending_conversation_access"
    await MentionModel.create({
      messageId: userMessage.id,
      userId: mentionedUser.id,
      workspaceId: workspace.id,
      status: "pending_conversation_access",
    });

    // Reject the mention
    const result = await validateUserMention(auth, {
      conversationId: conversation.sId,
      userId: mentionedUser.sId,
      messageId: userMessage.sId,
      approvalState: "rejected",
    });

    expect(result.isOk()).toBe(true);

    // Verify the mentioned user is NOT a participant
    const participant = await ConversationParticipantModel.findOne({
      where: {
        workspaceId: workspace.id,
        conversationId: conversation.id,
        userId: mentionedUser.id,
      },
    });

    expect(participant).toBeNull();
  });

  describe("project conversation approval", () => {
    it("should add user to project space AND as participant when approving in project conversation", async () => {
      // Create an admin user for this test (needs canAdministrate for addMembers)
      const adminUser = await UserFactory.basic();
      await MembershipFactory.associate(workspace, adminUser, {
        role: "admin",
      });

      // Create a project space
      const projectSpace = await SpaceFactory.project(workspace);
      const internalAdminAuth = await Authenticator.internalAdminForWorkspace(
        workspace.sId
      );

      // Add the admin user to the project space (they need to be a member/editor)
      await projectSpace.addMembers(internalAdminAuth, {
        userIds: [adminUser.sId],
      });

      // Create a fresh authenticator after adding user to space
      const userAuth = await Authenticator.fromUserIdAndWorkspaceId(
        adminUser.sId,
        workspace.sId
      );

      // Create a conversation in the project space
      const projectConversation = await createConversation(userAuth, {
        title: "Project Conversation",
        visibility: "unlisted",
        spaceId: projectSpace!.id,
      });

      // Create a user who will be mentioned but is NOT a member of the project space
      const mentionedUser = await UserFactory.basic();
      await MembershipFactory.associate(workspace, mentionedUser, {
        role: "user",
      });

      // Create a user message that mentions the user
      const userJson = adminUser.toJSON();
      const userMessage = await withTransaction(async (transaction) => {
        return createUserMessage(userAuth, {
          conversation: projectConversation,
          content: `Hello @${mentionedUser.sId}`,
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

      // Create the mention with status "pending_project_membership"
      await MentionModel.create({
        messageId: userMessage.id,
        userId: mentionedUser.id,
        workspaceId: workspace.id,
        status: "pending_project_membership",
      });

      const mentionedUserAuth = await Authenticator.fromUserIdAndWorkspaceId(
        mentionedUser.sId,
        workspace.sId
      );

      // Verify the mentioned user is NOT a member of the project space before
      const isMemberBefore = projectSpace!.isMember(mentionedUserAuth);
      expect(isMemberBefore).toBe(false);

      // Approve the mention (userAuth has admin role and is a project member)
      // Since this is a project conversation, approval automatically adds user to project space
      const result = await validateUserMention(userAuth, {
        conversationId: projectConversation.sId,
        userId: mentionedUser.sId,
        messageId: userMessage.sId,
        approvalState: "approved",
      });

      expect(result.isOk()).toBe(true);

      // Verify the mentioned user is now a member of the project space
      // Need to refresh the authenticator to get the updated groups.
      await mentionedUserAuth.refresh();
      const isMemberAfter = projectSpace!.isMember(mentionedUserAuth);
      expect(isMemberAfter).toBe(true);

      // Verify the mentioned user is now a participant
      const participant = await ConversationParticipantModel.findOne({
        where: {
          workspaceId: workspace.id,
          conversationId: projectConversation.id,
          userId: mentionedUser.id,
        },
      });
      expect(participant).not.toBeNull();
      expect(participant?.action).toBe("subscribed");

      // Verify the mention status is updated to "approved"
      const mention = await MentionModel.findOne({
        where: {
          messageId: userMessage.id,
          userId: mentionedUser.id,
          workspaceId: workspace.id,
        },
      });
      expect(mention?.status).toBe("approved");
    });
  });
});

describe("updateConversationRequirements", () => {
  let workspace: WorkspaceType;
  let auth: Authenticator;
  let projectSpace: Awaited<ReturnType<typeof SpaceFactory.project>>;
  let anotherProjectSpace: Awaited<ReturnType<typeof SpaceFactory.project>>;

  beforeEach(async () => {
    const setup = await createResourceTest({});
    workspace = setup.workspace;
    auth = setup.authenticator;

    // Create project spaces
    projectSpace = await SpaceFactory.project(workspace);
    anotherProjectSpace = await SpaceFactory.project(workspace);

    // Add user to project spaces
    const internalAdminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    const user = auth.getNonNullableUser();
    const userJson = user.toJSON();

    const projectSpaceGroup = projectSpace.groups.find(
      (g) => g.kind === "regular"
    );
    const anotherProjectSpaceGroup = anotherProjectSpace.groups.find(
      (g) => g.kind === "regular"
    );

    if (projectSpaceGroup) {
      const addRes = await projectSpaceGroup.dangerouslyAddMember(
        internalAdminAuth,
        {
          user: userJson,
        }
      );
      if (addRes.isErr()) {
        throw new Error(
          `Failed to add user to project space group: ${addRes.error.message}`
        );
      }
    }

    if (anotherProjectSpaceGroup) {
      const addRes = await anotherProjectSpaceGroup.dangerouslyAddMember(
        internalAdminAuth,
        {
          user: userJson,
        }
      );
      if (addRes.isErr()) {
        throw new Error(
          `Failed to add user to another project space group: ${addRes.error.message}`
        );
      }
    }

    await auth.refresh();
  });

  describe("project conversations", () => {
    it("should set requestedSpaceIds to only the project space", async () => {
      // Create a project conversation
      const conversation = await ConversationFactory.create(auth, {
        agentConfigurationId: "test-agent",
        messagesCreatedAt: [],
        spaceId: projectSpace.id,
      });

      // Create agents with different space requirements
      const agent1 = await AgentConfigurationFactory.createTestAgent(auth, {
        name: "Agent 1",
      });
      const agent2 = await AgentConfigurationFactory.createTestAgent(auth, {
        name: "Agent 2",
      });

      // Update agents to have space requirements
      const { AgentConfigurationModel } = await import(
        "@app/lib/models/agent/agent"
      );
      await AgentConfigurationModel.update(
        { requestedSpaceIds: [anotherProjectSpace.id] },
        {
          where: {
            sId: agent1.sId,
            workspaceId: workspace.id,
          },
          hooks: false,
          silent: true,
        }
      );

      // Fetch conversation to get the full type
      const fetchedConversationResult = await getConversation(
        auth,
        conversation.sId
      );
      if (fetchedConversationResult.isErr()) {
        throw new Error("Failed to fetch conversation");
      }
      const projectConversation = fetchedConversationResult.value;

      // Call updateConversationRequirements with agents that have different space requirements
      await updateConversationRequirements(auth, {
        agents: [agent1, agent2],
        conversation: projectConversation,
      });

      // Verify the conversation requirements are set to only the project space
      const updatedConversationResult = await getConversation(
        auth,
        conversation.sId
      );
      if (updatedConversationResult.isErr()) {
        throw new Error("Failed to fetch updated conversation");
      }
      const updatedConversation = updatedConversationResult.value;

      expect(updatedConversation.requestedSpaceIds).toHaveLength(1);
      expect(updatedConversation.requestedSpaceIds[0]).toBe(projectSpace.sId);
    });

    it("should not update if requirements are already correct", async () => {
      // Create a project conversation
      const conversation = await ConversationFactory.create(auth, {
        agentConfigurationId: "test-agent",
        messagesCreatedAt: [],
        spaceId: projectSpace.id,
      });

      // Manually set the requirements to the project space
      await ConversationResource.updateRequirements(auth, conversation.sId, [
        projectSpace.id,
      ]);

      // Fetch conversation
      const fetchedConversationResult = await getConversation(
        auth,
        conversation.sId
      );
      if (fetchedConversationResult.isErr()) {
        throw new Error("Failed to fetch conversation");
      }
      const projectConversation = fetchedConversationResult.value;

      // Verify initial state
      expect(projectConversation.requestedSpaceIds).toHaveLength(1);
      expect(projectConversation.requestedSpaceIds[0]).toBe(projectSpace.sId);

      // Call updateConversationRequirements - should not update
      await updateConversationRequirements(auth, {
        agents: [],
        conversation: projectConversation,
      });

      // Verify requirements are unchanged
      const updatedConversationResult = await getConversation(
        auth,
        conversation.sId
      );
      if (updatedConversationResult.isErr()) {
        throw new Error("Failed to fetch updated conversation");
      }
      const updatedConversation = updatedConversationResult.value;

      expect(updatedConversation.requestedSpaceIds).toHaveLength(1);
      expect(updatedConversation.requestedSpaceIds[0]).toBe(projectSpace.sId);
    });
  });

  describe("regular conversations", () => {
    it("should add space requirements from agents", async () => {
      // Create a regular conversation (no spaceId)
      const conversation = await ConversationFactory.create(auth, {
        agentConfigurationId: "test-agent",
        messagesCreatedAt: [],
        visibility: "unlisted",
      });

      // Create agents with space requirements
      const agent1 = await AgentConfigurationFactory.createTestAgent(auth, {
        name: "Agent 1",
      });
      const agent2 = await AgentConfigurationFactory.createTestAgent(auth, {
        name: "Agent 2",
      });

      // Update agents to have space requirements
      const { AgentConfigurationModel } = await import(
        "@app/lib/models/agent/agent"
      );
      await AgentConfigurationModel.update(
        { requestedSpaceIds: [projectSpace.id] },
        {
          where: {
            sId: agent1.sId,
            workspaceId: workspace.id,
          },
          hooks: false,
          silent: true,
        }
      );
      await AgentConfigurationModel.update(
        { requestedSpaceIds: [anotherProjectSpace.id] },
        {
          where: {
            sId: agent2.sId,
            workspaceId: workspace.id,
          },
          hooks: false,
          silent: true,
        }
      );

      // Fetch agents with updated requirements
      const { getAgentConfigurations } = await import(
        "@app/lib/api/assistant/configuration/agent"
      );
      const agents = await getAgentConfigurations(auth, {
        agentIds: [agent1.sId, agent2.sId],
        variant: "light",
      });

      // Fetch conversation
      const fetchedConversationResult = await getConversation(
        auth,
        conversation.sId
      );
      if (fetchedConversationResult.isErr()) {
        throw new Error("Failed to fetch conversation");
      }
      const regularConversation = fetchedConversationResult.value;

      // Call updateConversationRequirements
      await updateConversationRequirements(auth, {
        agents,
        conversation: regularConversation,
      });

      // Verify the conversation requirements include both spaces
      const updatedConversationResult = await getConversation(
        auth,
        conversation.sId
      );
      if (updatedConversationResult.isErr()) {
        throw new Error("Failed to fetch updated conversation");
      }
      const updatedConversation = updatedConversationResult.value;

      expect(updatedConversation.requestedSpaceIds.length).toBeGreaterThan(0);
      expect(updatedConversation.requestedSpaceIds).toContain(projectSpace.sId);
      expect(updatedConversation.requestedSpaceIds).toContain(
        anotherProjectSpace.sId
      );
    });

    it("should add space requirements from content fragments", async () => {
      const { DataSourceViewFactory } = await import(
        "@app/tests/utils/DataSourceViewFactory"
      );

      // Create a regular conversation
      const conversation = await ConversationFactory.create(auth, {
        agentConfigurationId: "test-agent",
        messagesCreatedAt: [],
        visibility: "unlisted",
      });

      // Create a data source view in a project space
      const dsView = await DataSourceViewFactory.folder(
        workspace,
        projectSpace,
        auth.user() ?? null
      );

      // Create content fragment input
      const contentFragment: ContentFragmentInputWithContentNode = {
        title: "Test Fragment",
        nodeId: "test-node-id",
        nodeDataSourceViewId: dsView.sId,
      };

      // Fetch conversation
      const fetchedConversationResult = await getConversation(
        auth,
        conversation.sId
      );
      if (fetchedConversationResult.isErr()) {
        throw new Error("Failed to fetch conversation");
      }
      const regularConversation = fetchedConversationResult.value;

      // Call updateConversationRequirements with content fragment
      await updateConversationRequirements(auth, {
        contentFragment,
        conversation: regularConversation,
      });

      // Verify the conversation requirements include the space from the content fragment
      const updatedConversationResult = await getConversation(
        auth,
        conversation.sId
      );
      if (updatedConversationResult.isErr()) {
        throw new Error("Failed to fetch updated conversation");
      }
      const updatedConversation = updatedConversationResult.value;

      expect(updatedConversation.requestedSpaceIds).toContain(projectSpace.sId);
    });

    it("should add space requirements from both agents and content fragments", async () => {
      const { DataSourceViewFactory } = await import(
        "@app/tests/utils/DataSourceViewFactory"
      );

      // Create a regular conversation
      const conversation = await ConversationFactory.create(auth, {
        agentConfigurationId: "test-agent",
        messagesCreatedAt: [],
        visibility: "unlisted",
      });

      // Create an agent with space requirements
      const agent = await AgentConfigurationFactory.createTestAgent(auth, {
        name: "Agent 1",
      });

      const { AgentConfigurationModel } = await import(
        "@app/lib/models/agent/agent"
      );
      await AgentConfigurationModel.update(
        { requestedSpaceIds: [projectSpace.id] },
        {
          where: {
            sId: agent.sId,
            workspaceId: workspace.id,
          },
          hooks: false,
          silent: true,
        }
      );

      // Create a data source view in another project space
      const dsView = await DataSourceViewFactory.folder(
        workspace,
        anotherProjectSpace,
        auth.user() ?? null
      );

      const contentFragment: ContentFragmentInputWithContentNode = {
        title: "Test Fragment",
        nodeId: "test-node-id",
        nodeDataSourceViewId: dsView.sId,
      };

      // Fetch agents and conversation
      const { getAgentConfigurations } = await import(
        "@app/lib/api/assistant/configuration/agent"
      );
      const agents = await getAgentConfigurations(auth, {
        agentIds: [agent.sId],
        variant: "light",
      });

      const fetchedConversationResult = await getConversation(
        auth,
        conversation.sId
      );
      if (fetchedConversationResult.isErr()) {
        throw new Error("Failed to fetch conversation");
      }
      const regularConversation = fetchedConversationResult.value;

      // Call updateConversationRequirements with both
      await updateConversationRequirements(auth, {
        agents,
        contentFragment,
        conversation: regularConversation,
      });

      // Verify the conversation requirements include both spaces
      const updatedConversationResult = await getConversation(
        auth,
        conversation.sId
      );
      if (updatedConversationResult.isErr()) {
        throw new Error("Failed to fetch updated conversation");
      }
      const updatedConversation = updatedConversationResult.value;

      expect(updatedConversation.requestedSpaceIds).toContain(projectSpace.sId);
      expect(updatedConversation.requestedSpaceIds).toContain(
        anotherProjectSpace.sId
      );
    });

    it("should not duplicate existing space requirements", async () => {
      // Create a regular conversation
      const conversation = await ConversationFactory.create(auth, {
        agentConfigurationId: "test-agent",
        messagesCreatedAt: [],
        visibility: "unlisted",
      });

      // Manually set initial requirements
      await ConversationResource.updateRequirements(auth, conversation.sId, [
        projectSpace.id,
      ]);

      // Create an agent with the same space requirement
      const agent = await AgentConfigurationFactory.createTestAgent(auth, {
        name: "Agent 1",
      });

      const { AgentConfigurationModel } = await import(
        "@app/lib/models/agent/agent"
      );
      await AgentConfigurationModel.update(
        { requestedSpaceIds: [projectSpace.id] },
        {
          where: {
            sId: agent.sId,
            workspaceId: workspace.id,
          },
          hooks: false,
          silent: true,
        }
      );

      // Fetch agent and conversation
      const { getAgentConfigurations } = await import(
        "@app/lib/api/assistant/configuration/agent"
      );
      const agents = await getAgentConfigurations(auth, {
        agentIds: [agent.sId],
        variant: "light",
      });

      const fetchedConversationResult = await getConversation(
        auth,
        conversation.sId
      );
      if (fetchedConversationResult.isErr()) {
        throw new Error("Failed to fetch conversation");
      }
      const regularConversation = fetchedConversationResult.value;

      // Call updateConversationRequirements
      await updateConversationRequirements(auth, {
        agents,
        conversation: regularConversation,
      });

      // Verify requirements are not duplicated
      const updatedConversationResult = await getConversation(
        auth,
        conversation.sId
      );
      if (updatedConversationResult.isErr()) {
        throw new Error("Failed to fetch updated conversation");
      }
      const updatedConversation = updatedConversationResult.value;

      const projectSpaceIdCount = updatedConversation.requestedSpaceIds.filter(
        (id) => id === projectSpace.sId
      ).length;
      expect(projectSpaceIdCount).toBe(1);
    });

    it("should handle agents with no space requirements", async () => {
      // Create a regular conversation
      const conversation = await ConversationFactory.create(auth, {
        agentConfigurationId: "test-agent",
        messagesCreatedAt: [],
        visibility: "unlisted",
      });

      // Create an agent with no space requirements (empty array)
      const agent = await AgentConfigurationFactory.createTestAgent(auth, {
        name: "Agent 1",
      });

      // Fetch agent and conversation
      const { getAgentConfigurations } = await import(
        "@app/lib/api/assistant/configuration/agent"
      );
      const agents = await getAgentConfigurations(auth, {
        agentIds: [agent.sId],
        variant: "light",
      });

      const fetchedConversationResult = await getConversation(
        auth,
        conversation.sId
      );
      if (fetchedConversationResult.isErr()) {
        throw new Error("Failed to fetch conversation");
      }
      const regularConversation = fetchedConversationResult.value;

      // Call updateConversationRequirements
      await updateConversationRequirements(auth, {
        agents,
        conversation: regularConversation,
      });

      // Verify requirements are unchanged (no new requirements added)
      const updatedConversationResult = await getConversation(
        auth,
        conversation.sId
      );
      if (updatedConversationResult.isErr()) {
        throw new Error("Failed to fetch updated conversation");
      }
      const updatedConversation = updatedConversationResult.value;

      // Should have no new requirements added
      expect(updatedConversation.requestedSpaceIds.length).toBe(
        regularConversation.requestedSpaceIds.length
      );
    });

    it("should handle empty agents and content fragments", async () => {
      // Create a regular conversation
      const conversation = await ConversationFactory.create(auth, {
        agentConfigurationId: "test-agent",
        messagesCreatedAt: [],
        visibility: "unlisted",
      });

      // Fetch conversation
      const fetchedConversationResult = await getConversation(
        auth,
        conversation.sId
      );
      if (fetchedConversationResult.isErr()) {
        throw new Error("Failed to fetch conversation");
      }
      const regularConversation = fetchedConversationResult.value;

      const initialRequirements = regularConversation.requestedSpaceIds.length;

      // Call updateConversationRequirements with empty inputs
      await updateConversationRequirements(auth, {
        agents: [],
        conversation: regularConversation,
      });

      // Verify requirements are unchanged
      const updatedConversationResult = await getConversation(
        auth,
        conversation.sId
      );
      if (updatedConversationResult.isErr()) {
        throw new Error("Failed to fetch updated conversation");
      }
      const updatedConversation = updatedConversationResult.value;

      expect(updatedConversation.requestedSpaceIds.length).toBe(
        initialRequirements
      );
    });

    it("should preserve existing requirements when adding new ones", async () => {
      // Create a regular conversation
      const conversation = await ConversationFactory.create(auth, {
        agentConfigurationId: "test-agent",
        messagesCreatedAt: [],
        visibility: "unlisted",
      });

      // Manually set initial requirements
      await ConversationResource.updateRequirements(auth, conversation.sId, [
        projectSpace.id,
      ]);

      // Create an agent with a different space requirement
      const agent = await AgentConfigurationFactory.createTestAgent(auth, {
        name: "Agent 1",
      });

      const { AgentConfigurationModel } = await import(
        "@app/lib/models/agent/agent"
      );
      await AgentConfigurationModel.update(
        { requestedSpaceIds: [anotherProjectSpace.id] },
        {
          where: {
            sId: agent.sId,
            workspaceId: workspace.id,
          },
          hooks: false,
          silent: true,
        }
      );

      // Fetch agent and conversation
      const { getAgentConfigurations } = await import(
        "@app/lib/api/assistant/configuration/agent"
      );
      const agents = await getAgentConfigurations(auth, {
        agentIds: [agent.sId],
        variant: "light",
      });

      const fetchedConversationResult = await getConversation(
        auth,
        conversation.sId
      );
      if (fetchedConversationResult.isErr()) {
        throw new Error("Failed to fetch conversation");
      }
      const regularConversation = fetchedConversationResult.value;

      // Call updateConversationRequirements
      await updateConversationRequirements(auth, {
        agents,
        conversation: regularConversation,
      });

      // Verify both old and new requirements are present
      const updatedConversationResult = await getConversation(
        auth,
        conversation.sId
      );
      if (updatedConversationResult.isErr()) {
        throw new Error("Failed to fetch updated conversation");
      }
      const updatedConversation = updatedConversationResult.value;

      expect(updatedConversation.requestedSpaceIds).toContain(projectSpace.sId);
      expect(updatedConversation.requestedSpaceIds).toContain(
        anotherProjectSpace.sId
      );
    });
  });
});
