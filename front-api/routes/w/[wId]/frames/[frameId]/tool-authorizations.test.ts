import { FramePublicationResource } from "@app/lib/resources/frame_publication_resource";
import { FrameToolAuthorizationResource } from "@app/lib/resources/frame_tool_authorization_resource";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { FRAME_MANIFEST_FILE } from "@app/types/api/frame_manifest";
import { frameV2ContentType } from "@app/types/files";
import { getConversationFilesBasePath } from "@app/types/mount_path";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

describe("POST /api/w/:wId/frames/:frameId/tool-authorizations", () => {
  it("stores consent when authorizedTools match the active publication", async () => {
    const { auth, workspace, user } = await createPrivateApiMockRequest({
      role: "admin",
    });
    await FeatureFlagFactory.basic(auth, "frames_v2");
    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: "test-agent",
      messagesCreatedAt: [],
    });
    const frame = await FileFactory.create(auth, null, {
      contentType: frameV2ContentType,
      fileName: FRAME_MANIFEST_FILE,
      fileSize: 10,
      status: "ready",
      useCase: "conversation",
      useCaseMetadata: {
        conversationId: conversation.sId,
        activePublicationId: "pub_1",
      },
      mountFilePath: `${getConversationFilesBasePath({
        workspaceId: workspace.sId,
        conversationId: conversation.sId,
      })}Admin/${FRAME_MANIFEST_FILE}`,
    });
    await FramePublicationResource.makeNew(auth, {
      frame,
      publicationId: "pub_1",
      requiredTools: [["slack", "post_message"]],
    });

    const response = await honoApp.request(
      `/api/w/${workspace.sId}/frames/${frame.sId}/tool-authorizations`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          authorizedTools: [["slack", "post_message"]],
        }),
      }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      authorizedTools: [["slack", "post_message"]],
    });

    const stored = await FrameToolAuthorizationResource.fetchForUserAndFrame(
      auth,
      frame
    );
    expect(stored?.authorizedTools).toEqual([["slack", "post_message"]]);
    expect(stored?.userId).toBe(user.id);

    const permissions = await honoApp.request(
      `/api/w/${workspace.sId}/frames/${frame.sId}/permissions`
    );
    expect(permissions.status).toBe(200);
    await expect(permissions.json()).resolves.toEqual(
      expect.objectContaining({
        requiredTools: [["slack", "post_message"]],
        isLastPublisher: true,
        hasAuthorizedRequiredTools: true,
      })
    );
  });

  it("rejects authorizedTools that do not match the active publication", async () => {
    const { auth, workspace } = await createPrivateApiMockRequest({
      role: "admin",
    });
    await FeatureFlagFactory.basic(auth, "frames_v2");
    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: "test-agent",
      messagesCreatedAt: [],
    });
    const frame = await FileFactory.create(auth, null, {
      contentType: frameV2ContentType,
      fileName: FRAME_MANIFEST_FILE,
      fileSize: 10,
      status: "ready",
      useCase: "conversation",
      useCaseMetadata: {
        conversationId: conversation.sId,
        activePublicationId: "pub_2",
      },
      mountFilePath: `${getConversationFilesBasePath({
        workspaceId: workspace.sId,
        conversationId: conversation.sId,
      })}Admin/${FRAME_MANIFEST_FILE}`,
    });
    await FramePublicationResource.makeNew(auth, {
      frame,
      publicationId: "pub_2",
      requiredTools: [["slack", "post_message"]],
    });

    const response = await honoApp.request(
      `/api/w/${workspace.sId}/frames/${frame.sId}/tool-authorizations`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          authorizedTools: [["github", "create_issue"]],
        }),
      }
    );

    expect(response.status).toBe(400);
  });
});
