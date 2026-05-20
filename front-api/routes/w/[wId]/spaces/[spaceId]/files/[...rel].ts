import {
  getProjectFilesBasePath,
  isResolveMountFilePathError,
  resolveScopedMountFilePath,
} from "@app/lib/api/files/mount_path";
import { MoveMountFileRequestBodySchema } from "@app/lib/api/files/mount_schemas";
import {
  deleteProjectFile,
  moveProjectFile,
  renameProjectFile,
} from "@app/lib/api/projects/context";
import type { Authenticator } from "@app/lib/auth";
import { getPrivateUploadBucket } from "@app/lib/file_storage";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import logger from "@app/logger/logger";
import type { APIErrorResponse } from "@app/types/error";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { isString } from "@app/types/shared/utils/general";
import type { HandlerResult } from "@front-api/middleware/utils";
import { apiError } from "@front-api/middleware/utils";
import { validate } from "@front-api/middleware/validator";
import { withSpace } from "@front-api/middleware/with_space";
import type { Context, TypedResponse } from "hono";
import { Hono } from "hono";

export type ProjectFileRelResponseBody = Record<string, never>;

// Catch-all for /api/w/:wId/spaces/:spaceId/files/<...rel>.
//
// Mounted from `files/index.ts` at the root path. Hono's `:rel{.+}` wildcard
// captures everything past `/files/` (matching Next's `[...rel]`).
const app = new Hono();

async function buildContext(ctx: Context): Promise<
  | {
      auth: Authenticator;
      space: SpaceResource;
      normalizedGcsPath: string;
      normalizedRelative: string;
    }
  | { error: Response & TypedResponse<APIErrorResponse> }
> {
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

  const owner = auth.getNonNullableWorkspace();
  const basePath = getProjectFilesBasePath({
    workspaceId: owner.sId,
    projectId: space.sId,
  });
  const pathRes = resolveScopedMountFilePath({
    relPath: rel,
    expectedPrefix: "project",
    mountBasePath: basePath,
    outsideScopeMessage: "Access denied: path is outside project scope.",
  });
  if (pathRes.isErr()) {
    const { code, message } = pathRes.error;
    return {
      error: apiError(ctx, {
        status_code: code === "outside_scope" ? 403 : 400,
        api_error: {
          type:
            code === "outside_scope"
              ? "workspace_auth_error"
              : "invalid_request_error",
          message,
        },
      }),
    };
  }

  const { normalizedGcsPath, normalizedRelative } = pathRes.value;

  return {
    auth,
    space,
    normalizedGcsPath,
    normalizedRelative,
  };
}

app.get("/:rel{.+}", withSpace({ requireCanRead: true }), async (ctx) => {
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

app.patch(
  "/:rel{.+}",
  withSpace({ requireCanRead: true }),
  async (ctx): HandlerResult<ProjectFileRelResponseBody> => {
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
  }
);

app.delete(
  "/:rel{.+}",
  withSpace({ requireCanRead: true }),
  async (ctx): HandlerResult<ProjectFileRelResponseBody> => {
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

app.post(
  "/:rel{.+}",
  withSpace({ requireCanWrite: true }),
  validate("json", MoveMountFileRequestBodySchema),
  async (c): HandlerResult<ProjectFileRelResponseBody> => {
    const space = c.get("space");
    const auth = c.get("auth");

    if (!space.isProject()) {
      return apiError(c, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "Files are only available for project spaces.",
        },
      });
    }

    const rel = c.req.param("rel");
    if (!isString(rel) || rel.length === 0) {
      return apiError(c, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "Missing file path.",
        },
      });
    }

    if (!space.canWrite(auth)) {
      return apiError(c, {
        status_code: 403,
        api_error: {
          type: "workspace_auth_error",
          message: "You do not have write access to this project.",
        },
      });
    }

    const { destRelativeFilePath } = c.req.valid("json");

    const moveResult = await moveProjectFile(auth, {
      space,
      sourcePath: rel,
      destRelativeFilePath,
    });
    if (moveResult.isErr()) {
      if (isResolveMountFilePathError(moveResult.error)) {
        const { code, message } = moveResult.error;
        return apiError(c, {
          status_code: code === "outside_scope" ? 403 : 400,
          api_error: {
            type:
              code === "outside_scope"
                ? "workspace_auth_error"
                : "invalid_request_error",
            message,
          },
        });
      }
      return apiError(c, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: normalizeError(moveResult.error).message,
        },
      });
    }

    return c.json({});
  }
);

export default app;
