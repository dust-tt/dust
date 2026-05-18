import * as gcsFiles from "@app/lib/api/files/gcs_mount/files";
import { getPrivateUploadBucket } from "@app/lib/file_storage";
import * as projectsContext from "@app/lib/api/projects/context";
import { Authenticator } from "@app/lib/auth";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { Err, Ok } from "@app/types/shared/result";
import type { RequestMethod } from "node-mocks-http";
import { PassThrough } from "stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import handler from "./[...rel]";

vi.mock("@app/lib/api/auth_wrappers", async () => {
  const actual = await vi.importActual<
    typeof import("@app/lib/api/auth_wrappers")
  >("@app/lib/api/auth_wrappers");
  return {
    ...actual,
    withSessionAuthenticationForWorkspace:
      (fn: (...args: unknown[]) => unknown) =>
      async (req: any, res: any) =>
        fn(req, res, req._auth),
  };
});

async function makeProjectRequest(
  method: RequestMethod,
  rel: string[],
  options: { body?: Record<string, unknown> } = {}
) {
  const { req, res, workspace, user } = await createPrivateApiMockRequest({
    method,
  });
  const project = await SpaceFactory.project(workspace, user.id);
  // Re-create auth after project creation so the editor group is included.
  const auth = await Authenticator.fromUserIdAndWorkspaceId(
    user.sId,
    workspace.sId
  );
  req.query.spaceId = project.sId;
  req.query.rel = rel;
  (req as any)._auth = auth;
  if (options.body) {
    req.body = options.body;
  }
  return { req, res, auth, project };
}

