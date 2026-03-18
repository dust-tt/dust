import { Authenticator } from "@app/lib/auth";
import { ConversationModel } from "@app/lib/models/agent/conversation";
import { WorkspaceModel } from "@app/lib/resources/storage/models/workspace";
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

const RETENTION_DAYS = 30;
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
    conversation,
    workspace,
  };
}

describe("data retention activities", () => {
  it("purges workspace-level retained conversations in restricted regular spaces", async () => {
    const { conversation, workspace } = await createOldRestrictedConversation();

    await WorkspaceModel.update(
      {
        conversationsRetentionDays: RETENTION_DAYS,
      },
      {
        where: {
          id: workspace.id,
        },
      }
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

    const deletedConversation = await ConversationModel.findOne({
      where: {
        sId: conversation.sId,
        workspaceId: workspace.id,
      },
    });

    expect(deletedConversation).toBeNull();
  });

  it("purges agent-level retained conversations in restricted regular spaces", async () => {
    const { agent, conversation, workspace } =
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

    const deletedConversation = await ConversationModel.findOne({
      where: {
        sId: conversation.sId,
        workspaceId: workspace.id,
      },
    });

    expect(deletedConversation).toBeNull();
  });
});
