import { Authenticator } from "@app/lib/auth";
import { CONVERSATIONS_RETENTION_MIN_DAYS } from "@app/lib/conversations_retention";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import {
  purgeAgentConversationsBatchActivity,
  purgeConversationsBatchActivity,
} from "@app/temporal/data_retention/activities";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { assert, describe, expect, it, vi } from "vitest";

vi.mock("@temporalio/activity", () => ({
  heartbeat: vi.fn(),
}));

const RETENTION_DAYS = CONVERSATIONS_RETENTION_MIN_DAYS;
const OLD_CONVERSATION_DAYS = RETENTION_DAYS + 1;
const DAY_IN_MS = 24 * 60 * 60 * 1000;

const dateFromDaysAgo = (days: number) =>
  new Date(Date.now() - days * DAY_IN_MS);

async function createOldRestrictedConversation() {
  const { authenticator, user, workspace } = await createResourceTest({
    role: "admin",
  });

  const agent = await AgentConfigurationFactory.createTestAgent(authenticator);
  const restrictedSpace = await SpaceFactory.regular(workspace);

  const internalAdminAuth = await Authenticator.internalAdminForWorkspace(
    workspace.sId
  );
  const addMemberRes = await restrictedSpace.addMembers(internalAdminAuth, {
    userIds: [user.sId],
  });
  assert(addMemberRes.isOk(), "Failed to add admin user to restricted space.");

  const adminAuth = await Authenticator.fromUserIdAndWorkspaceId(
    user.sId,
    workspace.sId
  );
  const conversation = await ConversationFactory.create(adminAuth, {
    agentConfigurationId: agent.sId,
    conversationCreatedAt: dateFromDaysAgo(OLD_CONVERSATION_DAYS),
    messagesCreatedAt: [dateFromDaysAgo(OLD_CONVERSATION_DAYS)],
    requestedSpaceIds: [restrictedSpace.id],
    spaceId: restrictedSpace.id,
  });

  return {
    agent,
    adminAuth,
    conversation,
    workspace,
  };
}

async function expectConversationDeleted(
  auth: Authenticator,
  conversationId: string
) {
  const deletedConversation = await ConversationResource.fetchById(
    auth,
    conversationId,
    {
      dangerouslySkipPermissionFiltering: true,
      includeDeleted: true,
    }
  );

  expect(deletedConversation).toBeNull();
}

describe("data retention activities", () => {
  it("purges workspace-level retained conversations in restricted regular spaces", async () => {
    const { adminAuth, conversation, workspace } =
      await createOldRestrictedConversation();

    const updateRetentionRes =
      await WorkspaceResource.updateConversationsRetention(
        workspace.id,
        RETENTION_DAYS
      );
    assert(
      updateRetentionRes.isOk(),
      "Failed to set workspace conversation retention."
    );

    const result = await purgeConversationsBatchActivity({
      workspaceIds: [workspace.id],
    });

    expect(result).toEqual([
      {
        workspaceId: workspace.sId,
        workspaceModelId: workspace.id,
        nbConversationsDeleted: 1,
      },
    ]);

    await expectConversationDeleted(adminAuth, conversation.sId);
  });

  it("purges agent-level retained conversations in restricted regular spaces", async () => {
    const { adminAuth, agent, conversation, workspace } =
      await createOldRestrictedConversation();

    const result = await purgeAgentConversationsBatchActivity({
      agentConfigurationId: agent.sId,
      retentionDays: RETENTION_DAYS,
      workspaceId: workspace.id,
    });

    expect(result).toEqual({
      agentConfigurationId: agent.sId,
      workspaceId: workspace.sId,
      workspaceModelId: workspace.id,
      retentionDays: RETENTION_DAYS,
      nbConversationsDeleted: 1,
    });

    await expectConversationDeleted(adminAuth, conversation.sId);
  });
});
