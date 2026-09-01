// Frame publication runs esbuild, which requires the Node test environment.
// @vitest-environment node

import { cloneFrameV2Source } from "@app/lib/api/frames/clone_source";
import * as frameOperationLock from "@app/lib/api/frames/operation_lock";
import { setupFrameSourceStorageTest } from "@app/lib/api/frames/source_storage.test_utils";
import { getPrivateUploadBucket } from "@app/lib/file_storage";
import { LockAcquisitionTimeoutError } from "@app/lib/lock";
import { FileResource } from "@app/lib/resources/file_resource";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { fileStorageMock } from "@app/tests/utils/mocks/file_storage";
import { Err } from "@app/types/shared/result";
import assert from "assert";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockEmitAuditLogEvent } = vi.hoisted(() => ({
  mockEmitAuditLogEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@app/lib/api/audit/workos_audit", async (importActual) => {
  const actual =
    await importActual<typeof import("@app/lib/api/audit/workos_audit")>();
  return { ...actual, emitAuditLogEvent: mockEmitAuditLogEvent };
});

beforeEach(() => {
  fileStorageMock.reset();
  mockEmitAuditLogEvent.mockClear();
});

describe("cloneFrameV2Source", () => {
  it("copies into a fresh identity and activates its first publication", async () => {
    const sourceLock = vi.spyOn(frameOperationLock, "withFrameSourceLock");
    const workspaceLock = vi.spyOn(
      frameOperationLock,
      "withFrameWorkspaceSourceLock"
    );
    const c = await setupFrameSourceStorageTest();
    fileStorageMock.setObject(
      c.sourceObjects[0],
      JSON.stringify({ version: 1, name: "Status", description: "Status" })
    );
    fileStorageMock.setObject(
      c.sourceObjects[1],
      "export default function Status() { return null; }"
    );
    fileStorageMock.setFileContent(
      (filePath) => fileStorageMock.getObject(filePath) ?? null
    );
    const storage = getPrivateUploadBucket();
    vi.mocked(getPrivateUploadBucket).mockReturnValue(storage);
    vi.spyOn(storage, "copyFile").mockImplementation(
      async (source, destination) => {
        const content = fileStorageMock.getObject(source);
        assert(content !== undefined);
        fileStorageMock.setObject(destination, content);
        c.listedObjects.push(destination);
      }
    );

    const result = await cloneFrameV2Source(c.auth, {
      conversation: c.conversation,
      sourceDirectoryPath: c.sourceDirectoryPath,
      destinationDirectoryPath: `conversation-${c.conversation.sId}/Copy`,
    });

    assert(result.isOk(), result.isErr() ? result.error.message : "");
    expect(result.value.frameId).not.toBe(c.frame.sId);
    const clone = await FileResource.fetchById(c.auth, result.value.frameId);
    expect(clone?.useCaseMetadata?.activePublicationId).toBe(
      result.value.publicationId
    );
    expect(await FileResource.fetchById(c.auth, c.frame.sId)).toBeTruthy();
    expect(sourceLock).toHaveBeenCalledWith(c.frame.sId, expect.any(Function));
    expect(workspaceLock).toHaveBeenCalledWith(
      c.workspace.sId,
      expect.any(Function)
    );
    expect(mockEmitAuditLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "frame.cloned",
        metadata: expect.objectContaining({ source_frame_id: c.frame.sId }),
      })
    );
  });

  it("rejects a destination inside the source folder", async () => {
    const { authenticator: auth } = await createResourceTest({ role: "admin" });
    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: "test-agent",
      messagesCreatedAt: [],
    });

    const result = await cloneFrameV2Source(auth, {
      conversation,
      sourceDirectoryPath: `conversation-${conversation.sId}/Status`,
      destinationDirectoryPath: `conversation-${conversation.sId}/Status/Copy`,
    });

    expect(result.isErr() && result.error).toMatchObject({
      code: "invalid_source",
    });
  });

  it("does not copy when the source operation lock is busy", async () => {
    const c = await setupFrameSourceStorageTest();
    vi.spyOn(frameOperationLock, "withFrameSourceLock").mockResolvedValueOnce(
      new Err(
        new LockAcquisitionTimeoutError(
          frameOperationLock.getFrameSourceLockName(c.frame.sId)
        )
      )
    );
    const copyFile = vi.spyOn(getPrivateUploadBucket(), "copyFile");

    const result = await cloneFrameV2Source(c.auth, {
      conversation: c.conversation,
      sourceDirectoryPath: c.sourceDirectoryPath,
      destinationDirectoryPath: `conversation-${c.conversation.sId}/Copy`,
    });

    expect(result.isErr() && result.error).toMatchObject({ code: "conflict" });
    expect(copyFile).not.toHaveBeenCalled();
  });
});
