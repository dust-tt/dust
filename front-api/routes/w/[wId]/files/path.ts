import type { DustFileSystemError } from "@app/lib/api/file_system/dust_file_system";
import { DustFileSystem } from "@app/lib/api/file_system/dust_file_system";
import logger from "@app/logger/logger";
import type { APIErrorWithContentfulStatusCode } from "@app/types/error";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { apiError } from "@front-api/middlewares/utils";

/**
 * Serve a file by canonical scoped path, e.g.
 *   GET /api/w/:wId/files/path/conversation-{cId}/report.pdf
 *   GET /api/w/:wId/files/path/pod-{pId}/data.csv
 *
 * Mirrors pages/api/w/[wId]/files/path/[...canonicalPath].ts
 */
const app = workspaceApp();

app.get("/:canonicalPath{.+}", async (ctx) => {
  const auth = ctx.get("auth");
  const canonicalPath = ctx.req.param("canonicalPath");

  // The canonical path must have at least two segments: the scoped prefix and a filename.
  if (!canonicalPath || !canonicalPath.includes("/")) {
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message:
          "Invalid canonical path: expected at least two path segments " +
          "(e.g. /files/path/conversation-{id}/file.txt).",
      },
    });
  }

  const fsResult = await DustFileSystem.fromScopedPath(auth, canonicalPath);
  if (fsResult.isErr()) {
    return apiError(ctx, mapFsError(fsResult.error));
  }

  const fs = fsResult.value;

  const statResult = await fs.stat(canonicalPath);
  if (statResult.isErr()) {
    return apiError(ctx, mapFsError(statResult.error));
  }
  if (!statResult.value) {
    return apiError(ctx, {
      status_code: 404,
      api_error: { type: "file_not_found", message: "File not found." },
    });
  }

  const { contentType } = statResult.value;

  const readResult = await fs.read(canonicalPath);
  if (readResult.isErr()) {
    return apiError(ctx, mapFsError(readResult.error));
  }
  if (!readResult.value) {
    return apiError(ctx, {
      status_code: 404,
      api_error: { type: "file_not_found", message: "File not found." },
    });
  }

  const nodeStream = readResult.value;
  const webStream = new ReadableStream({
    start(controller) {
      nodeStream.on("data", (chunk) => controller.enqueue(chunk));
      nodeStream.on("end", () => controller.close());
      nodeStream.on("error", (err) => {
        logger.error({ err, canonicalPath }, "Error streaming canonical file");
        controller.error(err);
      });
    },
    cancel() {
      nodeStream.destroy();
    },
  });

  return new Response(webStream, {
    status: 200,
    headers: { "Content-Type": contentType },
  });
});

function mapFsError(
  err: DustFileSystemError
): APIErrorWithContentfulStatusCode {
  switch (err.code) {
    case "not_found":
      return {
        status_code: 404,
        api_error: { type: "file_not_found", message: err.message },
      };

    case "unauthorized":
      return {
        status_code: 403,
        api_error: { type: "workspace_auth_error", message: err.message },
      };

    case "invalid_path":
    case "legacy_path":
      return {
        status_code: 400,
        api_error: { type: "invalid_request_error", message: err.message },
      };

    case "already_exists":
      return {
        status_code: 409,
        api_error: { type: "invalid_request_error", message: err.message },
      };

    case "too_many_mounts":
    case "internal":
      return {
        status_code: 500,
        api_error: { type: "internal_server_error", message: err.message },
      };

    default:
      assertNever(err.code);
  }
}

export default app;
