import { retryAgentMessage } from "@app/lib/api/assistant/conversation";
import { Authenticator } from "@app/lib/auth";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import { isAgentMessageType } from "@app/types/assistant/conversation";
import { AUTO_MODEL_ID } from "@app/types/assistant/models/auto";
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

describe("POST /api/w/:wId/assistant/conversations/:cId/messages/:mId/retry", () => {
  let workspaceId: string;

  beforeEach(async () => {
    const { workspace } = await createPrivateApiMockRequest({
      role: "user",
      method: "POST",
    });
    workspaceId = workspace.sId;
  });

  function retryRequest(body?: string) {
    return honoApp.request(
      `/api/w/${workspaceId}/assistant/conversations/missing/messages/missing/retry`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      }
    );
  }

  it("rejects an empty JSON body", async () => {
    const response = await retryRequest();

    expect(response.status).toBe(400);
  });

  it("accepts an empty JSON object", async () => {
    const response = await retryRequest("{}");

    expect(response.status).toBe(404);
  });

  it("rejects malformed nonempty JSON", async () => {
    const response = await retryRequest("{");

    expect(response.status).toBe(400);
  });

  it.each(["null", JSON.stringify({ modelSelection: null })])(
    "rejects null JSON values",
    async (body) => {
      const response = await retryRequest(body);

      expect(response.status).toBe(400);
    }
  );

  it("rejects an invalid model selection", async () => {
    const response = await retryRequest(
      JSON.stringify({
        modelSelection: {
          providerId: "invalid-provider",
          modelId: "invalid-model",
        },
      })
    );

    expect(response.status).toBe(400);
  });

  it("accepts a valid model selection", async () => {
    const response = await retryRequest(
      JSON.stringify({
        modelSelection: {
          providerId: AUTO_MODEL_ID,
          modelId: AUTO_MODEL_ID,
          reasoningEffort: "none",
        },
      })
    );

    expect(response.status).toBe(404);
  });
});

describe("POST /api/w/:wId/assistant/conversations/:cId/messages/:mId/retry in a Pod", () => {
  beforeEach(() => {
    vi.mocked(retryAgentMessage).mockClear();
  });

  // An open Pod (the global group reads it) with a conversation started by a Pod member.
  // `sessionUserIsPodMember` makes the session user that Pod member; otherwise the session user
  // only reads the Pod.
  async function retryInPodConversation({
    sessionUserIsPodMember,
  }: {
    sessionUserIsPodMember: boolean;
  }) {
    const { workspace, user, globalGroup } = await createPrivateApiMockRequest({
      role: "user",
      method: "POST",
    });
    const podMember = sessionUserIsPodMember ? user : await UserFactory.basic();
    if (!sessionUserIsPodMember) {
      await MembershipFactory.associate(workspace, podMember, { role: "user" });
    }

    const pod = await SpaceFactory.project(workspace, podMember.id);
    await SpaceFactory.attachGroup(pod, globalGroup, "project_viewer");

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

    return honoApp.request(
      `/api/w/${workspace.sId}/assistant/conversations/${conversation.sId}/messages/${agentMessage.sId}/retry`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      }
    );
  }

  it("rejects a user who can read the Pod but is not a member", async () => {
    const response = await retryInPodConversation({
      sessionUserIsPodMember: false,
    });

    expect(response.status).toBe(403);
    expect(retryAgentMessage).not.toHaveBeenCalled();
  });

  it("retries for a Pod member", async () => {
    const response = await retryInPodConversation({
      sessionUserIsPodMember: true,
    });

    expect(response.status).toBe(200);
    expect(retryAgentMessage).toHaveBeenCalledOnce();
  });
});
