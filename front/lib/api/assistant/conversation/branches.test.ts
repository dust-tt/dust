import {
  closeConversationBranch,
  mergeConversationBranch,
} from "@app/lib/api/assistant/conversation/branches";
import { batchRenderMessages } from "@app/lib/api/assistant/messages";
import { Authenticator } from "@app/lib/auth";
import { AgentStepContentModel } from "@app/lib/models/agent/agent_step_content";
import {
  AgentMessageModel,
  ConversationModel,
  MessageModel,
  UserMessageModel,
} from "@app/lib/models/agent/conversation";
import { ConversationBranchModel } from "@app/lib/models/agent/conversation_branch";
import { ConversationBranchResource } from "@app/lib/resources/conversation_branch_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { generateRandomModelSId } from "@app/lib/resources/string_ids_server";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import { describe, expect, it } from "vitest";

describe("mergeConversationBranch", () => {
  it("keeps main conversation renderable after merging a restricted-agent branch", async () => {
    const workspace = await WorkspaceFactory.basic();
    const mergerUser = await UserFactory.basic();
    const projectMemberUser = await UserFactory.basic();
    await MembershipFactory.associate(workspace, mergerUser, { role: "user" });
    await MembershipFactory.associate(workspace, projectMemberUser, {
      role: "user",
    });

    const initialMergerAuth = await Authenticator.fromUserIdAndWorkspaceId(
      mergerUser.sId,
      workspace.sId
    );
    if (!initialMergerAuth) {
      throw new Error("Merger auth should exist.");
    }

    const restrictedSpace = await SpaceFactory.regular(workspace);
    const projectSpace = await SpaceFactory.project(workspace);
    const internalAdminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );

    const projectGroup = projectSpace.groups.find((g) => g.kind === "regular");
    if (!projectGroup) {
      throw new Error("Project group should exist.");
    }

    const addMergerToProjectRes = await projectGroup.dangerouslyAddMember(
      internalAdminAuth,
      {
        user: mergerUser.toJSON(),
      }
    );
    if (addMergerToProjectRes.isErr()) {
      throw new Error(addMergerToProjectRes.error.message);
    }

    const addProjectMemberToProjectRes =
      await projectGroup.dangerouslyAddMember(internalAdminAuth, {
        user: projectMemberUser.toJSON(),
      });
    if (addProjectMemberToProjectRes.isErr()) {
      throw new Error(addProjectMemberToProjectRes.error.message);
    }

    const restrictedGroup = restrictedSpace.groups.find(
      (g) => g.kind === "regular"
    );
    if (!restrictedGroup) {
      throw new Error("Restricted space group should exist.");
    }

    const addMergerToRestrictedRes = await restrictedGroup.dangerouslyAddMember(
      internalAdminAuth,
      {
        user: mergerUser.toJSON(),
      }
    );
    if (addMergerToRestrictedRes.isErr()) {
      throw new Error(addMergerToRestrictedRes.error.message);
    }

    const mergerAuth = await Authenticator.fromUserIdAndWorkspaceId(
      mergerUser.sId,
      workspace.sId
    );
    const projectMemberAuth = await Authenticator.fromUserIdAndWorkspaceId(
      projectMemberUser.sId,
      workspace.sId
    );
    if (!mergerAuth || !projectMemberAuth) {
      throw new Error("Authenticators should exist.");
    }

    const restrictedAgent = await AgentConfigurationFactory.createTestAgent(
      mergerAuth,
      {
        name: "Restricted Agent",
        requestedSpaceIds: [restrictedSpace.id],
      }
    );

    const conversation = await ConversationFactory.create(mergerAuth, {
      agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
      messagesCreatedAt: [new Date()],
      spaceId: projectSpace.id,
    });

    const conversationResourceForProjectMember =
      await ConversationResource.fetchById(projectMemberAuth, conversation.sId);
    expect(conversationResourceForProjectMember).not.toBeNull();
    if (!conversationResourceForProjectMember) {
      throw new Error("Conversation resource should exist.");
    }

    const fetchMainConversationMessages = async () =>
      MessageModel.findAll({
        where: {
          workspaceId: workspace.id,
          conversationId: conversation.id,
          branchId: null,
        },
        include: [
          { model: UserMessageModel, as: "userMessage", required: false },
          { model: AgentMessageModel, as: "agentMessage", required: false },
        ],
        order: [
          ["rank", "ASC"],
          ["version", "DESC"],
        ],
      });

    const beforeMergeRenderRes = await batchRenderMessages(
      projectMemberAuth,
      conversationResourceForProjectMember,
      await fetchMainConversationMessages(),
      "full"
    );
    expect(beforeMergeRenderRes.isOk()).toBe(true);

    const previousMessage = await MessageModel.findOne({
      where: {
        workspaceId: workspace.id,
        conversationId: conversation.id,
        rank: 0,
        branchId: null,
      },
    });
    if (!previousMessage) {
      throw new Error("Previous message should exist.");
    }

    const branch = await ConversationBranchResource.makeNew(mergerAuth, {
      state: "open",
      previousMessageId: previousMessage.id,
      conversationId: conversation.id,
      userId: mergerUser.id,
    });

    const branchUserMessage = await UserMessageModel.create({
      userId: mergerUser.id,
      workspaceId: workspace.id,
      content: "Branch message from restricted agent flow",
      userContextUsername: "testuser",
      userContextTimezone: "UTC",
      userContextFullName: "Test User",
      userContextEmail: "test@example.com",
      userContextProfilePictureUrl: null,
      userContextOrigin: "api",
      clientSideMCPServerIds: [],
    });

    const branchUserMessageRow = await MessageModel.create({
      workspaceId: workspace.id,
      sId: generateRandomModelSId(),
      rank: 2,
      conversationId: conversation.id,
      branchId: branch.id,
      parentId: null,
      userMessageId: branchUserMessage.id,
      agentMessageId: null,
      contentFragmentId: null,
    });

    const branchAgentMessage = await AgentMessageModel.create({
      workspaceId: workspace.id,
      status: "succeeded",
      agentConfigurationId: restrictedAgent.sId,
      agentConfigurationVersion: restrictedAgent.version,
      skipToolsValidation: true,
      completedAt: new Date(),
    });

    await MessageModel.create({
      workspaceId: workspace.id,
      sId: generateRandomModelSId(),
      rank: 3,
      conversationId: conversation.id,
      branchId: branch.id,
      parentId: branchUserMessageRow.id,
      userMessageId: null,
      agentMessageId: branchAgentMessage.id,
      contentFragmentId: null,
    });

    await AgentStepContentModel.create({
      workspaceId: workspace.id,
      agentMessageId: branchAgentMessage.id,
      step: 0,
      index: 0,
      version: 0,
      type: "text_content",
      value: { type: "text_content", value: "restricted answer" },
    });

    const mergeRes = await mergeConversationBranch(mergerAuth, {
      branchId: branch.sId,
      conversationId: conversation.sId,
    });
    if (mergeRes.isErr()) {
      throw mergeRes.error;
    }

    const afterMergeRenderRes = await batchRenderMessages(
      projectMemberAuth,
      conversationResourceForProjectMember,
      await fetchMainConversationMessages(),
      "full"
    );
    expect(afterMergeRenderRes.isOk()).toBe(true);
  });

  it("should append duplicated user message and content-only agent messages", async () => {
    const workspace = await WorkspaceFactory.basic();
    const user = await UserFactory.basic();
    await MembershipFactory.associate(workspace, user, { role: "user" });

    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );

    const conversation = await ConversationModel.create({
      workspaceId: workspace.id,
      sId: generateRandomModelSId(),
      title: "Merge branch test conversation",
      requestedSpaceIds: [],
    });

    // Base message in main conversation (rank 0).
    const baseUserMessage = await UserMessageModel.create({
      userId: user.id,
      workspaceId: workspace.id,
      content: "Base",
      userContextUsername: "testuser",
      userContextTimezone: "UTC",
      userContextFullName: "Test User",
      userContextEmail: "test@example.com",
      userContextProfilePictureUrl: null,
      userContextOrigin: "api",
      clientSideMCPServerIds: [],
    });

    const baseMessage = await MessageModel.create({
      workspaceId: workspace.id,
      sId: generateRandomModelSId(),
      rank: 0,
      conversationId: conversation.id,
      parentId: null,
      userMessageId: baseUserMessage.id,
      agentMessageId: null,
      contentFragmentId: null,
    });

    const branch = await ConversationBranchResource.makeNew(auth, {
      state: "open",
      previousMessageId: baseMessage.id,
      conversationId: conversation.id,
      userId: user.id,
    });
    const branchId = branch.sId;

    // Branch user message (rank 1 in branch).
    const branchedUserMessage = await UserMessageModel.create({
      userId: user.id,
      workspaceId: workspace.id,
      content: "Original user content",
      userContextUsername: "testuser",
      userContextTimezone: "UTC",
      userContextFullName: "Test User",
      userContextEmail: "test@example.com",
      userContextProfilePictureUrl: null,
      userContextOrigin: "api",
      clientSideMCPServerIds: [],
    });

    const branchUserMessageRow = await MessageModel.create({
      workspaceId: workspace.id,
      sId: generateRandomModelSId(),
      rank: 1,
      conversationId: conversation.id,
      branchId: branch.id,
      parentId: null,
      userMessageId: branchedUserMessage.id,
      agentMessageId: null,
      contentFragmentId: null,
    });

    // Branch agent message (rank 2 in branch) with multiple text fragments.
    const branchAgentMessage = await AgentMessageModel.create({
      workspaceId: workspace.id,
      status: "succeeded",
      agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
      agentConfigurationVersion: 0,
      skipToolsValidation: true,
      completedAt: new Date(),
    });

    await MessageModel.create({
      workspaceId: workspace.id,
      sId: generateRandomModelSId(),
      rank: 2,
      conversationId: conversation.id,
      branchId: branch.id,
      parentId: branchUserMessageRow.id,
      userMessageId: null,
      agentMessageId: branchAgentMessage.id,
      contentFragmentId: null,
    });

    await AgentStepContentModel.bulkCreate([
      {
        workspaceId: workspace.id,
        agentMessageId: branchAgentMessage.id,
        step: 0,
        index: 0,
        version: 0,
        type: "text_content",
        value: { type: "text_content", value: "first" },
      },
      {
        workspaceId: workspace.id,
        agentMessageId: branchAgentMessage.id,
        step: 0,
        index: 1,
        version: 0,
        type: "text_content",
        value: { type: "text_content", value: "final answer" },
      },
    ]);

    const mergeRes = await mergeConversationBranch(auth, {
      branchId,
      conversationId: conversation.sId,
    });
    if (mergeRes.isErr()) {
      throw mergeRes.error;
    }

    const mergedUserMessage = await MessageModel.findOne({
      where: {
        workspaceId: workspace.id,
        conversationId: conversation.id,
        sId: mergeRes.value.mergedUserMessageId,
      },
      include: [{ model: UserMessageModel, as: "userMessage", required: true }],
    });
    expect(mergedUserMessage?.branchId ?? null).toBeNull();
    expect(mergedUserMessage?.userMessage?.content).toBe(
      "Original user content"
    );

    const mergedAgentMessages = await MessageModel.findAll({
      where: {
        workspaceId: workspace.id,
        conversationId: conversation.id,
        sId: mergeRes.value.mergedAgentMessageIds,
      },
      include: [
        { model: AgentMessageModel, as: "agentMessage", required: true },
      ],
      order: [["rank", "ASC"]],
    });
    expect(mergedAgentMessages.length).toBe(1);
    expect(mergedAgentMessages[0].branchId ?? null).toBeNull();
    expect(mergedAgentMessages[0].agentMessage?.agentConfigurationId).toBe(
      GLOBAL_AGENTS_SID.DUST
    );

    const mergedStepContents = await AgentStepContentModel.findAll({
      where: {
        workspaceId: workspace.id,
        agentMessageId: mergedAgentMessages[0].agentMessageId!,
      },
    });
    expect(mergedStepContents.length).toBe(1);
    expect(mergedStepContents[0].type).toBe("text_content");
    expect((mergedStepContents[0].value as any).value).toBe(
      "> From :mention[dust]{sId=dust}\n\nfirst\nfinal answer"
    );

    const updatedBranch = await ConversationBranchModel.findOne({
      where: { id: branch.id, workspaceId: workspace.id },
    });
    expect(updatedBranch?.state).toBe("merged");
  });

  it("should return branch_not_found when branch does not exist", async () => {
    const workspace = await WorkspaceFactory.basic();
    const user = await UserFactory.basic();
    await MembershipFactory.associate(workspace, user, { role: "user" });

    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );

    const conversation = await ConversationModel.create({
      workspaceId: workspace.id,
      sId: generateRandomModelSId(),
      title: "Merge branch not found test conversation",
      requestedSpaceIds: [],
    });

    const res = await mergeConversationBranch(auth, {
      branchId: ConversationBranchResource.modelIdToSId({
        id: 99999999,
        workspaceId: workspace.id,
      }),
      conversationId: conversation.sId,
    });
    expect(res.isErr()).toBe(true);
    expect(res.isErr() ? res.error.code : "").toBe("branch_not_found");
  });

  it("should return branch_not_found when branch belongs to someone else", async () => {
    const workspace = await WorkspaceFactory.basic();
    const owner = await UserFactory.basic();
    const other = await UserFactory.basic();
    await MembershipFactory.associate(workspace, owner, { role: "user" });
    await MembershipFactory.associate(workspace, other, { role: "user" });

    const otherAuth = await Authenticator.fromUserIdAndWorkspaceId(
      other.sId,
      workspace.sId
    );

    const conversation = await ConversationModel.create({
      workspaceId: workspace.id,
      sId: generateRandomModelSId(),
      title: "Unauthorized merge test conversation",
      requestedSpaceIds: [],
    });

    const baseUserMessage = await UserMessageModel.create({
      userId: owner.id,
      workspaceId: workspace.id,
      content: "Base",
      userContextUsername: "testuser",
      userContextTimezone: "UTC",
      userContextFullName: "Test User",
      userContextEmail: "test@example.com",
      userContextProfilePictureUrl: null,
      userContextOrigin: "web",
      clientSideMCPServerIds: [],
    });

    const baseMessage = await MessageModel.create({
      workspaceId: workspace.id,
      sId: generateRandomModelSId(),
      rank: 0,
      conversationId: conversation.id,
      parentId: null,
      userMessageId: baseUserMessage.id,
      agentMessageId: null,
      contentFragmentId: null,
    });

    const branch = await ConversationBranchResource.makeNew(otherAuth, {
      state: "open",
      previousMessageId: baseMessage.id,
      conversationId: conversation.id,
      userId: owner.id,
    });
    const branchId = branch.sId;

    const res = await mergeConversationBranch(otherAuth, {
      branchId,
      conversationId: conversation.sId,
    });
    expect(res.isErr()).toBe(true);
    expect(res.isErr() ? res.error.code : "").toBe("branch_not_found");
  });

  it("should return branch_not_open when branch is not open", async () => {
    const workspace = await WorkspaceFactory.basic();
    const user = await UserFactory.basic();
    await MembershipFactory.associate(workspace, user, { role: "user" });

    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );

    const conversation = await ConversationModel.create({
      workspaceId: workspace.id,
      sId: generateRandomModelSId(),
      title: "Non-open merge test conversation",
      requestedSpaceIds: [],
    });

    const baseUserMessage = await UserMessageModel.create({
      userId: user.id,
      workspaceId: workspace.id,
      content: "Base",
      userContextUsername: "testuser",
      userContextTimezone: "UTC",
      userContextFullName: "Test User",
      userContextEmail: "test@example.com",
      userContextProfilePictureUrl: null,
      userContextOrigin: "web",
      clientSideMCPServerIds: [],
    });

    const baseMessage = await MessageModel.create({
      workspaceId: workspace.id,
      sId: generateRandomModelSId(),
      rank: 0,
      conversationId: conversation.id,
      parentId: null,
      userMessageId: baseUserMessage.id,
      agentMessageId: null,
      contentFragmentId: null,
    });

    const branch = await ConversationBranchResource.makeNew(auth, {
      state: "merged",
      previousMessageId: baseMessage.id,
      conversationId: conversation.id,
      userId: user.id,
    });

    const res = await mergeConversationBranch(auth, {
      branchId: branch.sId,
      conversationId: conversation.sId,
    });
    expect(res.isErr()).toBe(true);
    expect(res.isErr() ? res.error.code : "").toBe("branch_not_open");
  });
});

