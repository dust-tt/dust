import { Authenticator } from "@app/lib/auth";
import {
  ConversationModel,
  MessageModel,
  UserMessageModel,
} from "@app/lib/models/agent/conversation";
import { ConversationBranchResource } from "@app/lib/resources/conversation_branch_resource";
import { generateRandomModelSId } from "@app/lib/resources/string_ids_server";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { beforeEach, describe, expect, it } from "vitest";

describe("ConversationBranchResource permissions", () => {
  let workspace: Awaited<ReturnType<typeof WorkspaceFactory.basic>>;
  let ownerAuth: Authenticator;
  let otherAuth: Authenticator;
  let adminAuth: Authenticator;

  let ownerBranchId: string;
  let otherBranchId: string;

  beforeEach(async () => {
    workspace = await WorkspaceFactory.basic();

    const ownerUser = await UserFactory.basic();
    const otherUser = await UserFactory.basic();
    const adminUser = await UserFactory.basic();

    await MembershipFactory.associate(workspace, ownerUser, { role: "user" });
    await MembershipFactory.associate(workspace, otherUser, { role: "user" });
    await MembershipFactory.associate(workspace, adminUser, { role: "admin" });

    ownerAuth = await Authenticator.fromUserIdAndWorkspaceId(
      ownerUser.sId,
      workspace.sId
    );
    otherAuth = await Authenticator.fromUserIdAndWorkspaceId(
      otherUser.sId,
      workspace.sId
    );
    adminAuth = await Authenticator.fromUserIdAndWorkspaceId(
      adminUser.sId,
      workspace.sId
    );

    const conversation = await ConversationModel.create({
      workspaceId: workspace.id,
      sId: generateRandomModelSId(),
      title: "Test conversation for branches",
      requestedSpaceIds: [],
    });

    const ownerBaseUserMessage = await UserMessageModel.create({
      userId: ownerUser.id,
      workspaceId: workspace.id,
      content: "Base message for branch",
      userContextUsername: "testuser",
      userContextTimezone: "UTC",
      userContextFullName: "Test User",
      userContextEmail: "test@example.com",
      userContextProfilePictureUrl: null,
      userContextOrigin: "web",
      clientSideMCPServerIds: [],
    });

    const ownerBaseMessage = await MessageModel.create({
      workspaceId: workspace.id,
      sId: generateRandomModelSId(),
      rank: 0,
      conversationId: conversation.id,
      parentId: null,
      userMessageId: ownerBaseUserMessage.id,
      agentMessageId: null,
      contentFragmentId: null,
    });

    const otherBaseUserMessage = await UserMessageModel.create({
      userId: otherUser.id,
      workspaceId: workspace.id,
      content: "Base message for other branch",
      userContextUsername: "testuser",
      userContextTimezone: "UTC",
      userContextFullName: "Test User",
      userContextEmail: "test@example.com",
      userContextProfilePictureUrl: null,
      userContextOrigin: "web",
      clientSideMCPServerIds: [],
    });

    const otherBaseMessage = await MessageModel.create({
      workspaceId: workspace.id,
      sId: generateRandomModelSId(),
      rank: 1,
      conversationId: conversation.id,
      parentId: null,
      userMessageId: otherBaseUserMessage.id,
      agentMessageId: null,
      contentFragmentId: null,
    });

    const ownerBranch = await ConversationBranchResource.makeNew(ownerAuth, {
      state: "open",
      previousMessageId: ownerBaseMessage.id,
      conversationId: conversation.id,
      userId: ownerUser.id,
    });

    const otherBranch = await ConversationBranchResource.makeNew(otherAuth, {
      state: "open",
      previousMessageId: otherBaseMessage.id,
      conversationId: conversation.id,
      userId: otherUser.id,
    });

    ownerBranchId = ownerBranch.sId;
    otherBranchId = otherBranch.sId;
  });

  it("fetchById should only return branches readable by the caller", async () => {
    const ownerBranchForOwner = await ConversationBranchResource.fetchById(
      ownerAuth,
      ownerBranchId
    );
    expect(ownerBranchForOwner).not.toBeNull();
    expect(ownerBranchForOwner?.userId).toBe(ownerAuth.getNonNullableUser().id);

    const ownerBranchForOther = await ConversationBranchResource.fetchById(
      otherAuth,
      ownerBranchId
    );
    expect(ownerBranchForOther).toBeNull();

    const ownerBranchForAdmin = await ConversationBranchResource.fetchById(
      adminAuth,
      ownerBranchId
    );
    expect(ownerBranchForAdmin).not.toBeNull();
    expect(ownerBranchForAdmin?.userId).toBeDefined();
  });

  it("fetchByIds should filter out branches the user cannot read", async () => {
    const allBranchIDs = [ownerBranchId, otherBranchId];

    const ownerBranches = await ConversationBranchResource.fetchByIds(
      ownerAuth,
      allBranchIDs
    );
    const ownerBranchIds = ownerBranches.map((b) => b.userId);
    expect(ownerBranchIds).toContain(ownerAuth.getNonNullableUser().id);
    expect(ownerBranchIds).not.toContain(otherAuth.getNonNullableUser().id);

    const otherBranches = await ConversationBranchResource.fetchByIds(
      otherAuth,
      allBranchIDs
    );
    const otherBranchIds = otherBranches.map((b) => b.userId);
    expect(otherBranchIds).toContain(otherAuth.getNonNullableUser().id);
    expect(otherBranchIds).not.toContain(ownerAuth.getNonNullableUser().id);

    const adminBranches = await ConversationBranchResource.fetchByIds(
      adminAuth,
      allBranchIDs
    );
    const adminBranchIds = adminBranches.map((b) => b.userId);
    expect(adminBranchIds).toContain(ownerAuth.getNonNullableUser().id);
    expect(adminBranchIds).toContain(otherAuth.getNonNullableUser().id);
  });
});
