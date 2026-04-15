import { createConversation } from "@app/lib/api/assistant/conversation";
import { createConversationFork } from "@app/lib/api/assistant/conversation/forks";
import { Authenticator } from "@app/lib/auth";
import {
  AgentMessageModel,
  ConversationModel,
  MessageModel,
  UserMessageModel,
} from "@app/lib/models/agent/conversation";
import { ConversationForkModel } from "@app/lib/models/agent/conversation_fork";
import { ConversationBranchResource } from "@app/lib/resources/conversation_branch_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { generateRandomModelSId } from "@app/lib/resources/string_ids_server";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { MCPServerViewFactory } from "@app/tests/utils/MCPServerViewFactory";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { RemoteMCPServerFactory } from "@app/tests/utils/RemoteMCPServerFactory";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import type { ModelId } from "@app/types/shared/model_id";
import { describe, expect, it } from "vitest";

async function createUserMessage(
  auth: Authenticator,
  {
    conversation,
    rank,
    content,
    branchId = null,
  }: {
    conversation: ConversationWithoutContentType;
    rank: number;
    content: string;
    branchId?: ModelId | null;
  }
): Promise<MessageModel> {
  const workspace = auth.getNonNullableWorkspace();
  const user = auth.getNonNullableUser();

  const userMessage = await UserMessageModel.create({
    userId: user.id,
    workspaceId: workspace.id,
    content,
    userContextUsername: user.username,
    userContextTimezone: "UTC",
    userContextFullName: user.fullName(),
    userContextEmail: user.email,
    userContextProfilePictureUrl: user.imageUrl,
    userContextOrigin: "web",
    clientSideMCPServerIds: [],
  });

  return MessageModel.create({
    workspaceId: workspace.id,
    sId: generateRandomModelSId(),
    rank,
    conversationId: conversation.id,
    branchId,
    parentId: null,
    userMessageId: userMessage.id,
  });
}

async function createAgentMessage(
  auth: Authenticator,
  {
    conversation,
    rank,
    parentId,
    status,
    branchId = null,
  }: {
    conversation: ConversationWithoutContentType;
    rank: number;
    parentId: ModelId;
    status: "created" | "succeeded";
    branchId?: ModelId | null;
  }
): Promise<MessageModel> {
  const workspace = auth.getNonNullableWorkspace();

  const agentMessage = await AgentMessageModel.create({
    workspaceId: workspace.id,
    status,
    agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
    agentConfigurationVersion: 0,
    skipToolsValidation: false,
    completedAt: status === "created" ? null : new Date(),
  });

  return MessageModel.create({
    workspaceId: workspace.id,
    sId: generateRandomModelSId(),
    rank,
    conversationId: conversation.id,
    branchId,
    parentId,
    agentMessageId: agentMessage.id,
  });
}