describe("closeConversationBranch", () => {
  it("should close an open branch", async () => {
    const workspace = await WorkspaceFactory.basic();
    const user = await UserFactory.basic();
    await MembershipFactory.associate(workspace, user, { role: "user" });

    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );

    const conversation = await ConversationModel.create({
      workspaceId: workspace.id,
      sId: generateRandomModelSId(),
      title: "Close branch test conversation",
      requestedSpaceIds: [],
    });

    const baseUserMessage = await UserMessageModel.create({
      userId: user.id,
      workspaceId: workspace.id,
      content: "Base",
      userContextUsername: "testuser",
      userContextTimezone: "UTC",
      userContextFullName: "Test User",
      userContextEmail: "test@example.com",
      userContextProfilePictureUrl: null,
      userContextOrigin: "web",
      clientSideMCPServerIds: [],
    });

    const baseMessage = await MessageModel.create({
      workspaceId: workspace.id,
      sId: generateRandomModelSId(),
      rank: 0,
      conversationId: conversation.id,
      parentId: null,
      userMessageId: baseUserMessage.id,
      agentMessageId: null,
      contentFragmentId: null,
    });

    const branch = await ConversationBranchResource.makeNew(auth, {
      state: "open",
      previousMessageId: baseMessage.id,
      conversationId: conversation.id,
      userId: user.id,
    });

    const res = await closeConversationBranch(auth, {
      branchId: branch.sId,
      conversationId: conversation.sId,
    });
    if (res.isErr()) {
      throw res.error;
    }
    expect(res.value.closedBranchId).toBe(branch.id);

    const updatedBranch = await ConversationBranchModel.findOne({
      where: { id: branch.id, workspaceId: workspace.id },
    });
    expect(updatedBranch?.state).toBe("closed");
  });

  it("should return branch_not_found when branch does not exist", async () => {
    const workspace = await WorkspaceFactory.basic();
    const user = await UserFactory.basic();
    await MembershipFactory.associate(workspace, user, { role: "user" });

    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );

    const conversation = await ConversationModel.create({
      workspaceId: workspace.id,
      sId: generateRandomModelSId(),
      title: "Close branch not found test conversation",
      requestedSpaceIds: [],
    });

    const res = await closeConversationBranch(auth, {
      branchId: ConversationBranchResource.modelIdToSId({
        id: 99999999,
        workspaceId: workspace.id,
      }),
      conversationId: conversation.sId,
    });
    expect(res.isErr()).toBe(true);
    expect(res.isErr() ? res.error.code : "").toBe("branch_not_found");
  });

  it("should return branch_not_found when branch belongs to someone else", async () => {
    const workspace = await WorkspaceFactory.basic();
    const user = await UserFactory.basic();
    const otherUser = await UserFactory.basic();
    await MembershipFactory.associate(workspace, user, { role: "user" });
    await MembershipFactory.associate(workspace, otherUser, { role: "user" });

    const otherAuth = await Authenticator.fromUserIdAndWorkspaceId(
      otherUser.sId,
      workspace.sId
    );

    const conversation = await ConversationModel.create({
      workspaceId: workspace.id,
      sId: generateRandomModelSId(),
      title: "Unauthorized close test conversation",
      requestedSpaceIds: [],
    });

    const baseUserMessage = await UserMessageModel.create({
      userId: user.id,
      workspaceId: workspace.id,
      content: "Base",
      userContextUsername: "testuser",
      userContextTimezone: "UTC",
      userContextFullName: "Test User",
      userContextEmail: "test@example.com",
      userContextProfilePictureUrl: null,
      userContextOrigin: "web",
      clientSideMCPServerIds: [],
    });

    const baseMessage = await MessageModel.create({
      workspaceId: workspace.id,
      sId: generateRandomModelSId(),
      rank: 0,
      conversationId: conversation.id,
      parentId: null,
      userMessageId: baseUserMessage.id,
      agentMessageId: null,
      contentFragmentId: null,
    });

    const branch = await ConversationBranchResource.makeNew(otherAuth, {
      state: "open",
      previousMessageId: baseMessage.id,
      conversationId: conversation.id,
      userId: user.id,
    });

    const res = await closeConversationBranch(otherAuth, {
      branchId: branch.sId,
      conversationId: conversation.sId,
    });
    expect(res.isErr()).toBe(true);
    expect(res.isErr() ? res.error.code : "").toBe("branch_not_found");
  });

  it("should return branch_not_open when branch is not open", async () => {
    const workspace = await WorkspaceFactory.basic();
    const user = await UserFactory.basic();
    await MembershipFactory.associate(workspace, user, { role: "user" });

    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );

    const conversation = await ConversationModel.create({
      workspaceId: workspace.id,
      sId: generateRandomModelSId(),
      title: "Non-open close test conversation",
      requestedSpaceIds: [],
    });

    const baseUserMessage = await UserMessageModel.create({
      userId: user.id,
      workspaceId: workspace.id,
      content: "Base",
      userContextUsername: "testuser",
      userContextTimezone: "UTC",
      userContextFullName: "Test User",
      userContextEmail: "test@example.com",
      userContextProfilePictureUrl: null,
      userContextOrigin: "web",
      clientSideMCPServerIds: [],
    });

    const baseMessage = await MessageModel.create({
      workspaceId: workspace.id,
      sId: generateRandomModelSId(),
      rank: 0,
      conversationId: conversation.id,
      parentId: null,
      userMessageId: baseUserMessage.id,
      agentMessageId: null,
      contentFragmentId: null,
    });

    const branch = await ConversationBranchResource.makeNew(auth, {
      state: "closed",
      previousMessageId: baseMessage.id,
      conversationId: conversation.id,
      userId: user.id,
    });

    const res = await closeConversationBranch(auth, {
      branchId: branch.sId,
      conversationId: conversation.sId,
    });
    expect(res.isErr()).toBe(true);
    expect(res.isErr() ? res.error.code : "").toBe("branch_not_open");
  });
});
