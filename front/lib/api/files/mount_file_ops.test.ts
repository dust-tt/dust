import * as gcsMountFiles from "@app/lib/api/files/gcs_mount/files";
import { moveMountFileWithinScope } from "@app/lib/api/files/mount_file_ops";
import { FileResource } from "@app/lib/resources/file_resource";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { Ok } from "@app/types/shared/result";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("moveMountFileWithinScope", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(gcsMountFiles, "moveFile").mockResolvedValue(new Ok(undefined));
    vi.spyOn(FileResource, "fetchByMountFilePaths").mockResolvedValue([]);
  });

  it("returns ok without calling moveFile when source and destination are the same", async () => {
    const { authenticator } = await createResourceTest({});
    const conversationId = "conv_test";
    const result = await moveMountFileWithinScope(
      authenticator,
      { useCase: "conversation", conversationId },
      {
        sourcePath: "reports/chart.png",
        destRelativeFilePath: "reports/chart.png",
      }
    );

    expect(result.isOk()).toBe(true);
    expect(gcsMountFiles.moveFile).not.toHaveBeenCalled();
    expect(FileResource.fetchByMountFilePaths).not.toHaveBeenCalled();
  });

  it("calls moveFile with the mount file path as source", async () => {
    const { authenticator } = await createResourceTest({});
    const workspaceId = authenticator.getNonNullableWorkspace().sId;
    const conversationId = "conv_test";
    const mountFilePath = `w/${workspaceId}/conversations/${conversationId}/files/reports/chart.png`;

    const result = await moveMountFileWithinScope(
      authenticator,
      { useCase: "conversation", conversationId },
      {
        sourcePath: `conversation/reports/chart.png`,
        destRelativeFilePath: "archive/chart.png",
      }
    );

    expect(result.isOk()).toBe(true);
    expect(gcsMountFiles.moveFile).toHaveBeenCalledWith(
      authenticator,
      expect.objectContaining({
        sourceGcsPath: mountFilePath,
        destRelativeFilePath: "archive/chart.png",
        destFileName: "chart.png",
      })
    );
  });
});
