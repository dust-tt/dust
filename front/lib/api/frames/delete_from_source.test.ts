// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockEmitAuditLogEvent } = vi.hoisted(() => ({
  mockEmitAuditLogEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@app/lib/api/audit/workos_audit", async (importActual) => {
  const actual =
    await importActual<typeof import("@app/lib/api/audit/workos_audit")>();
  return { ...actual, emitAuditLogEvent: mockEmitAuditLogEvent };
});

vi.mock("@app/lib/api/frames/operation_lock", async (importActual) => {
  const actual =
    await importActual<typeof import("@app/lib/api/frames/operation_lock")>();
  return {
    ...actual,
    withFrameSourceAndPublishLock: async (
      _frameId: string,
      callback: () => Promise<unknown>
    ) => callback(),
  };
});

import { deleteFrameV2FromSource } from "@app/lib/api/frames/delete_from_source";
import { FileResource } from "@app/lib/resources/file_resource";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { fileStorageMock } from "@app/tests/utils/mocks/file_storage";
import { FRAME_MANIFEST_FILE } from "@app/types/api/frame_manifest";
import { getFrameBasePath } from "@app/types/api/frame_storage";
import { frameV2ContentType } from "@app/types/files";
import { getConversationFilesBasePath } from "@app/types/mount_path";
import assert from "assert";

async function setup() {
  const { authenticator: auth, workspace } = await createResourceTest({
    role: "admin",
  });
  const conversation = await ConversationFactory.create(auth, {
    agentConfigurationId: "test-agent",
    messagesCreatedAt: [],
  });
  const sourceDirectoryPath = `conversation-${conversation.sId}/Status`;
  const sourceGcsDirectoryPath = `${getConversationFilesBasePath({
    workspaceId: workspace.sId,
    conversationId: conversation.sId,
  })}Status`;
  const frame = await FileFactory.create(auth, null, {
    contentType: frameV2ContentType,
    fileName: FRAME_MANIFEST_FILE,
    fileSize: 100,
    status: "created",
    useCase: "conversation",
    useCaseMetadata: {
      activePublicationId: "publication-1",
      conversationId: conversation.sId,
    },
    mountFilePath: `${sourceGcsDirectoryPath}/${FRAME_MANIFEST_FILE}`,
  });
  await frame.markFrameV2AsReadyFromMount(auth);

  return {
    auth,
    conversation,
    frame,
    sourceDirectoryPath,
    sourceGcsDirectoryPath,
    workspace,
  };
}

beforeEach(() => {
  fileStorageMock.reset();
  mockEmitAuditLogEvent.mockReset();
  mockEmitAuditLogEvent.mockResolvedValue(undefined);
});

describe("deleteFrameV2FromSource", () => {
  it("deletes source, identity, runtime data, and sharing without a canonical original", async () => {
    const context = await setup();
    const deletedPrefixes: string[] = [];
    fileStorageMock.setFileExists((filePath) => filePath.endsWith("/"));
    fileStorageMock.setDeleteFails((filePath) =>
      filePath.endsWith("/original")
    );
    fileStorageMock.setOnDeleteByPrefix((prefix) =>
      deletedPrefixes.push(prefix)
    );

    const result = await deleteFrameV2FromSource(context.auth, {
      conversation: context.conversation,
      sourceDirectoryPath: context.sourceDirectoryPath,
    });

    assert(result.isOk());
    expect(result.value).toEqual({
      frameId: context.frame.sId,
      sourceDirectoryPath: context.sourceDirectoryPath,
    });
    await expect(
      FileResource.fetchById(context.auth, context.frame.sId)
    ).resolves.toBeNull();
    expect(deletedPrefixes).toContain(`${context.sourceGcsDirectoryPath}/`);
    expect(deletedPrefixes).toContain(
      getFrameBasePath({
        workspaceId: context.workspace.sId,
        frameId: context.frame.sId,
      })
    );
    expect(mockEmitAuditLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "frame.deleted",
        metadata: expect.objectContaining({
          active_publication_id: "publication-1",
          frame_id: context.frame.sId,
          source_path: context.sourceDirectoryPath,
        }),
      })
    );
  });

  it("keeps the Frame identity when source deletion fails", async () => {
    const context = await setup();
    fileStorageMock.setFileExists(
      (filePath) => filePath === context.sourceGcsDirectoryPath
    );
    fileStorageMock.setDeleteFails(
      (filePath) => filePath === context.sourceGcsDirectoryPath
    );

    const result = await deleteFrameV2FromSource(context.auth, {
      conversation: context.conversation,
      sourceDirectoryPath: context.sourceDirectoryPath,
    });

    assert(result.isErr());
    await expect(
      FileResource.fetchById(context.auth, context.frame.sId)
    ).resolves.not.toBeNull();
    expect(mockEmitAuditLogEvent).not.toHaveBeenCalled();
  });
});
