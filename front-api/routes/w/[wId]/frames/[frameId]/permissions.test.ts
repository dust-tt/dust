import { FramePublicationResource } from "@app/lib/resources/frame_publication_resource";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { FileFactory } from "@app/tests/utils/FileFactory";
import {
  createTestFrameFunction,
  createTestFramePublicationFunctions,
} from "@app/tests/utils/FrameFunctionFactory";
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
      canWriteFrameSource: true,
      isFrameAuthor: true,
      packageRoot: `conversation-${conversation.sId}/Admin`,
      hasFunctions: false,
      livePublicationId: null,
      livePublishedAt: null,
      draftPublicationId: null,
    });
  });

  it("reports the live and draft publications to an author", async () => {
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
        activePublicationId: "publication-live",
      },
      mountFilePath: `${getConversationFilesBasePath({
        workspaceId: workspace.sId,
        conversationId: conversation.sId,
      })}Admin/${FRAME_MANIFEST_FILE}`,
    });
    await frame.setLatestFramePublication({
      publicationId: "publication-draft",
    });

    const response = await honoApp.request(
      `/api/w/${workspace.sId}/frames/${frame.sId}/permissions`
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        isFrameAuthor: true,
        livePublicationId: "publication-live",
        livePublishedAt: null,
        draftPublicationId: "publication-draft",
      })
    );
  });

  async function setupWriterFrameWithFunctionsOnlyInDraft() {
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
        activePublicationId: "publication-live",
      },
      mountFilePath: `${getConversationFilesBasePath({
        workspaceId: workspace.sId,
        conversationId: conversation.sId,
      })}Admin/${FRAME_MANIFEST_FILE}`,
    });
    await createTestFramePublicationFunctions(auth, {
      frame,
      publicationId: "publication-draft",
      slug: "draft-only",
    });
    await frame.setLatestFramePublication({
      publicationId: "publication-draft",
    });
    return { frame, workspace };
  }

  it("reports the live publication's functions to a writer who does not ask for latest", async () => {
    const { frame, workspace } =
      await setupWriterFrameWithFunctionsOnlyInDraft();

    const response = await honoApp.request(
      `/api/w/${workspace.sId}/frames/${frame.sId}/permissions`
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        canWriteFrameSource: true,
        hasFunctions: false,
        draftPublicationId: "publication-draft",
      })
    );
  });

  it("reports the latest publication's functions to a writer who asks for latest", async () => {
    const { frame, workspace } =
      await setupWriterFrameWithFunctionsOnlyInDraft();

    const response = await honoApp.request(
      `/api/w/${workspace.sId}/frames/${frame.sId}/permissions?publication=latest`
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        canWriteFrameSource: true,
        hasFunctions: true,
        draftPublicationId: "publication-draft",
      })
    );
  });

  it("rejects an unknown publication", async () => {
    const { frame, workspace } =
      await setupWriterFrameWithFunctionsOnlyInDraft();

    const response = await honoApp.request(
      `/api/w/${workspace.sId}/frames/${frame.sId}/permissions?publication=draft`
    );

    expect(response.status).toBe(400);
  });

  it("reports the publication time of the live publication", async () => {
    const { auth, workspace } = await createPrivateApiMockRequest({
      role: "admin",
    });
    await FeatureFlagFactory.basic(auth, "frames_v2");
    const space = await SpaceFactory.project(workspace);
    const { frame } = await createTestFrameFunction(auth, { space });
    const publication = await FramePublicationResource.makeNew(auth, {
      frame,
      publicationId: "publication-1",
    });

    const response = await honoApp.request(
      `/api/w/${workspace.sId}/frames/${frame.sId}/permissions`
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        livePublishedAt: publication.createdAt.getTime(),
      })
    );
  });

  it("does not report the draft to a caller who cannot edit the Frame, even when asked for latest", async () => {
    const { auth, workspace } = await createPrivateApiMockRequest({
      role: "admin",
    });
    await FeatureFlagFactory.basic(auth, "frames_v2");
    const space = await SpaceFactory.project(workspace);
    const { frame } = await createTestFrameFunction(auth, { space });
    await frame.setLatestFramePublication({
      publicationId: "publication-draft",
    });

    const response = await honoApp.request(
      `/api/w/${workspace.sId}/frames/${frame.sId}/permissions?publication=latest`
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        draftPublicationId: null,
        // The draft declares no function: a non-writer asking for latest is answered for live.
        hasFunctions: true,
        livePublicationId: "publication-1",
      })
    );
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
      canWriteFrameSource: false,
      isFrameAuthor: false,
      packageRoot: null,
      hasFunctions: false,
      livePublicationId: null,
      livePublishedAt: null,
      draftPublicationId: null,
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
