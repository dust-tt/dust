import { deleteFramePlugin } from "@app/lib/api/poke/plugins/files/delete_frame";
import { FileResource } from "@app/lib/resources/file_resource";
import { ProjectMetadataResource } from "@app/lib/resources/project_metadata_resource";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { fileStorageMock } from "@app/tests/utils/mocks/file_storage";
import { ProjectFileFactory } from "@app/tests/utils/ProjectFileFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { frameContentType, frameV2ContentType } from "@app/types/files";
import { DEFAULT_POD_FILE_TAB_ICON } from "@app/types/pod_file_tab";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockEmitAuditLogEvent } = vi.hoisted(() => ({
  mockEmitAuditLogEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@app/lib/api/audit/workos_audit", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@app/lib/api/audit/workos_audit")>();
  return { ...actual, emitAuditLogEvent: mockEmitAuditLogEvent };
});

beforeEach(() => {
  vi.restoreAllMocks();
  fileStorageMock.reset();
  mockEmitAuditLogEvent.mockReset();
  mockEmitAuditLogEvent.mockResolvedValue(undefined);
});

describe("deleteFramePlugin", () => {
  it("deletes a Pod Frame and removes its banner and tab references", async () => {
    const {
      authenticator: auth,
      user,
      workspace,
    } = await createResourceTest({
      role: "admin",
    });
    const pod = await SpaceFactory.project(workspace, user.id);
    const frame = await ProjectFileFactory.create(auth, user, pod, {
      contentType: frameContentType,
      fileName: "Dashboard.tsx",
      fileSize: 100,
      status: "ready",
    });
    const framePath = frame.toScopedPath(auth);
    expect(framePath).not.toBeNull();
    if (!framePath) {
      throw new Error("Expected a scoped Pod Frame path.");
    }

    await ProjectMetadataResource.makeNew(auth, pod, {
      description: null,
      pinnedFramePath: framePath,
      frameTabs: [
        {
          path: framePath,
          title: "Dashboard",
          icon: DEFAULT_POD_FILE_TAB_ICON,
        },
      ],
      tabsOrder: [framePath],
    });

    const result = await deleteFramePlugin.execute(auth, frame, {
      confirmation: "DELETE",
    });

    expect(result.isOk()).toBe(true);
    await expect(FileResource.fetchById(auth, frame.sId)).resolves.toBeNull();

    const metadata = await ProjectMetadataResource.fetchBySpace(auth, pod);
    expect(metadata?.pinnedFramePath).toBeNull();
    expect(metadata?.frameTabs).toEqual([]);
    expect(metadata?.tabsOrder).not.toContain(framePath);
    expect(mockEmitAuditLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "frame.deleted_admin",
        metadata: {
          frame_name: "Dashboard.tsx",
          source: "poke",
        },
      })
    );
  });

  it("leaves Frames v2 deletion to the package-aware flow", async () => {
    const {
      authenticator: auth,
      user,
      workspace,
    } = await createResourceTest({ role: "admin" });
    const pod = await SpaceFactory.project(workspace, user.id);
    const frame = await ProjectFileFactory.create(auth, user, pod, {
      contentType: frameV2ContentType,
      fileName: "manifest.json",
      fileSize: 100,
      status: "ready",
    });

    expect(deleteFramePlugin.isApplicableTo(auth, frame)).toBe(false);
    const result = await deleteFramePlugin.execute(auth, frame, {
      confirmation: "DELETE",
    });

    expect(result.isErr()).toBe(true);
    await expect(
      FileResource.fetchById(auth, frame.sId)
    ).resolves.not.toBeNull();
    expect(mockEmitAuditLogEvent).not.toHaveBeenCalled();
  });
});
