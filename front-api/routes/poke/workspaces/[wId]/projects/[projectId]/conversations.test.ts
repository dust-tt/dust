import { Authenticator } from "@app/lib/auth";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

function projectConversationsUrl(workspaceId: string, projectId: string) {
  return `/api/poke/workspaces/${workspaceId}/projects/${projectId}/conversations`;
}

describe("GET /api/poke/workspaces/:wId/projects/:projectId/conversations", () => {
  it("lists the pod conversations with cursor pagination", async () => {
    const {
      auth: initialAuth,
      user,
      workspace,
    } = await createPrivateApiMockRequest({
      isSuperUser: true,
      role: "admin",
    });
    const project = await SpaceFactory.project(workspace, user.id);
    const otherProject = await SpaceFactory.project(workspace, user.id);
    await project.addMembers(initialAuth, { userIds: [user.sId] });
    await otherProject.addMembers(initialAuth, { userIds: [user.sId] });
    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );

    const olderConversation = await ConversationFactory.create(auth, {
      agentConfigurationId: "unused",
      messagesCreatedAt: [],
      requestedSpaceIds: [project.id],
      spaceId: project.id,
    });
    const newerConversation = await ConversationFactory.create(auth, {
      agentConfigurationId: "unused",
      messagesCreatedAt: [],
      requestedSpaceIds: [project.id],
      spaceId: project.id,
    });
    const testConversation = await ConversationFactory.create(auth, {
      agentConfigurationId: "unused",
      messagesCreatedAt: [],
      requestedSpaceIds: [project.id],
      spaceId: project.id,
      visibility: "test",
    });
    const otherProjectConversation = await ConversationFactory.create(auth, {
      agentConfigurationId: "unused",
      messagesCreatedAt: [],
      requestedSpaceIds: [otherProject.id],
      spaceId: otherProject.id,
    });

    await ConversationFactory.setUpdatedAtForTest(
      auth,
      olderConversation.id,
      new Date("2026-01-01T00:00:00.000Z")
    );
    await ConversationFactory.setUpdatedAtForTest(
      auth,
      newerConversation.id,
      new Date("2026-01-02T00:00:00.000Z")
    );

    const url = projectConversationsUrl(workspace.sId, project.sId);
    const firstResponse = await honoApp.request(`${url}?limit=1`);

    expect(firstResponse.status).toBe(200);
    const firstPage = await firstResponse.json();
    expect(firstPage.conversations).toEqual([
      expect.objectContaining({ id: newerConversation.sId }),
    ]);
    expect(firstPage.hasMore).toBe(true);
    expect(firstPage.lastValue).not.toBeNull();

    const secondResponse = await honoApp.request(
      `${url}?limit=1&lastValue=${firstPage.lastValue}`
    );

    expect(secondResponse.status).toBe(200);
    const secondPage = await secondResponse.json();
    expect(secondPage.conversations).toEqual([
      expect.objectContaining({ id: olderConversation.sId }),
    ]);
    expect(secondPage.hasMore).toBe(false);

    const returnedConversationIds = [
      ...firstPage.conversations,
      ...secondPage.conversations,
    ].map((conversation: { id: string }) => conversation.id);
    expect(returnedConversationIds).not.toContain(testConversation.sId);
    expect(returnedConversationIds).not.toContain(otherProjectConversation.sId);
  });
});
