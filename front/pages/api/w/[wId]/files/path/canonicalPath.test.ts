import {
  DustFileSystem,
  DustFileSystemError,
} from "@app/lib/api/file_system/dust_file_system";
import * as fileSystemOps from "@app/lib/api/files/file_system_ops";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { Err, Ok } from "@app/types/shared/result";
import { PassThrough } from "stream";
import { beforeEach, describe, expect, it, vi } from "vitest";

import handler from "./[...canonicalPath]";

vi.mock("@app/lib/api/files/file_system_ops", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@app/lib/api/files/file_system_ops")>();
  return {
    ...actual,
    streamThumbnail: vi.fn(),
    renameCanonicalFile: vi.fn(),
    moveCanonicalFile: vi.fn(),
  };
});

/** Returns a minimal DustFileSystem-compatible mock. */
function makeMockFs({
  found = true,
}: {
  found?: boolean;
} = {}): DustFileSystem {
  return {
    stat: vi
      .fn()
      .mockResolvedValue(
        found
          ? new Ok({ contentType: "text/plain", sizeBytes: 100 })
          : new Ok(null)
      ),
    read: vi
      .fn()
      .mockResolvedValue(found ? new Ok(new PassThrough()) : new Ok(null)),
    delete: vi
      .fn()
      .mockResolvedValue(
        found
          ? new Ok(undefined)
          : new Err(new DustFileSystemError("not_found", "File not found."))
      ),
  } as unknown as DustFileSystem;
}

