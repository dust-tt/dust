import { postUserMessage } from "@app/lib/api/assistant/conversation";
import { getConversation } from "@app/lib/api/assistant/conversation/fetch";
import { validateAgentMention } from "@app/lib/api/assistant/conversation/validate_agent_mention";
import { publishMessageEventsOnMessagePostOrEdit } from "@app/lib/api/assistant/streaming/events";
import { Authenticator } from "@app/lib/auth";
import {
  AgentMessageModel,
  MentionModel,
  MessageModel,
} from "@app/lib/models/agent/conversation";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import * as rateLimiterModule from "@app/lib/utils/rate_limiter";
import { launchAgentLoopWorkflow } from "@app/temporal/agent_loop/client";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import type { ConversationType } from "@app/types/assistant/conversation";
import type { WorkspaceType } from "@app/types/user";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/temporal/agent_loop/client", () => ({
  launchAgentLoopWorkflow: vi.fn(),
  launchCompactionWorkflow: vi.fn(),
}));

vi.mock("@app/lib/api/assistant/streaming/events", () => ({
  publishAgentMessagesEvents: vi.fn(),
  publishConversationEvent: vi.fn(),
  publishMessageEventsOnMessagePostOrEdit: vi.fn(),
}));

vi.mock("@app/lib/api/assistant/pubsub", () => ({
  gracefullyStopAgentLoop: vi.fn(),
}));

async function fetchRegularAutoGroup(
  space: SpaceResource,
  auth: Authenticator
) {
  const [group] = await space.fetchRegularAutoGroups(auth);
  return group ?? null;
}

async function fetchConversationResource(
  auth: Authenticator,
  sId: string
): Promise<ConversationResource> {
  const resource = await ConversationResource.fetchById(auth, sId);
  if (!resource) {
    throw new Error(`Failed to fetch conversation resource: ${sId}`);
  }
  return resource;
}

