import {
  getProjectFilesBasePath,
  parseScopedFilePath,
} from "@app/lib/api/files/mount_path";
import {
  deleteProjectFile,
  renameProjectFile,
} from "@app/lib/api/projects/context";
import { getPrivateUploadBucket } from "@app/lib/file_storage";
import logger from "@app/logger/logger";
import { isString } from "@app/types/shared/utils/general";
import { spaceResource } from "@front-api/middleware/space_resource";
import { apiError } from "@front-api/middleware/utils";
import { Hono } from "hono";
import path from "path";

// Catch-all for /api/w/:wId/spaces/:spaceId/files/<...rel>.
//
// Mounted from `files/index.ts` at the root path. Hono's `:rel{.+}` wildcard
// captures everything past `/files/` (matching Next's `[...rel]`).
const app = new Hono();

async function buildContext(ctx: any) {
  const space = ctx.get("space");
  const auth = ctx.get("auth");

  if (!space.isProject()) {
    return {
      error: apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "Files are only available for project spaces.",
        },
      }),
    };
  }

  const rel = ctx.req.param("rel");
  if (!isString(rel) || rel.length === 0) {
    return {
      error: apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "Missing file path.",
        },
      }),
    };
  }

  const scopedPath = parseScopedFilePath(rel);
  if (!scopedPath || scopedPath.prefix !== "project") {
    return {
      error: apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "Path must start with the scope prefix `project/`.",
        },
      }),
    };
  }

  const owner = auth.getNonNullableWorkspace();
  const basePath = getProjectFilesBasePath({
    workspaceId: owner.sId,
    projectId: space.sId,
  });
  const normalizedGcsPath = path.posix.normalize(
    `${basePath}${scopedPath.rel}`
  );
  if (!normalizedGcsPath.startsWith(basePath)) {
    return {
      error: apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "workspace_auth_error",
          message: "Access denied: path is outside project scope.",
        },
      }),
    };
  }

  return {
    auth,
    space,
    normalizedGcsPath,
    normalizedRelative: scopedPath.rel,
  };
}

app.get("/:rel{.+}", spaceResource({ requireCanRead: true }), async (ctx) => {
  const built = await buildContext(ctx);
  if ("error" in built) {
    return built.error;
  }
  const { normalizedGcsPath } = built;

  const bucket = getPrivateUploadBucket();
  const contentTypeResult = await bucket.getFileContentType(normalizedGcsPath);
  if (contentTypeResult.isErr()) {
    return apiError(ctx, {
      status_code: 404,
      api_error: {
        type: "file_not_found",
        message: "File not found.",
      },
    });
  }

  const contentType = contentTypeResult.value ?? "application/octet-stream";
  const readStream = bucket.file(normalizedGcsPath).createReadStream();

  // Stream the file as the Hono response body.
  const webStream = new ReadableStream({
    start(controller) {
      readStream.on("data", (chunk) => controller.enqueue(chunk));
      readStream.on("end", () => controller.close());
      readStream.on("error", (err) => {
        logger.error(
          { err, gcsPath: normalizedGcsPath },
          "Error streaming project file (GCS)"
        );
        controller.error(err);
      });
    },
    cancel() {
      readStream.destroy();
    },
  });

  return new Response(webStream, {
    status: 200,
    headers: { "Content-Type": contentType },
  });
});

app.patch("/:rel{.+}", spaceResource({ requireCanRead: true }), async (ctx) => {
  const built = await buildContext(ctx);
  if ("error" in built) {
    return built.error;
  }
  const { auth, space, normalizedRelative } = built;

  if (!space.canWrite(auth)) {
    return apiError(ctx, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message: "You do not have write access to this project.",
      },
    });
  }

  const body = await ctx.req.json().catch(() => ({}));
  const { fileName } = body ?? {};
  if (
    !isString(fileName) ||
    fileName.trim() === "" ||
    fileName.includes("/") ||
    fileName.includes("\\")
  ) {
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message:
          "fileName is required and must be a non-empty string without path separators.",
      },
    });
  }

  const renameResult = await renameProjectFile(auth, {
    space,
    relativeFilePath: normalizedRelative,
    newFileName: fileName.trim(),
  });
  if (renameResult.isErr()) {
    return apiError(ctx, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: renameResult.error.message,
      },
    });
  }

  return ctx.json({});
});

app.delete(
  "/:rel{.+}",
  spaceResource({ requireCanRead: true }),
  async (ctx) => {
    const built = await buildContext(ctx);
    if ("error" in built) {
      return built.error;
    }
    const { auth, space, normalizedRelative } = built;

    if (!space.canWrite(auth)) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "workspace_auth_error",
          message: "You do not have write access to this project.",
        },
      });
    }

    const deleteResult = await deleteProjectFile(auth, {
      space,
      relativeFilePath: normalizedRelative,
    });
    if (deleteResult.isErr()) {
      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: deleteResult.error.message,
        },
      });
    }

    return ctx.json({});
  }
);

export default app;
