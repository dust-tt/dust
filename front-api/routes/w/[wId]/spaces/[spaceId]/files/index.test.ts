import { getPrivateUploadBucket } from "@app/lib/file_storage";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { honoApp } from "@front-api/app";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/lock", () => ({
  executeWithLock: vi.fn(async (_lockName: string, fn: () => unknown) => fn()),
}));

async function setupProject() {
  const { workspace, user } = await createPrivateApiMockRequest();
  const project = await SpaceFactory.project(workspace, user.id);
  return { workspace, user, project };
}

function makeGCSFile(
  workspaceId: string,
  podId: string,
  relPath: string,
  overrides: Partial<{ contentType: string; size: string; updated: string }> = {}
) {
  return {
    name: `w/${workspaceId}/pods/${podId}/files/${relPath}`,
    metadata: {
      contentType: overrides.contentType ?? "text/plain",
      size: overrides.size ?? "100",
      updated: overrides.updated ?? new Date().toISOString(),
    },
  };
}

describe("GET /api/w/:wId/spaces/:spaceId/files", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 with an empty list when no files exist", async () => {
    const { workspace, project } = await setupProject();

    vi.mocked(getPrivateUploadBucket).mockReturnValue({
      getAllFilesByPrefix: vi
        .fn()
        .mockResolvedValue({ files: [], pageFetchCount: 1 }),
    } as any);

    const res = await honoApp.request(
      `/api/w/${workspace.sId}/spaces/${project.sId}/files`
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.files).toEqual([]);
  });

  it("returns 200 and lists files with canonical scoped paths", async () => {
    const { workspace, project } = await setupProject();

    vi.mocked(getPrivateUploadBucket).mockReturnValue({
      getAllFilesByPrefix: vi.fn().mockResolvedValue({
        files: [
          makeGCSFile(workspace.sId, project.sId, "report.pdf", {
            contentType: "application/pdf",
            size: "2048",
          }),
          makeGCSFile(workspace.sId, project.sId, "data.csv", {
            contentType: "text/csv",
            size: "512",
          }),
        ],
        pageFetchCount: 1,
      }),
    } as any);

    const res = await honoApp.request(
      `/api/w/${workspace.sId}/spaces/${project.sId}/files`
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.files).toHaveLength(2);

    // Paths are canonical scoped paths, not legacy "pod/..." paths.
    expect(body.files[0].path).toBe(`pod-${project.sId}/report.pdf`);
    expect(body.files[0].contentType).toBe("application/pdf");
    expect(body.files[0].isDirectory).toBe(false);
    expect(body.files[0].fileId).toBeNull();

    expect(body.files[1].path).toBe(`pod-${project.sId}/data.csv`);
    expect(body.files[1].contentType).toBe("text/csv");
  });

  it("returns 200 and includes directory entries from GCS folder placeholders", async () => {
    const { workspace, project } = await setupProject();

    vi.mocked(getPrivateUploadBucket).mockReturnValue({
      getAllFilesByPrefix: vi.fn().mockResolvedValue({
        files: [
          // GCS folder placeholder (trailing slash)
          {
            name: `w/${workspace.sId}/pods/${project.sId}/files/reports/`,
            metadata: { updated: new Date().toISOString() },
          },
          makeGCSFile(workspace.sId, project.sId, "reports/q1.pdf"),
        ],
        pageFetchCount: 1,
      }),
    } as any);

    const res = await honoApp.request(
      `/api/w/${workspace.sId}/spaces/${project.sId}/files`
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    const dir = body.files.find(
      (f: { isDirectory: boolean }) => f.isDirectory
    );
    expect(dir).toBeDefined();
    expect(dir.path).toBe(`pod-${project.sId}/reports`);
    expect(dir.fileName).toBe("reports");
  });

});

describe("POST /api/w/:wId/spaces/:spaceId/files (create folder)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 201 after creating a folder", async () => {
    const { workspace, project } = await setupProject();

    // Mock the GCS save call used by createGCSMountDirectory.
    vi.mocked(getPrivateUploadBucket).mockReturnValue({
      file: vi.fn().mockReturnValue({
        save: vi.fn().mockResolvedValue(undefined),
        exists: vi.fn().mockResolvedValue([false]),
      }),
    } as any);

    const res = await honoApp.request(
      `/api/w/${workspace.sId}/spaces/${project.sId}/files`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folderName: "my-folder" }),
      }
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.folder).toBeDefined();
    expect(body.folder.isDirectory).toBe(true);
  });

  it("returns 400 for an invalid folder name", async () => {
    const { workspace, project } = await setupProject();

    const res = await honoApp.request(
      `/api/w/${workspace.sId}/spaces/${project.sId}/files`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folderName: "../escape" }),
      }
    );

    expect(res.status).toBe(400);
  });
});
