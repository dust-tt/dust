import { registerFrameV2FromSource } from "@app/lib/api/frames/register_from_source";
import { FileResource } from "@app/lib/resources/file_resource";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { fileStorageMock } from "@app/tests/utils/mocks/file_storage";
import { FRAME_MANIFEST_FILE } from "@app/types/api/frame_manifest";
import { getConversationFilesBasePath } from "@app/types/mount_path";
import assert from "assert";
import { beforeEach, describe, expect, it } from "vitest";

const manifest = JSON.stringify({
  version: 1,
  name: "Status",
  description: "Show the current status.",
});

async function setup() {
  const { authenticator: auth, workspace } = await createResourceTest({
    role: "admin",
  });
  const conversation = await ConversationFactory.create(auth, {
    agentConfigurationId: "test-agent",
    messagesCreatedAt: [],
  });
  const manifestPath = `conversation-${conversation.sId}/Status/${FRAME_MANIFEST_FILE}`;
  const mountFilePath = `${getConversationFilesBasePath({
    workspaceId: workspace.sId,
    conversationId: conversation.sId,
  })}Status/${FRAME_MANIFEST_FILE}`;
  fileStorageMock.setFileContent((path) =>
    path === mountFilePath ? manifest : null
  );

  return { auth, conversation, manifestPath, mountFilePath };
}

beforeEach(() => {
  fileStorageMock.reset();
});

describe("registerFrameV2FromSource", () => {
  it("registers one stable Frame identity for a manifest path", async () => {
    const { auth, conversation, manifestPath, mountFilePath } = await setup();
    // Registration adopts the mounted manifest; it must not try to copy a canonical upload.
    fileStorageMock.setCopyFileFails(() => true);

    const first = await registerFrameV2FromSource(auth, {
      conversation,
      manifestPath,
    });
    assert(first.isOk());
    expect(first.value.created).toBe(true);
    expect(first.value.frame.mountFilePath).toBe(mountFilePath);
    expect(first.value.frame.isReady).toBe(true);

    const second = await registerFrameV2FromSource(auth, {
      conversation,
      manifestPath,
    });
    assert(second.isOk());
    expect(second.value.created).toBe(false);
    expect(second.value.frame.sId).toBe(first.value.frame.sId);

    const files = await FileResource.fetchByMountFilePaths(auth, [
      mountFilePath,
    ]);
    expect(files).toHaveLength(1);
  });

  it("rejects an invalid manifest without creating a FileResource", async () => {
    const { auth, conversation, manifestPath, mountFilePath } = await setup();
    fileStorageMock.setFileContent((path) =>
      path === mountFilePath ? "not json" : null
    );

    const result = await registerFrameV2FromSource(auth, {
      conversation,
      manifestPath,
    });

    assert(result.isErr());
    expect(result.error.code).toBe("invalid_manifest");
    expect(
      await FileResource.fetchByMountFilePaths(auth, [mountFilePath])
    ).toEqual([]);
  });
});
