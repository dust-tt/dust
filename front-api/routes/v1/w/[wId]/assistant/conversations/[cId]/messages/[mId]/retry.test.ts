import { retryAgentMessage } from "@app/lib/api/assistant/conversation";
import { Authenticator } from "@app/lib/auth";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createPublicApiMockRequest } from "@app/tests/utils/generic_public_api_tests";
import { KeyFactory } from "@app/tests/utils/KeyFactory";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import { isAgentMessageType } from "@app/types/assistant/conversation";
import { Ok } from "@app/types/shared/result";
import { honoApp } from "@front-api/app";
import { assert, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/api/assistant/conversation", async (importOriginal) => {
  const original =
    await importOriginal<
      typeof import("@app/lib/api/assistant/conversation")
    >();
  return {
    ...original,
    retryAgentMessage: vi.fn(async (_auth, { message }) => new Ok(message)),
  };
});

// An open Pod (the global group reads it) with a conversation started by a Pod member. The API key
// holds the global group, plus the Pod's member group when `keyIsPodMember` (a key scoped to the
// Pod, as `createApiKey` builds it).
async function setupPodConversation({
  keyIsPodMember,
}: {
  keyIsPodMember: boolean;
}) {
  const { workspace, globalGroup } = await createPublicApiMockRequest({
    method: "POST",
  });
  const podMember = await UserFactory.basic();
  await MembershipFactory.associate(workspace, podMember, { role: "user" });

  const pod = await SpaceFactory.project(workspace, podMember.id);
  await SpaceFactory.attachGroup(pod, globalGroup, "project_viewer");

  const podMemberGroups = await SpaceResource.listRegularAutoGroupsForSpaces(
    await Authenticator.internalAdminForWorkspace(workspace.sId),
    [pod],
    { includeEditors: false }
  );
  const key = await KeyFactory.regular(
    keyIsPodMember ? [globalGroup, ...podMemberGroups] : globalGroup
  );

  const podMemberAuth = await Authenticator.fromUserIdAndWorkspaceId(
    podMember.sId,
    workspace.sId
  );
  const conversation = await ConversationFactory.create(podMemberAuth, {
    agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
    requestedSpaceIds: [pod.id],
    spaceId: pod.id,
    messagesCreatedAt: [new Date()],
  });
  const agentMessage = conversation.content.flat().find(isAgentMessageType);
  assert(agentMessage, "Expected the conversation to have an agent message.");

  return {
    workspaceId: workspace.sId,
    keySecret: key.secret,
    conversationId: conversation.sId,
    messageId: agentMessage.sId,
  };
}

function retryRequest({
  workspaceId,
  keySecret,
  conversationId,
  messageId,
}: {
  workspaceId: string;
  keySecret: string;
  conversationId: string;
  messageId: string;
}) {
  return honoApp.request(
    `/api/v1/w/${workspaceId}/assistant/conversations/${conversationId}/messages/${messageId}/retry`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${keySecret}`,
        "content-type": "application/json",
      },
      body: "{}",
    }
  );
}

describe("POST /api/v1/w/:wId/assistant/conversations/:cId/messages/:mId/retry", () => {
  beforeEach(() => {
    vi.mocked(retryAgentMessage).mockClear();
  });

  it("rejects an API key that can read the Pod but is not a member", async () => {
    const request = await setupPodConversation({ keyIsPodMember: false });

    const response = await retryRequest(request);

    expect(response.status).toBe(403);
    expect(retryAgentMessage).not.toHaveBeenCalled();
  });

  it("retries for an API key that is a Pod member", async () => {
    const request = await setupPodConversation({ keyIsPodMember: true });

    const response = await retryRequest(request);

    expect(response.status).toBe(200);
    expect(retryAgentMessage).toHaveBeenCalledOnce();
  });
});
