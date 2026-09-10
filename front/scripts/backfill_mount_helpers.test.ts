import { FileResource } from "@app/lib/resources/file_resource";
import { FileModel } from "@app/lib/resources/storage/models/files";
import { ensureMountFilePath } from "@app/scripts/backfill_mount_helpers";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { fileStorageMock } from "@app/tests/utils/mocks/file_storage";
import { frameContentType } from "@app/types/files";
import { disambiguateFileName } from "@app/types/mount_path";
import { assert, describe, expect, it } from "vitest";

describe("mount path backfills", () => {
  it.each([
    {
      useCase: "conversation",
      useCaseMetadata: { conversationId: "conv-backfill" },
      contentType: frameContentType,
      fileName: "frame.html",
      relativePath: "conversations/conv-backfill/files/frame.html",
    },
    {
      useCase: "project_context",
      useCaseMetadata: { spaceId: "pod-backfill" },
      contentType: "application/pdf",
      fileName: "report.pdf",
      relativePath: "pods/pod-backfill/files/report.pdf",
    },
  ] as const)("mounts an already-ready $useCase file without changing metadata", async (fixture) => {
    const { authenticator: auth, workspace } = await createResourceTest({
      role: "admin",
    });
    const file = await FileFactory.create(auth, null, {
      ...fixture,
      fileSize: 100,
      status: "created",
    });
    // Model access creates the historical state: ready, but predating automatic mount resolution.
    await FileModel.update(
      { status: "ready" },
      { where: { id: file.id, workspaceId: workspace.id } }
    );
    const legacyFile = await FileResource.fetchById(auth, file.sId);
    assert(legacyFile);
    fileStorageMock.setFileContent((path) =>
      path.endsWith("/processed") ? "processed" : "original"
    );

    await ensureMountFilePath(auth, legacyFile);

    const mounted = await FileResource.fetchById(auth, file.sId);
    assert(mounted);
    expect(mounted.status).toBe("ready");
    expect(mounted.useCaseMetadata).toEqual(fixture.useCaseMetadata);
    expect(mounted.mountFilePath).toBe(
      `w/${workspace.sId}/${fixture.relativePath}`
    );
    assert(mounted.mountFilePath);
    expect(fileStorageMock.getObject(mounted.mountFilePath)).toBe("original");
    const processedPath = mounted.getProcessedMountFilePath();
    if (fixture.useCase === "project_context") {
      assert(processedPath);
      expect(fileStorageMock.getObject(processedPath)).toBe("processed");
    } else {
      expect(processedPath).toBeNull();
    }
  });

  it("preserves a colliding file and retries a failed copy at the claimed path", async () => {
    const { authenticator: auth, workspace } = await createResourceTest({
      role: "admin",
    });
    const desiredPath = `w/${workspace.sId}/conversations/conv-backfill/files/frame.html`;
    const attributes = {
      contentType: frameContentType,
      fileName: "frame.html",
      fileSize: 100,
      useCase: "conversation",
      useCaseMetadata: { conversationId: "conv-backfill" },
      status: "created",
    } as const;
    await FileFactory.create(auth, null, {
      ...attributes,
      mountFilePath: desiredPath,
    });
    const file = await FileFactory.create(auth, null, attributes);
    fileStorageMock.setObject(desiredPath, "existing frame");
    fileStorageMock.setFileContent(() => "backfilled frame");
    fileStorageMock.setCopyFileFails(() => true);

    await expect(ensureMountFilePath(auth, file)).rejects.toThrow(
      "Simulated GCS copy failure"
    );
    const claimed = await FileResource.fetchById(auth, file.sId);
    assert(claimed);
    expect(claimed.mountFilePath).toBe(
      `w/${workspace.sId}/conversations/conv-backfill/files/${disambiguateFileName(file)}`
    );
    fileStorageMock.setCopyFileFails(() => false);
    await ensureMountFilePath(auth, claimed);

    assert(claimed.mountFilePath);
    expect(fileStorageMock.getObject(claimed.mountFilePath)).toBe(
      "backfilled frame"
    );
    expect(fileStorageMock.getObject(desiredPath)).toBe("existing frame");
  });
});