describe("GET /api/w/[wId]/files/path/[...canonicalPath]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("serves a file from a conversation-scoped canonical path", async () => {
    const { req, res, workspace } = await createPrivateApiMockRequest({
      method: "GET",
    });

    vi.spyOn(DustFileSystem, "fromScopedPath").mockResolvedValue(
      new Ok(makeMockFs({ found: true }))
    );

    req.query = {
      wId: workspace.sId,
      canonicalPath: ["conversation-conv123", "report.pdf"],
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(res._getHeaders()["content-type"]).toBe("text/plain");
  });

  it("serves a file from a pod-scoped canonical path", async () => {
    const { req, res, workspace } = await createPrivateApiMockRequest({
      method: "GET",
    });

    vi.spyOn(DustFileSystem, "fromScopedPath").mockResolvedValue(
      new Ok(makeMockFs({ found: true }))
    );

    req.query = {
      wId: workspace.sId,
      canonicalPath: ["pod-vlt_abc123", "data.csv"],
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
  });

  it("returns 404 when fromScopedPath cannot find the resource", async () => {
    const { req, res, workspace } = await createPrivateApiMockRequest({
      method: "GET",
    });

    vi.spyOn(DustFileSystem, "fromScopedPath").mockResolvedValue(
      new Err(new DustFileSystemError("not_found", "Conversation not found"))
    );

    req.query = {
      wId: workspace.sId,
      canonicalPath: ["conversation-nonexistent", "report.pdf"],
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(404);
    expect(res._getJSONData()).toEqual({
      error: {
        type: "file_not_found",
        message: "Conversation not found",
      },
    });
  });

  it("returns 404 when the file does not exist in the file system", async () => {
    const { req, res, workspace } = await createPrivateApiMockRequest({
      method: "GET",
    });

    vi.spyOn(DustFileSystem, "fromScopedPath").mockResolvedValue(
      new Ok(makeMockFs({ found: false }))
    );

    req.query = {
      wId: workspace.sId,
      canonicalPath: ["conversation-conv123", "missing.pdf"],
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(404);
    expect(res._getJSONData()).toEqual({
      error: { type: "file_not_found", message: "File not found." },
    });
  });

  it("returns 403 when the caller has no read access to the resource", async () => {
    const { req, res, workspace } = await createPrivateApiMockRequest({
      method: "GET",
    });

    vi.spyOn(DustFileSystem, "fromScopedPath").mockResolvedValue(
      new Err(new DustFileSystemError("unauthorized", "Read access denied"))
    );

    req.query = {
      wId: workspace.sId,
      canonicalPath: ["pod-vlt_restricted", "secret.csv"],
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(403);
    expect(res._getJSONData()).toEqual({
      error: {
        type: "workspace_auth_error",
        message: "Read access denied",
      },
    });
  });

  it("returns 400 when canonicalPath has fewer than two segments", async () => {
    const { req, res, workspace } = await createPrivateApiMockRequest({
      method: "GET",
    });

    req.query = {
      wId: workspace.sId,
      canonicalPath: ["conversation-abc123"],
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData().error.type).toBe("invalid_request_error");
  });

  it("returns 400 for a path traversal attempt", async () => {
    const { req, res, workspace } = await createPrivateApiMockRequest({
      method: "GET",
    });

    const mockFs = {
      stat: vi
        .fn()
        .mockResolvedValue(
          new Err(
            new DustFileSystemError(
              "invalid_path",
              "Path traversal detected: `conversation-abc123/../../etc/passwd` is not allowed."
            )
          )
        ),
      read: vi.fn(),
    } as unknown as DustFileSystem;

    vi.spyOn(DustFileSystem, "fromScopedPath").mockResolvedValue(
      new Ok(mockFs)
    );

    req.query = {
      wId: workspace.sId,
      canonicalPath: ["conversation-abc123", "..", "..", "..", "etc", "passwd"],
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData().error.type).toBe("invalid_request_error");
  });

  it("returns 400 for an unrecognised path prefix", async () => {
    const { req, res, workspace } = await createPrivateApiMockRequest({
      method: "GET",
    });

    vi.spyOn(DustFileSystem, "fromScopedPath").mockResolvedValue(
      new Err(
        new DustFileSystemError(
          "invalid_path",
          "Cannot infer file system context from path: unknown-prefix-xyz/file.txt"
        )
      )
    );

    req.query = {
      wId: workspace.sId,
      canonicalPath: ["unknown-prefix-xyz", "file.txt"],
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData().error.type).toBe("invalid_request_error");
  });

  it("sets Content-Disposition: attachment when ?download=1", async () => {
    const { req, res, workspace } = await createPrivateApiMockRequest({
      method: "GET",
    });

    vi.spyOn(DustFileSystem, "fromScopedPath").mockResolvedValue(
      new Ok(makeMockFs({ found: true }))
    );

    req.query = {
      wId: workspace.sId,
      canonicalPath: ["conversation-conv123", "report.pdf"],
      download: "1",
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(res._getHeaders()["content-disposition"]).toMatch(
      /^attachment; filename=/
    );
  });

  it("does not set Content-Disposition when ?download=0", async () => {
    const { req, res, workspace } = await createPrivateApiMockRequest({
      method: "GET",
    });

    vi.spyOn(DustFileSystem, "fromScopedPath").mockResolvedValue(
      new Ok(makeMockFs({ found: true }))
    );

    req.query = {
      wId: workspace.sId,
      canonicalPath: ["conversation-conv123", "report.pdf"],
      download: "0",
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(res._getHeaders()["content-disposition"]).toBeUndefined();
  });
});

describe("GET ?thumbnail=1 /api/w/[wId]/files/path/[...canonicalPath]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 with image content-type and cache-control for a valid thumbnail", async () => {
    const { req, res, workspace } = await createPrivateApiMockRequest({
      method: "GET",
    });

    vi.spyOn(DustFileSystem, "fromScopedPath").mockResolvedValue(
      new Ok(makeMockFs())
    );
    vi.mocked(fileSystemOps.streamThumbnail).mockResolvedValue(
      new Ok({ stream: new PassThrough(), contentType: "image/jpeg" })
    );

    req.query = {
      wId: workspace.sId,
      canonicalPath: ["conversation-conv123", "photo.jpg"],
      thumbnail: "1",
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(res._getHeaders()["content-type"]).toBe("image/jpeg");
    expect(res._getHeaders()["cache-control"]).toBe("private, max-age=3600");
  });

  it("returns 400 when the file is not an image", async () => {
    const { req, res, workspace } = await createPrivateApiMockRequest({
      method: "GET",
    });

    vi.spyOn(DustFileSystem, "fromScopedPath").mockResolvedValue(
      new Ok(makeMockFs())
    );
    vi.mocked(fileSystemOps.streamThumbnail).mockResolvedValue(
      new Err(
        new fileSystemOps.ThumbnailError(
          "not_image",
          "Thumbnail is only supported for image files."
        )
      )
    );

    req.query = {
      wId: workspace.sId,
      canonicalPath: ["conversation-conv123", "report.pdf"],
      thumbnail: "1",
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData().error.type).toBe("invalid_request_error");
  });

  it("returns 404 when the file is not found for thumbnail", async () => {
    const { req, res, workspace } = await createPrivateApiMockRequest({
      method: "GET",
    });

    vi.spyOn(DustFileSystem, "fromScopedPath").mockResolvedValue(
      new Ok(makeMockFs())
    );
    vi.mocked(fileSystemOps.streamThumbnail).mockResolvedValue(
      new Err(
        new fileSystemOps.ThumbnailError("not_found", "File not found: `...`.")
      )
    );

    req.query = {
      wId: workspace.sId,
      canonicalPath: ["conversation-conv123", "missing.jpg"],
      thumbnail: "1",
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(404);
    expect(res._getJSONData().error.type).toBe("file_not_found");
  });

  it("does not serve a thumbnail when ?thumbnail=0", async () => {
    const { req, res, workspace } = await createPrivateApiMockRequest({
      method: "GET",
    });

    vi.spyOn(DustFileSystem, "fromScopedPath").mockResolvedValue(
      new Ok(makeMockFs({ found: true }))
    );

    req.query = {
      wId: workspace.sId,
      canonicalPath: ["conversation-conv123", "photo.jpg"],
      thumbnail: "0",
    };

    await handler(req, res);

    expect(fileSystemOps.streamThumbnail).not.toHaveBeenCalled();
    expect(res._getStatusCode()).toBe(200);
  });
});

describe("HEAD /api/w/[wId]/files/path/[...canonicalPath]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 with Content-Type and Content-Length when file exists", async () => {
    const { req, res, workspace } = await createPrivateApiMockRequest({
      method: "HEAD",
    });

    vi.spyOn(DustFileSystem, "fromScopedPath").mockResolvedValue(
      new Ok(makeMockFs({ found: true }))
    );

    req.query = {
      wId: workspace.sId,
      canonicalPath: ["conversation-conv123", "report.pdf"],
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(res._getHeaders()["content-type"]).toBe("text/plain");
    expect(res._getHeaders()["content-length"]).toBe(100);
  });

  it("returns 404 when the file does not exist", async () => {
    const { req, res, workspace } = await createPrivateApiMockRequest({
      method: "HEAD",
    });

    vi.spyOn(DustFileSystem, "fromScopedPath").mockResolvedValue(
      new Ok(makeMockFs({ found: false }))
    );

    req.query = {
      wId: workspace.sId,
      canonicalPath: ["conversation-conv123", "missing.pdf"],
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(404);
  });
});

describe("PATCH rename /api/w/[wId]/files/path/[...canonicalPath]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 on a successful rename", async () => {
    const { req, res, workspace } = await createPrivateApiMockRequest({
      method: "PATCH",
    });

    vi.spyOn(DustFileSystem, "fromScopedPath").mockResolvedValue(
      new Ok(makeMockFs())
    );
    vi.mocked(fileSystemOps.renameCanonicalFile).mockResolvedValue(
      new Ok({
        dest: "conversation-conv123/renamed.pdf",
        sourceDeletionFailed: false,
      })
    );

    req.query = {
      wId: workspace.sId,
      canonicalPath: ["conversation-conv123", "report.pdf"],
    };
    req.body = { action: "rename", fileName: "renamed.pdf" };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(fileSystemOps.renameCanonicalFile).toHaveBeenCalledOnce();
  });

  it("returns 400 when the body is missing the action field", async () => {
    const { req, res, workspace } = await createPrivateApiMockRequest({
      method: "PATCH",
    });

    vi.spyOn(DustFileSystem, "fromScopedPath").mockResolvedValue(
      new Ok(makeMockFs())
    );

    req.query = {
      wId: workspace.sId,
      canonicalPath: ["conversation-conv123", "report.pdf"],
    };
    req.body = { fileName: "renamed.pdf" };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData().error.type).toBe("invalid_request_error");
  });

  it("returns 400 when fileName contains a path separator", async () => {
    const { req, res, workspace } = await createPrivateApiMockRequest({
      method: "PATCH",
    });

    vi.spyOn(DustFileSystem, "fromScopedPath").mockResolvedValue(
      new Ok(makeMockFs())
    );

    req.query = {
      wId: workspace.sId,
      canonicalPath: ["conversation-conv123", "report.pdf"],
    };
    req.body = { action: "rename", fileName: "sub/dir.pdf" };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData().error.type).toBe("invalid_request_error");
  });

  it("returns 404 when renameCanonicalFile reports not_found", async () => {
    const { req, res, workspace } = await createPrivateApiMockRequest({
      method: "PATCH",
    });

    vi.spyOn(DustFileSystem, "fromScopedPath").mockResolvedValue(
      new Ok(makeMockFs())
    );
    vi.mocked(fileSystemOps.renameCanonicalFile).mockResolvedValue(
      new Err(new DustFileSystemError("not_found", "File not found."))
    );

    req.query = {
      wId: workspace.sId,
      canonicalPath: ["conversation-conv123", "missing.pdf"],
    };
    req.body = { action: "rename", fileName: "new-name.pdf" };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(404);
  });
});