describe("createConversationFork", () => {
  it("creates the child conversation, sole participant, and lineage row", async () => {
    const { auth, globalSpace, user } = await createPrivateApiMockRequest();

    const parentConversation = await createConversation(auth, {
      title: "Parent conversation",
      visibility: "unlisted",
      spaceId: globalSpace.id,
    });

    const userMessage = await createUserMessage(auth, {
      conversation: parentConversation,
      rank: 0,
      content: "How should I continue this?",
    });
    const sourceMessage = await createAgentMessage(auth, {
      conversation: parentConversation,
      rank: 1,
      parentId: userMessage.id,
      status: "succeeded",
    });

    const result = await createConversationFork(auth, {
      conversationId: parentConversation.sId,
      sourceMessageId: sourceMessage.sId,
    });

    expect(result.isErr()).toBe(false);
    if (result.isErr()) {
      throw result.error;
    }

    const childConversation = result.value;

    expect(childConversation.title).toBe("Parent conversation (forked)");
    expect(childConversation.spaceId).toBe(globalSpace.sId);
    expect(childConversation.depth).toBe(parentConversation.depth + 1);
    expect(childConversation.forkedFrom).toEqual({
      parentConversationId: parentConversation.sId,
      sourceMessageId: sourceMessage.sId,
      branchedAt: expect.any(Number),
      user: user.toJSON(),
    });

    const forkRow = await ConversationForkModel.findOne({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        childConversationId: childConversation.id,
      },
    });

    expect(forkRow).not.toBeNull();
    expect(forkRow?.parentConversationId).toBe(parentConversation.id);
    expect(forkRow?.sourceMessageId).toBe(sourceMessage.id);
    expect(forkRow?.createdByUserId).toBe(user.id);

    const participants = await ConversationResource.listParticipantDetails(
      auth,
      childConversation
    );
    expect(participants).toEqual([
      {
        userId: user.id,
        action: "subscribed",
      },
    ]);
  });

  it("resolves the latest completed main-thread agent message when no source is provided", async () => {
    const { auth } = await createPrivateApiMockRequest();

    const parentConversation = await createConversation(auth, {
      title: "Parent conversation",
      visibility: "unlisted",
      spaceId: null,
    });

    const firstUserMessage = await createUserMessage(auth, {
      conversation: parentConversation,
      rank: 0,
      content: "First turn",
    });
    const firstAgentMessage = await createAgentMessage(auth, {
      conversation: parentConversation,
      rank: 1,
      parentId: firstUserMessage.id,
      status: "succeeded",
    });

    const secondUserMessage = await createUserMessage(auth, {
      conversation: parentConversation,
      rank: 2,
      content: "Second turn",
    });
    await createAgentMessage(auth, {
      conversation: parentConversation,
      rank: 3,
      parentId: secondUserMessage.id,
      status: "created",
    });

    const branch = await ConversationBranchResource.makeNew(auth, {
      state: "open",
      previousMessageId: firstAgentMessage.id,
      conversationId: parentConversation.id,
      userId: auth.getNonNullableUser().id,
    });

    const branchUserMessage = await createUserMessage(auth, {
      conversation: parentConversation,
      rank: 10,
      content: "Branch turn",
      branchId: branch.id,
    });
    await createAgentMessage(auth, {
      conversation: parentConversation,
      rank: 11,
      parentId: branchUserMessage.id,
      status: "succeeded",
      branchId: branch.id,
    });

    const result = await createConversationFork(auth, {
      conversationId: parentConversation.sId,
    });

    expect(result.isErr()).toBe(false);
    if (result.isErr()) {
      throw result.error;
    }

    expect(result.value.forkedFrom?.sourceMessageId).toBe(
      firstAgentMessage.sId
    );
  });

  it("returns invalid_request_error when the source message is not forkable", async () => {
    const { auth } = await createPrivateApiMockRequest();

    const parentConversation = await createConversation(auth, {
      title: "Parent conversation",
      visibility: "unlisted",
      spaceId: null,
    });

    const userMessage = await createUserMessage(auth, {
      conversation: parentConversation,
      rank: 0,
      content: "Still waiting for the model",
    });
    const pendingAgentMessage = await createAgentMessage(auth, {
      conversation: parentConversation,
      rank: 1,
      parentId: userMessage.id,
      status: "created",
    });

    const result = await createConversationFork(auth, {
      conversationId: parentConversation.sId,
      sourceMessageId: pendingAgentMessage.sId,
    });

    expect(result.isErr()).toBe(true);
    expect(result.isErr() ? result.error.code : "").toBe(
      "invalid_request_error"
    );
  });

  it("copies enabled conversation MCP server views into the child conversation", async () => {
    const { auth, globalSpace, workspace } =
      await createPrivateApiMockRequest();

    const parentConversation = await createConversation(auth, {
      title: "Parent conversation",
      visibility: "unlisted",
      spaceId: globalSpace.id,
    });

    const enabledRemoteServer = await RemoteMCPServerFactory.create(workspace);
    const enabledMCPServerView = await MCPServerViewFactory.create(
      workspace,
      enabledRemoteServer.sId,
      globalSpace
    );
    const disabledRemoteServer = await RemoteMCPServerFactory.create(workspace);
    const disabledMCPServerView = await MCPServerViewFactory.create(
      workspace,
      disabledRemoteServer.sId,
      globalSpace
    );

    const enabledUpsertResult = await ConversationResource.upsertMCPServerViews(
      auth,
      {
        conversation: parentConversation,
        mcpServerViews: [enabledMCPServerView],
        enabled: true,
        source: "conversation",
        agentConfigurationId: null,
      }
    );
    expect(enabledUpsertResult.isOk()).toBe(true);

    const disabledUpsertResult =
      await ConversationResource.upsertMCPServerViews(auth, {
        conversation: parentConversation,
        mcpServerViews: [disabledMCPServerView],
        enabled: false,
        source: "conversation",
        agentConfigurationId: null,
      });
    expect(disabledUpsertResult.isOk()).toBe(true);

    const userMessage = await createUserMessage(auth, {
      conversation: parentConversation,
      rank: 0,
      content: "Continue with the same tools.",
    });
    const sourceMessage = await createAgentMessage(auth, {
      conversation: parentConversation,
      rank: 1,
      parentId: userMessage.id,
      status: "succeeded",
    });

    const result = await createConversationFork(auth, {
      conversationId: parentConversation.sId,
      sourceMessageId: sourceMessage.sId,
    });

    expect(result.isErr()).toBe(false);
    if (result.isErr()) {
      throw result.error;
    }

    const childMCPServerViews = await ConversationResource.fetchMCPServerViews(
      auth,
      result.value
    );

    expect(childMCPServerViews).toHaveLength(1);
    expect(childMCPServerViews[0].mcpServerViewId).toBe(
      enabledMCPServerView.id
    );
    expect(childMCPServerViews[0].enabled).toBe(true);
    expect(childMCPServerViews[0].source).toBe("conversation");
  });

  it("copies enabled conversation skills into the child conversation", async () => {
    const { auth, globalSpace } = await createPrivateApiMockRequest();

    const parentConversation = await createConversation(auth, {
      title: "Parent conversation",
      visibility: "unlisted",
      spaceId: globalSpace.id,
    });

    const enabledSkill = await SkillFactory.create(auth, {
      name: "Enabled skill",
    });
    await SkillFactory.create(auth, {
      name: "Disabled skill",
    });

    const upsertResult = await SkillResource.upsertConversationSkills(auth, {
      conversationId: parentConversation.id,
      skills: [enabledSkill],
      enabled: true,
    });
    expect(upsertResult.isOk()).toBe(true);

    const userMessage = await createUserMessage(auth, {
      conversation: parentConversation,
      rank: 0,
      content: "Continue with the same skills.",
    });
    const sourceMessage = await createAgentMessage(auth, {
      conversation: parentConversation,
      rank: 1,
      parentId: userMessage.id,
      status: "succeeded",
    });

    const result = await createConversationFork(auth, {
      conversationId: parentConversation.sId,
      sourceMessageId: sourceMessage.sId,
    });

    expect(result.isErr()).toBe(false);
    if (result.isErr()) {
      throw result.error;
    }

    const childSkills = await SkillResource.listEnabledByConversation(auth, {
      conversation: result.value,
    });

    expect(childSkills).toHaveLength(1);
    expect(childSkills[0].sId).toBe(enabledSkill.sId);
  });

  it("does not copy archived conversation skills into the child conversation", async () => {
    const { auth, globalSpace } = await createPrivateApiMockRequest();

    const parentConversation = await createConversation(auth, {
      title: "Parent conversation",
      visibility: "unlisted",
      spaceId: globalSpace.id,
    });

    const enabledSkill = await SkillFactory.create(auth, {
      name: "Enabled skill",
    });
    const archivedSkill = await SkillFactory.create(auth, {
      name: "Archived skill",
      status: "archived",
    });

    const upsertResult = await SkillResource.upsertConversationSkills(auth, {
      conversationId: parentConversation.id,
      skills: [enabledSkill, archivedSkill],
      enabled: true,
    });
    expect(upsertResult.isOk()).toBe(true);

    const userMessage = await createUserMessage(auth, {
      conversation: parentConversation,
      rank: 0,
      content: "Continue with readable skills only.",
    });
    const sourceMessage = await createAgentMessage(auth, {
      conversation: parentConversation,
      rank: 1,
      parentId: userMessage.id,
      status: "succeeded",
    });

    const result = await createConversationFork(auth, {
      conversationId: parentConversation.sId,
      sourceMessageId: sourceMessage.sId,
    });

    expect(result.isErr()).toBe(false);
    if (result.isErr()) {
      throw result.error;
    }

    const childSkills = await SkillResource.listEnabledByConversation(auth, {
      conversation: result.value,
    });

    expect(childSkills).toHaveLength(1);
    expect(childSkills[0].sId).toBe(enabledSkill.sId);
  });

  it("inherits the parent's requested spaces so the fork does not broaden visibility", async () => {
    const {
      auth: initialAuth,
      globalSpace,
      user,
      workspace,
    } = await createPrivateApiMockRequest({ role: "admin" });

    const restrictedSpace = await SpaceFactory.regular(workspace);
    const addMembersRes = await restrictedSpace.addMembers(initialAuth, {
      userIds: [user.sId],
    });
    expect(addMembersRes.isOk()).toBe(true);

    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );
    const otherUser = await UserFactory.basic();
    await MembershipFactory.associate(workspace, otherUser, { role: "user" });
    const otherAuth = await Authenticator.fromUserIdAndWorkspaceId(
      otherUser.sId,
      workspace.sId
    );

    const parentConversation = await createConversation(auth, {
      title: "Parent conversation",
      visibility: "unlisted",
      spaceId: globalSpace.id,
    });
    await ConversationModel.update(
      { requestedSpaceIds: [globalSpace.id, restrictedSpace.id] },
      {
        where: {
          id: parentConversation.id,
          workspaceId: workspace.id,
        },
      }
    );

    const userMessage = await createUserMessage(auth, {
      conversation: parentConversation,
      rank: 0,
      content: "Continue from the restricted state.",
    });
    const sourceMessage = await createAgentMessage(auth, {
      conversation: parentConversation,
      rank: 1,
      parentId: userMessage.id,
      status: "succeeded",
    });

    const result = await createConversationFork(auth, {
      conversationId: parentConversation.sId,
      sourceMessageId: sourceMessage.sId,
    });

    expect(result.isErr()).toBe(false);
    if (result.isErr()) {
      throw result.error;
    }

    expect(result.value.requestedSpaceIds).toEqual([
      globalSpace.sId,
      restrictedSpace.sId,
    ]);

    const childConversationForOtherUser = await ConversationResource.fetchById(
      otherAuth,
      result.value.sId
    );
    expect(childConversationForOtherUser).toBeNull();
  });
});
