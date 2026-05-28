import {
  DustFileSystem,
  DustFileSystemError,
} from "@app/lib/api/file_system/dust_file_system";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { Err, Ok } from "@app/types/shared/result";
import { PassThrough } from "stream";
import { beforeEach, describe, expect, it, vi } from "vitest";

import handler from "./[...canonicalPath]";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
  } as unknown as DustFileSystem;
}

describe("GET /api/w/[wId]/files/path/[...canonicalPath]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Success cases
  // -------------------------------------------------------------------------

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

  // -------------------------------------------------------------------------
  // Not found
  // -------------------------------------------------------------------------

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

    // fs.stat returns Ok(null) — file not found.
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

  // -------------------------------------------------------------------------
  // Authorization
  // -------------------------------------------------------------------------

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

  // -------------------------------------------------------------------------
  // Bad input
  // -------------------------------------------------------------------------

  it("returns 400 when canonicalPath has fewer than two segments", async () => {
    const { req, res, workspace } = await createPrivateApiMockRequest({
      method: "GET",
    });

    req.query = {
      wId: workspace.sId,
      canonicalPath: ["conversation-abc123"], // missing the filename
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData().error.type).toBe("invalid_request_error");
  });

  it("returns 400 for a path traversal attempt", async () => {
    const { req, res, workspace } = await createPrivateApiMockRequest({
      method: "GET",
    });

    // DustFileSystem.stat catches the traversal and returns invalid_path.
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

  // -------------------------------------------------------------------------
  // Method guard
  // -------------------------------------------------------------------------

  it("returns 405 for non-GET methods", async () => {
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
});