describe("PATCH move /api/w/[wId]/files/path/[...canonicalPath]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 on a successful move", async () => {
    const { req, res, workspace } = await createPrivateApiMockRequest({
      method: "PATCH",
    });

    vi.spyOn(DustFileSystem, "fromScopedPath").mockResolvedValue(
      new Ok(makeMockFs())
    );
    vi.mocked(fileSystemOps.moveCanonicalFile).mockResolvedValue(
      new Ok({ sourceDeletionFailed: false })
    );

    req.query = {
      wId: workspace.sId,
      canonicalPath: ["conversation-conv123", "report.pdf"],
    };
    req.body = {
      action: "move",
      dest: "pod-vlt_abc123/report.pdf",
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(fileSystemOps.moveCanonicalFile).toHaveBeenCalledOnce();
  });

  it("returns 200 immediately when dest equals the canonical path (no-op)", async () => {
    const { req, res, workspace } = await createPrivateApiMockRequest({
      method: "PATCH",
    });

    vi.spyOn(DustFileSystem, "fromScopedPath").mockResolvedValue(
      new Ok(makeMockFs())
    );

    req.query = {
      wId: workspace.sId,
      canonicalPath: ["conversation-conv123", "report.pdf"],
    };
    req.body = {
      action: "move",
      dest: "conversation-conv123/report.pdf",
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(fileSystemOps.moveCanonicalFile).not.toHaveBeenCalled();
  });

  it("returns 400 when dest is empty", async () => {
    const { req, res, workspace } = await createPrivateApiMockRequest({
      method: "PATCH",
    });

    vi.spyOn(DustFileSystem, "fromScopedPath").mockResolvedValue(
      new Ok(makeMockFs())
    );

    req.query = {
      wId: workspace.sId,
      canonicalPath: ["conversation-conv123", "report.pdf"],
    };
    req.body = { action: "move", dest: "" };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData().error.type).toBe("invalid_request_error");
  });
});

