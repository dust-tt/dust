import { Authenticator } from "@app/lib/auth";
import { FileResource } from "@app/lib/resources/file_resource";
import * as wakeUpClient from "@app/temporal/triggers/wakeup_client";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { WakeUpFactory } from "@app/tests/utils/WakeUpFactory";
import { Ok } from "@app/types/shared/result";
import { honoApp } from "@front-api/app";
import assert from "assert";
import { describe, expect, it, vi } from "vitest";

function postContentFragmentAsBob(
  workspace: { sId: string },
  cId: string,
  fileId: string
) {
  return honoApp.request(
    `/api/w/${workspace.sId}/assistant/conversations/${cId}/content_fragment`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "notes.txt",
        fileId,
        context: { profilePictureUrl: null },
      }),
    }
  );
}

async function setup() {
  const {
    auth: adminAuth,
    user: alice,
    workspace,
  } = await createPrivateApiMockRequest({ role: "admin" });
  const restrictedSpace = await SpaceFactory.regular(workspace);
  const addMembersRes = await restrictedSpace.addMembers(adminAuth, {
    userIds: [alice.sId],
  });
  assert(addMembersRes.isOk(), "Failed to add Alice to the restricted space");
  const aliceAuth = await Authenticator.fromUserIdAndWorkspaceId(
    alice.sId,
    workspace.sId
  );
  const aliceConversation = await ConversationFactory.create(aliceAuth, {
    agentConfigurationId: "test-agent",
    messagesCreatedAt: [],
    requestedSpaceIds: [restrictedSpace.id],
  });
  const aliceAttachedFile = await FileFactory.create(aliceAuth, alice, {
    contentType: "text/plain",
    fileName: "notes.txt",
    fileSize: 1024,
    status: "ready",
    useCase: "conversation",
    useCaseMetadata: { conversationId: aliceConversation.sId },
  });
  const aliceUnattachedFile = await FileFactory.create(aliceAuth, alice, {
    contentType: "text/plain",
    fileName: "draft.txt",
    fileSize: 1024,
    status: "ready",
    useCase: "conversation",
    useCaseMetadata: null,
  });

  const { auth: bobAuth, user: bob } = await createPrivateApiMockRequest({
    workspace,
    role: "user",
  });
  const bobConversation = await ConversationFactory.create(bobAuth, {
    agentConfigurationId: "test-agent",
    messagesCreatedAt: [],
  });
  const bobUnattachedFile = await FileFactory.create(bobAuth, bob, {
    contentType: "text/plain",
    fileName: "notes.txt",
    fileSize: 1024,
    status: "ready",
    useCase: "conversation",
    useCaseMetadata: null,
  });

  return {
    workspace,
    aliceAuth,
    aliceAttachedFile,
    aliceUnattachedFile,
    bobAuth,
    bobConversation,
    bobUnattachedFile,
  };
}

describe("POST /api/w/:wId/assistant/conversations/:cId/content_fragment", () => {
  it("attaches a file the caller uploaded and binds it to the conversation", async () => {
    const { workspace, bobAuth, bobConversation, bobUnattachedFile } =
      await setup();

    const response = await postContentFragmentAsBob(
      workspace,
      bobConversation.sId,
      bobUnattachedFile.sId
    );

    expect(response.status).toBe(200);
    const boundFile = await FileResource.fetchById(
      bobAuth,
      bobUnattachedFile.sId
    );
    expect(boundFile?.useCaseMetadata?.conversationId).toBe(
      bobConversation.sId
    );
  });

  it("rejects a file from a conversation the caller cannot access", async () => {
    const { workspace, aliceAttachedFile, bobConversation } = await setup();

    const response = await postContentFragmentAsBob(
      workspace,
      bobConversation.sId,
      aliceAttachedFile.sId
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error.message).toBe("File not found.");
  });

  it("rejects another user's unattached file and leaves it unattached", async () => {
    const { workspace, aliceAuth, aliceUnattachedFile, bobConversation } =
      await setup();

    const response = await postContentFragmentAsBob(
      workspace,
      bobConversation.sId,
      aliceUnattachedFile.sId
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error.message).toBe("File not found.");
    const file = await FileResource.fetchById(
      aliceAuth,
      aliceUnattachedFile.sId
    );
    expect(file?.useCaseMetadata?.conversationId).toBeUndefined();
  });

  it("returns 409 without attaching the file when another user owns an active wake-up", async () => {
    vi.spyOn(
      wakeUpClient,
      "launchOrScheduleWakeUpTemporalWorkflow"
    ).mockResolvedValue(new Ok(undefined));
    const { workspace, aliceAuth, bobAuth, bobUnattachedFile } = await setup();

    const agent = await AgentConfigurationFactory.createTestAgent(aliceAuth);
    const aliceConversation = await ConversationFactory.create(aliceAuth, {
      agentConfigurationId: agent.sId,
      messagesCreatedAt: [],
    });
    await WakeUpFactory.cron(aliceAuth, aliceConversation, agent);

    const response = await postContentFragmentAsBob(
      workspace,
      aliceConversation.sId,
      bobUnattachedFile.sId
    );

    expect(response.status).toBe(409);
    expect((await response.json()).error.type).toBe("conversation_locked");
    const file = await FileResource.fetchById(bobAuth, bobUnattachedFile.sId);
    expect(file?.useCaseMetadata?.conversationId).toBeUndefined();
  });
});