describe("validateAgentMention", () => {
  let workspace: WorkspaceType;
  let auth: Authenticator;
  let projectSpace: Awaited<ReturnType<typeof SpaceFactory.project>>;
  let anotherProjectSpace: Awaited<ReturnType<typeof SpaceFactory.project>>;
  let projectConversation: ConversationType;
  let projectConversationResource: ConversationResource;
  let agentWithDifferentSpace: LightAgentConfigurationType;
  let userMessageSId: string;
  let userMessageId: number;

  beforeEach(async () => {
    const setup = await createResourceTest({});
    workspace = setup.workspace as WorkspaceType;
    auth = setup.authenticator;

    projectSpace = await SpaceFactory.project(workspace);
    anotherProjectSpace = await SpaceFactory.project(workspace);

    const internalAdminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    const user = auth.getNonNullableUser();

    const projectSpaceGroup = await fetchRegularAutoGroup(
      projectSpace,
      internalAdminAuth
    );
    const anotherProjectSpaceGroup = await fetchRegularAutoGroup(
      anotherProjectSpace,
      internalAdminAuth
    );

    if (projectSpaceGroup) {
      const addRes = await projectSpaceGroup.dangerouslyAddMember(
        internalAdminAuth,
        { user: user.toJSON() }
      );
      if (addRes.isErr()) {
        throw new Error(addRes.error.message);
      }

      const secondProjectMember = await UserFactory.basic();
      await MembershipFactory.associate(workspace, secondProjectMember, {
        role: "user",
      });
      const addSecondRes = await projectSpaceGroup.dangerouslyAddMember(
        internalAdminAuth,
        { user: secondProjectMember.toJSON() }
      );
      if (addSecondRes.isErr()) {
        throw new Error(addSecondRes.error.message);
      }
    }
    if (anotherProjectSpaceGroup) {
      const addRes = await anotherProjectSpaceGroup.dangerouslyAddMember(
        internalAdminAuth,
        { user: user.toJSON() }
      );
      if (addRes.isErr()) {
        throw new Error(addRes.error.message);
      }
    }

    await auth.refresh();

    agentWithDifferentSpace = await AgentConfigurationFactory.createTestAgent(
      auth,
      {
        name: "Restricted Space Agent",
        description: "Agent that uses a different project space",
      }
    );

    const { AgentConfigurationModel } = await import(
      "@app/lib/models/agent/agent"
    );
    await AgentConfigurationModel.update(
      { requestedSpaceIds: [anotherProjectSpace.id] },
      {
        where: {
          sId: agentWithDifferentSpace.sId,
          workspaceId: workspace.id,
        },
        hooks: false,
        silent: true,
      }
    );

    const conversationWithoutContent = await ConversationFactory.create(auth, {
      agentConfigurationId: agentWithDifferentSpace.sId,
      messagesCreatedAt: [new Date()],
      spaceId: projectSpace.id,
    });

    await AgentMessageModel.update(
      { status: "succeeded" },
      { where: { workspaceId: workspace.id, status: "created" } }
    );

    projectConversationResource = await fetchConversationResource(
      auth,
      conversationWithoutContent.sId
    );

    const rateLimiterSpy = vi
      .spyOn(rateLimiterModule, "rateLimiter")
      .mockResolvedValue(100);

    const userJson = user.toJSON();
    const postResult = await postUserMessage(auth, {
      conversationResource: projectConversationResource,
      content: `Hello @${agentWithDifferentSpace.name}`,
      mentions: [{ configurationId: agentWithDifferentSpace.sId }],
      context: {
        username: userJson.username,
        timezone: "UTC",
        fullName: userJson.fullName,
        email: userJson.email,
        profilePictureUrl: userJson.image,
        origin: "web",
      },
      skipToolsValidation: false,
    });

    rateLimiterSpy.mockRestore();

    expect(postResult.isOk()).toBe(true);
    if (!postResult.isOk()) {
      throw new Error("Failed to post restricted agent message");
    }

    expect(postResult.value.agentMessages).toHaveLength(0);
    userMessageSId = postResult.value.userMessage.sId;
    userMessageId = postResult.value.userMessage.id;

    const mentionRow = await MentionModel.findOne({
      where: {
        workspaceId: workspace.id,
        messageId: userMessageId,
        agentConfigurationId: agentWithDifferentSpace.sId,
      },
    });
    expect(mentionRow?.status).toBe("agent_restricted_by_space_usage");

    const fetched = await getConversation(auth, conversationWithoutContent.sId);
    if (fetched.isErr()) {
      throw new Error("Failed to fetch conversation");
    }
    projectConversation = fetched.value;

    vi.mocked(launchAgentLoopWorkflow).mockClear();
    vi.mocked(publishMessageEventsOnMessagePostOrEdit).mockClear();
  });

  it("approves a restricted agent mention, creates an agent message, and launches the agent loop", async () => {
    const rateLimiterSpy = vi
      .spyOn(rateLimiterModule, "rateLimiter")
      .mockResolvedValue(100);

    const result = await validateAgentMention(auth, {
      conversationId: projectConversation.sId,
      agentConfigurationId: agentWithDifferentSpace.sId,
      messageId: userMessageSId,
      approvalState: "approved",
    });

    expect(result.isOk()).toBe(true);

    const mentionRow = await MentionModel.findOne({
      where: {
        workspaceId: workspace.id,
        messageId: userMessageId,
        agentConfigurationId: agentWithDifferentSpace.sId,
      },
    });
    expect(mentionRow?.status).toBe("approved");

    const allChildMessages = await MessageModel.findAll({
      where: {
        workspaceId: workspace.id,
        conversationId: projectConversation.id,
        parentId: userMessageId,
      },
    });
    const agentChildren = allChildMessages.filter(
      (m) => m.agentMessageId !== null
    );
    expect(agentChildren.length).toBe(1);

    expect(launchAgentLoopWorkflow).toHaveBeenCalledTimes(1);
    expect(publishMessageEventsOnMessagePostOrEdit).toHaveBeenCalled();

    rateLimiterSpy.mockRestore();
  });

  it("rejects a restricted agent mention without creating an agent message", async () => {
    const result = await validateAgentMention(auth, {
      conversationId: projectConversation.sId,
      agentConfigurationId: agentWithDifferentSpace.sId,
      messageId: userMessageSId,
      approvalState: "rejected",
    });

    expect(result.isOk()).toBe(true);

    const mentionRow = await MentionModel.findOne({
      where: {
        workspaceId: workspace.id,
        messageId: userMessageId,
        agentConfigurationId: agentWithDifferentSpace.sId,
      },
    });
    expect(mentionRow?.status).toBe("rejected");

    const allChildMessages = await MessageModel.findAll({
      where: {
        workspaceId: workspace.id,
        conversationId: projectConversation.id,
        parentId: userMessageId,
      },
    });
    expect(
      allChildMessages.filter((m) => m.agentMessageId !== null)
    ).toHaveLength(0);

    expect(launchAgentLoopWorkflow).not.toHaveBeenCalled();
    expect(publishMessageEventsOnMessagePostOrEdit).toHaveBeenCalled();
  });

  it("rejects approval from a user who cannot respond to the parent message", async () => {
    const otherUser = await UserFactory.basic();
    await MembershipFactory.associate(workspace, otherUser, { role: "user" });

    const internalAdminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    const projectSpaceGroup = await fetchRegularAutoGroup(
      projectSpace,
      internalAdminAuth
    );
    if (projectSpaceGroup) {
      const addRes = await projectSpaceGroup.dangerouslyAddMember(
        internalAdminAuth,
        { user: otherUser.toJSON() }
      );
      if (addRes.isErr()) {
        throw new Error(addRes.error.message);
      }
    }

    const otherAuth = await Authenticator.fromUserIdAndWorkspaceId(
      otherUser.sId,
      workspace.sId
    );

    const result = await validateAgentMention(otherAuth, {
      conversationId: projectConversation.sId,
      agentConfigurationId: agentWithDifferentSpace.sId,
      messageId: userMessageSId,
      approvalState: "approved",
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.status_code).toBe(403);
    }
    expect(launchAgentLoopWorkflow).not.toHaveBeenCalled();
  });

  it("approves all duplicate restricted mention rows for the same agent", async () => {
    const existing = await MentionModel.findOne({
      where: {
        workspaceId: workspace.id,
        messageId: userMessageId,
        agentConfigurationId: agentWithDifferentSpace.sId,
        status: "agent_restricted_by_space_usage",
      },
    });
    expect(existing).not.toBeNull();
    if (!existing) {
      throw new Error("Expected restricted mention row");
    }

    // Simulate a duplicate MentionModel row (same agent, same message).
    await MentionModel.create({
      workspaceId: workspace.id,
      messageId: userMessageId,
      agentConfigurationId: agentWithDifferentSpace.sId,
      status: "agent_restricted_by_space_usage",
      dismissed: false,
    });

    const rateLimiterSpy = vi
      .spyOn(rateLimiterModule, "rateLimiter")
      .mockResolvedValue(100);

    const result = await validateAgentMention(auth, {
      conversationId: projectConversation.sId,
      agentConfigurationId: agentWithDifferentSpace.sId,
      messageId: userMessageSId,
      approvalState: "approved",
    });

    expect(result.isOk()).toBe(true);

    const mentionRows = await MentionModel.findAll({
      where: {
        workspaceId: workspace.id,
        messageId: userMessageId,
        agentConfigurationId: agentWithDifferentSpace.sId,
      },
    });
    expect(mentionRows).toHaveLength(2);
    expect(mentionRows.every((m) => m.status === "approved")).toBe(true);

    const allChildMessages = await MessageModel.findAll({
      where: {
        workspaceId: workspace.id,
        conversationId: projectConversation.id,
        parentId: userMessageId,
      },
    });
    expect(
      allChildMessages.filter((m) => m.agentMessageId !== null)
    ).toHaveLength(1);

    const publishedCalls = vi.mocked(publishMessageEventsOnMessagePostOrEdit)
      .mock.calls;
    const lastPublish = publishedCalls[publishedCalls.length - 1];
    const publishedMessage = lastPublish?.[1] as
      | { richMentions?: { id: string; status: string }[] }
      | undefined;
    const pendingRestricted =
      publishedMessage?.richMentions?.filter(
        (m) =>
          m.id === agentWithDifferentSpace.sId &&
          m.status === "agent_restricted_by_space_usage"
      ) ?? [];
    expect(pendingRestricted).toHaveLength(0);

    const approvedForAgent =
      publishedMessage?.richMentions?.filter(
        (m) => m.id === agentWithDifferentSpace.sId && m.status === "approved"
      ) ?? [];
    expect(approvedForAgent).toHaveLength(1);

    rateLimiterSpy.mockRestore();
  });
});