describe("DELETE /api/w/[wId]/files/path/[...canonicalPath]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 204 on a successful delete", async () => {
    const { req, res, workspace } = await createPrivateApiMockRequest({
      method: "DELETE",
    });

    vi.spyOn(DustFileSystem, "fromScopedPath").mockResolvedValue(
      new Ok(makeMockFs({ found: true }))
    );

    req.query = {
      wId: workspace.sId,
      canonicalPath: ["conversation-conv123", "report.pdf"],
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(204);
  });

  it("returns 404 when the file does not exist", async () => {
    const { req, res, workspace } = await createPrivateApiMockRequest({
      method: "DELETE",
    });

    const mockFs = {
      delete: vi
        .fn()
        .mockResolvedValue(
          new Err(new DustFileSystemError("not_found", "File not found."))
        ),
    } as unknown as DustFileSystem;

    vi.spyOn(DustFileSystem, "fromScopedPath").mockResolvedValue(
      new Ok(mockFs)
    );

    req.query = {
      wId: workspace.sId,
      canonicalPath: ["conversation-conv123", "missing.pdf"],
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(404);
    expect(res._getJSONData().error.type).toBe("file_not_found");
  });
});

describe("unsupported methods /api/w/[wId]/files/path/[...canonicalPath]", () => {
  it("returns 405 for POST", async () => {
    const { req, res, workspace } = await createPrivateApiMockRequest({
      method: "POST",
    });

    req.query = {
      wId: workspace.sId,
      canonicalPath: ["conversation-abc", "file.txt"],
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(405);
  });

  it("returns 405 for PUT", async () => {
    const { req, res, workspace } = await createPrivateApiMockRequest({
      method: "PUT",
    });

    req.query = {
      wId: workspace.sId,
      canonicalPath: ["conversation-abc", "file.txt"],
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(405);
  });
});