describe("/api/w/[wId]/spaces/[spaceId]/files/[...rel]", () => {
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
          createReadStream: vi.fn().mockReturnValue(
            Object.assign(new PassThrough(), { pipe: vi.fn() })
          ),
        })),
      } as unknown as ReturnType<typeof getPrivateUploadBucket>);
    });

    it("returns 200 and streams a file for a valid scoped path", async () => {
      const { req, res } = await makeProjectRequest("GET", [
        "project",
        "report.pdf",
      ]);
      await handler(req, res);
      expect(res._getStatusCode()).toBe(200);
      expect(res.getHeader("Content-Type")).toBe("text/plain");
    });

    it("returns 400 when path lacks the project/ prefix", async () => {
      const { req, res } = await makeProjectRequest("GET", ["report.pdf"]);
      await handler(req, res);
      expect(res._getStatusCode()).toBe(400);
      expect(res._getJSONData().error.message).toMatch(/project\//);
    });

    it("returns 403 for path traversal attempts", async () => {
      const { req, res } = await makeProjectRequest("GET", [
        "project",
        "..",
        "..",
        "etc",
        "passwd",
      ]);
      await handler(req, res);
      expect(res._getStatusCode()).toBe(403);
    });

    it("returns 404 when the file does not exist in GCS", async () => {
      vi.mocked(getPrivateUploadBucket).mockReturnValue({
        getFileContentType: vi
          .fn()
          .mockResolvedValue(new Err(new Error("not found"))),
      } as unknown as ReturnType<typeof getPrivateUploadBucket>);

      const { req, res } = await makeProjectRequest("GET", [
        "project",
        "missing.txt",
      ]);
      await handler(req, res);
      expect(res._getStatusCode()).toBe(404);
      expect(res._getJSONData().error.type).toBe("file_not_found");
    });
  });

  describe("PATCH", () => {
    beforeEach(() => {
      vi.spyOn(gcsFiles, "renameGCSMountFile").mockResolvedValue(
        new Ok(undefined)
      );
    });

    it("returns 200 and calls renameGCSMountFile with the right args", async () => {
      const { req, res, project } = await makeProjectRequest(
        "PATCH",
        ["project", "old.txt"],
        { body: { fileName: "new.txt" } }
      );
      await handler(req, res);
      expect(res._getStatusCode()).toBe(200);
      expect(gcsFiles.renameGCSMountFile).toHaveBeenCalledWith(
        expect.anything(),
        { useCase: "project", projectId: project.sId },
        { relativeFilePath: "old.txt", newFileName: "new.txt" }
      );
    });

    it("returns 400 when fileName is missing", async () => {
      const { req, res } = await makeProjectRequest(
        "PATCH",
        ["project", "file.txt"],
        { body: {} }
      );
      await handler(req, res);
      expect(res._getStatusCode()).toBe(400);
    });

    it("returns 400 when fileName contains a slash", async () => {
      const { req, res } = await makeProjectRequest(
        "PATCH",
        ["project", "file.txt"],
        { body: { fileName: "sub/name.txt" } }
      );
      await handler(req, res);
      expect(res._getStatusCode()).toBe(400);
    });

    it("returns 400 when path lacks the project/ prefix", async () => {
      const { req, res } = await makeProjectRequest("PATCH", ["file.txt"], {
        body: { fileName: "new.txt" },
      });
      await handler(req, res);
      expect(res._getStatusCode()).toBe(400);
    });

    it("returns 403 for path traversal attempts", async () => {
      const { req, res } = await makeProjectRequest(
        "PATCH",
        ["project", "..", "evil.txt"],
        { body: { fileName: "new.txt" } }
      );
      await handler(req, res);
      expect(res._getStatusCode()).toBe(403);
    });

    it("returns 403 when the user lacks write permission", async () => {
      vi.spyOn(SpaceResource.prototype, "canWrite").mockReturnValue(false);
      const { req, res } = await makeProjectRequest(
        "PATCH",
        ["project", "file.txt"],
        { body: { fileName: "new.txt" } }
      );
      await handler(req, res);
      expect(res._getStatusCode()).toBe(403);
    });

    it("returns 500 when renameGCSMountFile fails", async () => {
      vi.spyOn(gcsFiles, "renameGCSMountFile").mockResolvedValue(
        new Err(new Error("GCS error"))
      );
      const { req, res } = await makeProjectRequest(
        "PATCH",
        ["project", "file.txt"],
        { body: { fileName: "new.txt" } }
      );
      await handler(req, res);
      expect(res._getStatusCode()).toBe(500);
    });
  });

  describe("DELETE", () => {
    beforeEach(() => {
      vi.spyOn(projectsContext, "deleteProjectFile").mockResolvedValue(
        new Ok(undefined)
      );
    });

    it("returns 200 and calls deleteProjectFile with the right args", async () => {
      const { req, res, project } = await makeProjectRequest("DELETE", [
        "project",
        "file.txt",
      ]);
      await handler(req, res);
      expect(res._getStatusCode()).toBe(200);
      expect(projectsContext.deleteProjectFile).toHaveBeenCalledWith(
        expect.anything(),
        {
          space: expect.objectContaining({ sId: project.sId }),
          relativeFilePath: "file.txt",
        }
      );
    });

    it("returns 400 when path lacks the project/ prefix", async () => {
      const { req, res } = await makeProjectRequest("DELETE", ["file.txt"]);
      await handler(req, res);
      expect(res._getStatusCode()).toBe(400);
    });

    it("returns 403 for path traversal attempts", async () => {
      const { req, res } = await makeProjectRequest("DELETE", [
        "project",
        "..",
        "evil.txt",
      ]);
      await handler(req, res);
      expect(res._getStatusCode()).toBe(403);
    });

    it("returns 403 when the user lacks write permission", async () => {
      vi.spyOn(SpaceResource.prototype, "canWrite").mockReturnValue(false);
      const { req, res } = await makeProjectRequest("DELETE", [
        "project",
        "file.txt",
      ]);
      await handler(req, res);
      expect(res._getStatusCode()).toBe(403);
    });

    it("returns 500 when deleteProjectFile fails", async () => {
      vi.spyOn(projectsContext, "deleteProjectFile").mockResolvedValue(
        new Err(new Error("GCS error"))
      );
      const { req, res } = await makeProjectRequest("DELETE", [
        "project",
        "file.txt",
      ]);
      await handler(req, res);
      expect(res._getStatusCode()).toBe(500);
    });
  });

  it("returns 405 for unsupported methods", async () => {
    const { req, res } = await makeProjectRequest("POST", [
      "project",
      "file.txt",
    ]);
    await handler(req, res);
    expect(res._getStatusCode()).toBe(405);
  });
});
