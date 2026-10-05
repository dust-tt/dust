import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createTestFrameFunction } from "@app/tests/utils/FrameFunctionFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { FRAME_MANIFEST_FILE } from "@app/types/api/frame_manifest";
import { frameContentType, frameV2ContentType } from "@app/types/files";
import { getConversationFilesBasePath } from "@app/types/mount_path";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

describe("GET /api/w/:wId/frames/:frameId/permissions", () => {
  it("returns whether the current user can modify the Frame v2 source", async () => {
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
      useCaseMetadata: { conversationId: conversation.sId },
      mountFilePath: `${getConversationFilesBasePath({
        workspaceId: workspace.sId,
        conversationId: conversation.sId,
      })}Admin/${FRAME_MANIFEST_FILE}`,
    });

    const response = await honoApp.request(
      `/api/w/${workspace.sId}/frames/${frame.sId}/permissions`
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      isFrameAuthor: true,
      packageRoot: `conversation-${conversation.sId}/Admin`,
      hasFunctions: false,
    });
  });

  it("fails closed when the Frame v2 source has no writable scoped path", async () => {
    const { auth, workspace } = await createPrivateApiMockRequest({
      role: "admin",
    });
    await FeatureFlagFactory.basic(auth, "frames_v2");
    const frame = await FileFactory.create(auth, null, {
      contentType: frameV2ContentType,
      fileName: FRAME_MANIFEST_FILE,
      fileSize: 10,
      status: "ready",
      useCase: "conversation",
    });

    const response = await honoApp.request(
      `/api/w/${workspace.sId}/frames/${frame.sId}/permissions`
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      isFrameAuthor: false,
      packageRoot: null,
      hasFunctions: false,
    });
  });

  it("reports the functions declared by the Frame's active publication", async () => {
    const { auth, workspace } = await createPrivateApiMockRequest({
      role: "admin",
    });
    await FeatureFlagFactory.basic(auth, "frames_v2");
    const space = await SpaceFactory.project(workspace);
    const { frame } = await createTestFrameFunction(auth, { space });

    const response = await honoApp.request(
      `/api/w/${workspace.sId}/frames/${frame.sId}/permissions`
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({ hasFunctions: true })
    );
  });

  it("does not expose the permissions contract for a legacy Frame", async () => {
    const { auth, workspace } = await createPrivateApiMockRequest({
      role: "admin",
    });
    await FeatureFlagFactory.basic(auth, "frames_v2");
    const frame = await FileFactory.create(auth, null, {
      contentType: frameContentType,
      fileName: "legacy.tsx",
      fileSize: 10,
      status: "ready",
      useCase: "conversation",
    });

    const response = await honoApp.request(
      `/api/w/${workspace.sId}/frames/${frame.sId}/permissions`
    );

    expect(response.status).toBe(404);
  });
});
