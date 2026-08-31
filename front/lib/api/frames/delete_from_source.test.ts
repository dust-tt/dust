// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockEmitAuditLogEvent,
  mockWithFramePublishLock,
  mockWithFrameSourceLock,
} = vi.hoisted(() => ({
  mockEmitAuditLogEvent: vi.fn().mockResolvedValue(undefined),
  mockWithFramePublishLock: vi.fn(),
  mockWithFrameSourceLock: vi.fn(),
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
    withFramePublishLock: mockWithFramePublishLock,
    withFrameSourceLock: mockWithFrameSourceLock,
  };
});

import { deleteFrameV2FromSource } from "@app/lib/api/frames/delete_from_source";
import { Authenticator } from "@app/lib/auth";
import { FileResource } from "@app/lib/resources/file_resource";
import { ProjectMetadataResource } from "@app/lib/resources/project_metadata_resource";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { fileStorageMock } from "@app/tests/utils/mocks/file_storage";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { FRAME_MANIFEST_FILE } from "@app/types/api/frame_manifest";
import { getFrameBasePath } from "@app/types/api/frame_storage";
import { frameV2ContentType } from "@app/types/files";
import {
  getConversationFilesBasePath,
  getPodFilesBasePath,
} from "@app/types/mount_path";
import { DEFAULT_POD_FRAME_TAB_ICON } from "@app/types/pod_frame_tab";
import assert from "assert";

async function setup({ inPod = false }: { inPod?: boolean } = {}) {
  const {
    authenticator: initialAuth,
    globalGroup,
    user,
    workspace,
  } = await createResourceTest({
    role: "admin",
  });
  const pod = inPod ? await SpaceFactory.project(workspace, user.id) : null;
  if (pod) {
    await SpaceFactory.attachGroup(pod, globalGroup, "project_editor");
  }
  const auth = pod
    ? await Authenticator.fromUserIdAndWorkspaceId(user.sId, workspace.sId)
    : initialAuth;
  const conversation = await ConversationFactory.create(auth, {
    agentConfigurationId: "test-agent",
    messagesCreatedAt: [],
    spaceId: pod?.id,
  });
  const sourceDirectoryPath = pod
    ? `pod-${pod.sId}/Status`
    : `conversation-${conversation.sId}/Status`;
  const sourceGcsDirectoryPath = pod
    ? `${getPodFilesBasePath({
        workspaceId: workspace.sId,
        podId: pod.sId,
      })}Status`
    : `${getConversationFilesBasePath({
        workspaceId: workspace.sId,
        conversationId: conversation.sId,
      })}Status`;
  const frame = await FileFactory.create(auth, null, {
    contentType: frameV2ContentType,
    fileName: FRAME_MANIFEST_FILE,
    fileSize: 100,
    status: "created",
    useCase: pod ? "project_context" : "conversation",
    useCaseMetadata: pod
      ? { activePublicationId: "publication-1", spaceId: pod.sId }
      : {
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
    pod,
    sourceDirectoryPath,
    sourceGcsDirectoryPath,
    workspace,
  };
}

beforeEach(() => {
  fileStorageMock.reset();
  mockEmitAuditLogEvent.mockReset();
  mockEmitAuditLogEvent.mockResolvedValue(undefined);
  mockWithFramePublishLock.mockReset();
  mockWithFramePublishLock.mockImplementation(
    async (_frameId: string, callback: () => Promise<unknown>) => callback()
  );
  mockWithFrameSourceLock.mockReset();
  mockWithFrameSourceLock.mockImplementation(
    async (_frameId: string, callback: () => Promise<unknown>) => callback()
  );
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
    expect(mockWithFrameSourceLock).toHaveBeenCalledTimes(1);
    expect(mockWithFramePublishLock).toHaveBeenCalledTimes(1);
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

  it("removes Pod UI references through the package-aware deletion flow", async () => {
    const context = await setup({ inPod: true });
    assert(context.pod);
    const manifestPath = `${context.sourceDirectoryPath}/${FRAME_MANIFEST_FILE}`;
    await ProjectMetadataResource.makeNew(context.auth, context.pod, {
      description: null,
      pinnedFramePath: manifestPath,
      frameTabs: [
        {
          path: manifestPath,
          title: "Status",
          icon: DEFAULT_POD_FRAME_TAB_ICON,
        },
      ],
      tabsOrder: [manifestPath],
    });
    fileStorageMock.setFileExists((filePath) => filePath.endsWith("/"));

    const result = await deleteFrameV2FromSource(context.auth, {
      conversation: context.conversation,
      sourceDirectoryPath: context.sourceDirectoryPath,
    });

    assert(result.isOk(), result.isErr() ? result.error.message : undefined);
    const metadata = await ProjectMetadataResource.fetchBySpace(
      context.auth,
      context.pod
    );
    expect(metadata?.pinnedFramePath).toBeNull();
    expect(metadata?.frameTabs).toEqual([]);
    expect(metadata?.tabsOrder).not.toContain(manifestPath);
  });

  it("rejects direct Frames v2 resource deletion", async () => {
    const context = await setup();

    const result = await context.frame.delete(context.auth);

    expect(result.isErr() && result.error.message).toBe(
      "Frames v2 must be deleted through the package-aware Frame deletion flow."
    );
    await expect(
      FileResource.fetchById(context.auth, context.frame.sId)
    ).resolves.not.toBeNull();
    expect(mockWithFramePublishLock).not.toHaveBeenCalled();
  });
});
