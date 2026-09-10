// @vitest-environment node

import { publishFrameV2FromSource } from "@app/lib/api/frames/publish_from_source";
import { FileResource } from "@app/lib/resources/file_resource";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { fileStorageMock } from "@app/tests/utils/mocks/file_storage";
import { FRAME_MANIFEST_FILE } from "@app/types/api/frame_manifest";
import {
  getFramePublicationsBasePath,
  getFramePublicationUiBundlePath,
} from "@app/types/api/frame_storage";
import { frameV2ContentType } from "@app/types/files";
import { getConversationFilesBasePath } from "@app/types/mount_path";
import type { LightWorkspaceType } from "@app/types/user";
import { honoApp } from "@front-api/app";
import assert from "assert";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Frame UI type checking needs a sandbox and the Viz runtime types artifact; neither exists here.
vi.mock("@app/lib/api/viz/frame_runtime_types", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@app/lib/api/viz/frame_runtime_types")
    >();
  return {
    ...actual,
    getFrameRuntimeTypesArtifact: vi.fn().mockResolvedValue(null),
  };
});

const manifest = JSON.stringify({
  version: 1,
  name: "Status",
  description: "Show the current status.",
});
const uiSource = "export default function Status() { return <p>Ready</p>; }";

function postEdit(
  workspace: LightWorkspaceType,
  fileId: string,
  body: unknown
) {
  return honoApp.request(`/api/w/${workspace.sId}/files/${fileId}/edit-text`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  fileStorageMock.reset();
});

describe("POST /api/w/:wId/files/:fileId/edit-text for Frames v2", () => {
  it("updates Frame v2 source and its active publication atomically", async () => {
    const { auth, workspace } = await createPrivateApiMockRequest({
      method: "POST",
      role: "admin",
    });
    await FeatureFlagFactory.basic(auth, "frames_v2");
    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: "test-agent",
      messagesCreatedAt: [],
    });
    const sourceDirectoryPath = `conversation-${conversation.sId}/Status`;
    const manifestPath = `${sourceDirectoryPath}/${FRAME_MANIFEST_FILE}`;
    const gcsSourceDirectoryPath = `${getConversationFilesBasePath({
      workspaceId: workspace.sId,
      conversationId: conversation.sId,
    })}Status`;
    const sourcePath = `${gcsSourceDirectoryPath}/index.tsx`;
    const frame = await FileFactory.create(auth, null, {
      contentType: frameV2ContentType,
      fileName: FRAME_MANIFEST_FILE,
      fileSize: Buffer.byteLength(manifest),
      status: "created",
      useCase: "conversation",
      useCaseMetadata: { conversationId: conversation.sId },
      mountFilePath: `${gcsSourceDirectoryPath}/${FRAME_MANIFEST_FILE}`,
    });

    const sourceByPath = new Map([
      [`${gcsSourceDirectoryPath}/${FRAME_MANIFEST_FILE}`, manifest],
      [sourcePath, uiSource],
    ]);
    fileStorageMock.setFilesByPrefix((prefix) =>
      prefix === `${gcsSourceDirectoryPath}/`
        ? [...sourceByPath.entries()].map(([name, content]) => ({
            name,
            metadata: {
              contentType: name.endsWith(".tsx")
                ? "text/typescript"
                : frameV2ContentType,
              size: String(Buffer.byteLength(content)),
            },
          }))
        : null
    );
    fileStorageMock.setFileContent(
      (filePath) => sourceByPath.get(filePath) ?? null
    );

    const firstPublication = await publishFrameV2FromSource(auth, {
      conversation,
      frame,
      manifestPath,
    });
    if (firstPublication.isErr()) {
      throw firstPublication.error;
    }

    const response = await postEdit(workspace, frame.sId, {
      conversationId: conversation.sId,
      oldText: "Ready",
      newText: "Done",
      source: "index.tsx:1:1",
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ success: true });
    expect(fileStorageMock.getObject(sourcePath)).toContain("<p>Done</p>");

    const reloaded = await FileResource.fetchById(auth, frame.sId);
    assert(reloaded?.isFrameV2);
    const activePublicationId = reloaded.useCaseMetadata?.activePublicationId;
    assert(activePublicationId);
    expect(activePublicationId).not.toBe(firstPublication.value.publicationId);

    const uiBundle = fileStorageMock.getObject(
      getFramePublicationUiBundlePath({
        workspaceId: workspace.sId,
        frameId: frame.sId,
        publicationId: activePublicationId,
      })
    );
    expect(uiBundle).toContain("Done");

    const failedResponse = await postEdit(workspace, frame.sId, {
      conversationId: conversation.sId,
      oldText: "Done",
      newText: "<",
      source: "index.tsx:1:1",
    });

    expect(failedResponse.status).toBe(400);
    expect(fileStorageMock.getObject(sourcePath)).toBe(
      uiSource.replace("Ready", "Done")
    );
    const reloadedAfterFailure = await FileResource.fetchById(auth, frame.sId);
    expect(reloadedAfterFailure?.useCaseMetadata?.activePublicationId).toBe(
      activePublicationId
    );

    fileStorageMock.setFileSaveFails((filePath) =>
      filePath.startsWith(
        getFramePublicationsBasePath({
          workspaceId: workspace.sId,
          frameId: frame.sId,
        })
      )
    );
    const storageFailureResponse = await postEdit(workspace, frame.sId, {
      conversationId: conversation.sId,
      oldText: "Done",
      newText: "Stored",
      source: "index.tsx:1:1",
    });

    expect(storageFailureResponse.status).toBe(500);
    expect(fileStorageMock.getObject(sourcePath)).toBe(
      uiSource.replace("Ready", "Done")
    );
    const reloadedAfterStorageFailure = await FileResource.fetchById(
      auth,
      frame.sId
    );
    expect(
      reloadedAfterStorageFailure?.useCaseMetadata?.activePublicationId
    ).toBe(activePublicationId);
  });

  it("rejects malformed source locations without changing source", async () => {
    const { auth, workspace } = await createPrivateApiMockRequest({
      method: "POST",
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
      fileSize: Buffer.byteLength(manifest),
      status: "created",
      useCase: "conversation",
      useCaseMetadata: { conversationId: conversation.sId },
      mountFilePath: `${getConversationFilesBasePath({
        workspaceId: workspace.sId,
        conversationId: conversation.sId,
      })}Status/${FRAME_MANIFEST_FILE}`,
    });

    const response = await postEdit(workspace, frame.sId, {
      conversationId: conversation.sId,
      oldText: "Ready",
      newText: "Done",
      source: "../other.tsx:1:1",
    });

    expect(response.status).toBe(400);
    expect(fileStorageMock.saveFileCalls).toHaveLength(0);
  });
});
