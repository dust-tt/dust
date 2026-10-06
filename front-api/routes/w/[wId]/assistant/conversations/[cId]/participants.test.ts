import { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

async function setupConversationOwnedByAnotherMember() {
  const { workspace, auth, user, globalSpace } =
    await createPrivateApiMockRequest({
      role: "user",
      method: "POST",
    });

  const otherUser = await UserFactory.basic();
  await MembershipFactory.associate(workspace, otherUser, { role: "user" });
  const otherAuth = await Authenticator.fromUserIdAndWorkspaceId(
    otherUser.sId,
    workspace.sId
  );

  const conversation = await ConversationFactory.create(otherAuth, {
    agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
    requestedSpaceIds: [globalSpace.id],
    messagesCreatedAt: [new Date()],
  });

  return { workspace, auth, user, conversation };
}

function postParticipant(workspace: { sId: string }, conversationId: string) {
  return honoApp.request(
    `/api/w/${workspace.sId}/assistant/conversations/${conversationId}/participants`,
    { method: "POST" }
  );
}

describe("POST /api/w/:wId/assistant/conversations/:cId/participants", () => {
  it("adds a non-participant to the conversation", async () => {
    const { workspace, auth, user, conversation } =
      await setupConversationOwnedByAnotherMember();
    expect(
      await ConversationResource.isConversationParticipant(auth, {
        conversation,
        user,
      })
    ).toBe(false);

    const response = await postParticipant(workspace, conversation.sId);

    expect(response.status).toBe(201);
    expect(
      await ConversationResource.isConversationParticipant(auth, {
        conversation,
        user,
      })
    ).toBe(true);
  });

  it("rejects a caller who is already a participant", async () => {
    const { workspace, auth, user, conversation } =
      await setupConversationOwnedByAnotherMember();
    await ConversationResource.upsertParticipation(auth, {
      conversation,
      user: user.toJSON(),
      action: "posted",
    });

    const response = await postParticipant(workspace, conversation.sId);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.type).toBe("user_already_participant");
  });
});
