import * as projectsContext from "@app/lib/api/projects/context";
import { getPrivateUploadBucket } from "@app/lib/file_storage";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { Err, Ok } from "@app/types/shared/result";
import { honoApp } from "@front-api/app";
import { PassThrough } from "stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

async function setupProject() {
  const { workspace, user } = await createPrivateApiMockRequest();
  const project = await SpaceFactory.project(workspace, user.id);
  return { workspace, user, project };
}

function fileRequest(
  workspace: { sId: string },
  spaceId: string,
  relSegments: string[],
  options: { method: string; body?: Record<string, unknown> } = {
    method: "GET",
  }
) {
  // Build the path joined as one fully-encoded string so that ".." segments
  // and slashes survive URL normalization (e.g. for path traversal cases).
  // The handler decodes the resulting `rel` param via the validated params.
  const joined = relSegments.join("/");
  const encoded = encodeURIComponent(joined);
  const url = `/api/w/${workspace.sId}/spaces/${spaceId}/files/${encoded}`;
  return honoApp.request(url, {
    method: options.method,
    headers: options.body ? { "Content-Type": "application/json" } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
}

describe("/api/w/:wId/spaces/:spaceId/files/<rel>", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("GET", () => {
    beforeEach(() => {
      vi.mocked(getPrivateUploadBucket).mockReturnValue({
        getFileContentType: vi.fn().mockResolvedValue(new Ok("text/plain")),
        file: vi.fn(() => ({
          createReadStream: vi
            .fn()
            .mockReturnValue(
              Object.assign(new PassThrough(), { pipe: vi.fn() })
            ),
        })),
      } as unknown as ReturnType<typeof getPrivateUploadBucket>);
    });

    it("returns 200 and streams a file for a valid scoped path", async () => {
      const { workspace, project } = await setupProject();
      const response = await fileRequest(
        workspace,
        project.sId,
        ["pod", "report.pdf"],
        { method: "GET" }
      );
      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toBe("text/plain");
    });

    it("returns 400 when path lacks the pod/ prefix", async () => {
      const { workspace, project } = await setupProject();
      const response = await fileRequest(workspace, project.sId, [
        "report.pdf",
      ]);
      expect(response.status).toBe(400);
      expect((await response.json()).error.message).toMatch(/scope prefix/i);
    });

    it("returns 403 for path traversal attempts", async () => {
      const { workspace, project } = await setupProject();
      const response = await fileRequest(workspace, project.sId, [
        "pod",
        "..",
        "..",
        "etc",
        "passwd",
      ]);
      expect(response.status).toBe(403);
    });

    it("returns 404 when the file does not exist in GCS", async () => {
      vi.mocked(getPrivateUploadBucket).mockReturnValue({
        getFileContentType: vi
          .fn()
          .mockResolvedValue(new Err(new Error("not found"))),
      } as unknown as ReturnType<typeof getPrivateUploadBucket>);

      const { workspace, project } = await setupProject();
      const response = await fileRequest(workspace, project.sId, [
        "pod",
        "missing.txt",
      ]);
      expect(response.status).toBe(404);
      expect((await response.json()).error.type).toBe("file_not_found");
    });
  });

  describe("PATCH", () => {
    beforeEach(() => {
      vi.spyOn(projectsContext, "renameProjectFile").mockResolvedValue(
        new Ok(undefined)
      );
    });

    it("returns 200 and calls renameProjectFile with the right args", async () => {
      const { workspace, project } = await setupProject();
      const response = await fileRequest(
        workspace,
        project.sId,
        ["pod", "old.txt"],
        { method: "PATCH", body: { fileName: "new.txt" } }
      );
      expect(response.status).toBe(200);
      expect(projectsContext.renameProjectFile).toHaveBeenCalledWith(
        expect.anything(),
        {
          space: expect.objectContaining({ sId: project.sId }),
          relativeFilePath: "old.txt",
          newFileName: "new.txt",
        }
      );
    });

    it("returns 400 when fileName is missing", async () => {
      const { workspace, project } = await setupProject();
      const response = await fileRequest(
        workspace,
        project.sId,
        ["pod", "file.txt"],
        { method: "PATCH", body: {} }
      );
      expect(response.status).toBe(400);
    });

    it("returns 400 when fileName contains a slash", async () => {
      const { workspace, project } = await setupProject();
      const response = await fileRequest(
        workspace,
        project.sId,
        ["pod", "file.txt"],
        { method: "PATCH", body: { fileName: "sub/name.txt" } }
      );
      expect(response.status).toBe(400);
    });

    it("returns 400 when path lacks the pod/ prefix", async () => {
      const { workspace, project } = await setupProject();
      const response = await fileRequest(workspace, project.sId, ["file.txt"], {
        method: "PATCH",
        body: { fileName: "new.txt" },
      });
      expect(response.status).toBe(400);
    });

    it("returns 403 for path traversal attempts", async () => {
      const { workspace, project } = await setupProject();
      const response = await fileRequest(
        workspace,
        project.sId,
        ["pod", "..", "evil.txt"],
        { method: "PATCH", body: { fileName: "new.txt" } }
      );
      expect(response.status).toBe(403);
    });

    it("returns 403 when the user lacks write permission", async () => {
      vi.spyOn(SpaceResource.prototype, "canWrite").mockReturnValue(false);
      const { workspace, project } = await setupProject();
      const response = await fileRequest(
        workspace,
        project.sId,
        ["pod", "file.txt"],
        { method: "PATCH", body: { fileName: "new.txt" } }
      );
      expect(response.status).toBe(403);
    });

    it("returns 500 when renameProjectFile fails", async () => {
      vi.spyOn(projectsContext, "renameProjectFile").mockResolvedValue(
        new Err(new Error("GCS error"))
      );
      const { workspace, project } = await setupProject();
      const response = await fileRequest(
        workspace,
        project.sId,
        ["pod", "file.txt"],
        { method: "PATCH", body: { fileName: "new.txt" } }
      );
      expect(response.status).toBe(500);
    });
  });

  describe("DELETE", () => {
    beforeEach(() => {
      vi.spyOn(projectsContext, "deleteProjectFile").mockResolvedValue(
        new Ok(undefined)
      );
    });

    it("returns 200 and calls deleteProjectFile with the right args", async () => {
      const { workspace, project } = await setupProject();
      const response = await fileRequest(
        workspace,
        project.sId,
        ["pod", "file.txt"],
        { method: "DELETE" }
      );
      expect(response.status).toBe(200);
      expect(projectsContext.deleteProjectFile).toHaveBeenCalledWith(
        expect.anything(),
        {
          space: expect.objectContaining({ sId: project.sId }),
          relativeFilePath: "file.txt",
        }
      );
    });

    it("returns 400 when path lacks the pod/ prefix", async () => {
      const { workspace, project } = await setupProject();
      const response = await fileRequest(workspace, project.sId, ["file.txt"], {
        method: "DELETE",
      });
      expect(response.status).toBe(400);
    });

    it("returns 403 for path traversal attempts", async () => {
      const { workspace, project } = await setupProject();
      const response = await fileRequest(
        workspace,
        project.sId,
        ["pod", "..", "evil.txt"],
        { method: "DELETE" }
      );
      expect(response.status).toBe(403);
    });

    it("returns 403 when the user lacks write permission", async () => {
      vi.spyOn(SpaceResource.prototype, "canWrite").mockReturnValue(false);
      const { workspace, project } = await setupProject();
      const response = await fileRequest(
        workspace,
        project.sId,
        ["pod", "file.txt"],
        { method: "DELETE" }
      );
      expect(response.status).toBe(403);
    });

    it("returns 500 when deleteProjectFile fails", async () => {
      vi.spyOn(projectsContext, "deleteProjectFile").mockResolvedValue(
        new Err(new Error("GCS error"))
      );
      const { workspace, project } = await setupProject();
      const response = await fileRequest(
        workspace,
        project.sId,
        ["pod", "file.txt"],
        { method: "DELETE" }
      );
      expect(response.status).toBe(500);
    });
  });

  describe("POST (move)", () => {
    beforeEach(() => {
      vi.spyOn(projectsContext, "moveProjectFile").mockResolvedValue(
        new Ok(undefined)
      );
    });

    it("returns 200 and calls moveProjectFile with the right args", async () => {
      const { workspace, project } = await setupProject();
      const response = await fileRequest(
        workspace,
        project.sId,
        ["reports", "file.txt"],
        {
          method: "POST",
          body: { destRelativeFilePath: "archive/file.txt" },
        }
      );
      expect(response.status).toBe(200);
      expect(projectsContext.moveProjectFile).toHaveBeenCalledWith(
        expect.anything(),
        {
          space: expect.objectContaining({ sId: project.sId }),
          sourcePath: "reports/file.txt",
          destRelativeFilePath: "archive/file.txt",
        }
      );
    });

    it("returns 400 when destRelativeFilePath is missing", async () => {
      const { workspace, project } = await setupProject();
      const response = await fileRequest(
        workspace,
        project.sId,
        ["reports", "file.txt"],
        { method: "POST", body: {} }
      );
      expect(response.status).toBe(400);
    });

    it("returns 404 when the user lacks write permission (requireCanWrite)", async () => {
      vi.spyOn(SpaceResource.prototype, "canWrite").mockReturnValue(false);
      const { workspace, project } = await setupProject();
      const response = await fileRequest(
        workspace,
        project.sId,
        ["reports", "file.txt"],
        {
          method: "POST",
          body: { destRelativeFilePath: "archive/file.txt" },
        }
      );
      // withSpace({ requireCanWrite }) masks denied write as space_not_found.
      expect(response.status).toBe(404);
      expect(projectsContext.moveProjectFile).not.toHaveBeenCalled();
    });

    it("returns 500 when moveProjectFile fails", async () => {
      vi.spyOn(projectsContext, "moveProjectFile").mockResolvedValue(
        new Err(new Error("GCS error"))
      );
      const { workspace, project } = await setupProject();
      const response = await fileRequest(workspace, project.sId, ["file.txt"], {
        method: "POST",
        body: { destRelativeFilePath: "file.txt" },
      });
      expect(response.status).toBe(500);
    });
  });
});
