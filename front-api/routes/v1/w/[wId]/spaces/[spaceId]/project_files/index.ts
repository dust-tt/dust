import {
  type GCSMountEntry,
  getConversationFileMountSignedUrl,
  getGCSPathFromScopedPath,
  listGCSMountFiles,
} from "@app/lib/api/files/gcs_mount/files";
import { getPodFilesBasePath } from "@app/lib/api/files/mount_path";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { publicApiApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

export type GetSpaceGCSMountFilesResponseType = {
  files: GCSMountEntry[];
};

const ParamsSchema = z.object({
  spaceId: z.string(),
});

const QuerySchema = z.object({
  updatedSince: z.string().optional(),
});

/**
 * @ignoreswagger
 * System API key only endpoint. Undocumented.
 */

// Mounted at /api/v1/w/:wId/spaces/:spaceId/project_files.
const app = publicApiApp();

app.get(
  "/",
  validate("param", ParamsSchema),
  validate("query", QuerySchema),
  async (ctx): HandlerResult<GetSpaceGCSMountFilesResponseType> => {
    const auth = ctx.get("auth");

    if (!auth.isSystemKey()) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "invalid_oauth_token_error",
          message: "Only system keys are allowed to use this endpoint.",
        },
      });
    }

    const { spaceId } = ctx.req.valid("param");

    const space = await SpaceResource.fetchById(auth, spaceId);
    if (!space) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "space_not_found",
          message: "Space not found.",
        },
      });
    }

    if (!space.isProject()) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message:
            "GCS mount files listing is only available for project spaces.",
        },
      });
    }

    const { updatedSince } = ctx.req.valid("query");
    const updatedSinceMs =
      updatedSince !== undefined ? parseInt(updatedSince, 10) : null;
    const updatedSinceFilter =
      updatedSinceMs !== null && !Number.isNaN(updatedSinceMs)
        ? updatedSinceMs
        : null;

    let files = await listGCSMountFiles(auth, {
      useCase: "pod",
      podId: space.sId,
    });

    if (updatedSinceFilter !== null) {
      files = files.filter((e) => e.lastModifiedMs >= updatedSinceFilter);
    }

    const owner = auth.getNonNullableWorkspace();
    const gcsPrefix = getPodFilesBasePath({
      workspaceId: owner.sId,
      podId: space.sId,
    });

    const filesWithSignedUrls = await concurrentExecutor(
      files,
      async (entry) => {
        if (entry.isDirectory) {
          return entry;
        }
        const gcsPath = getGCSPathFromScopedPath({
          prefix: gcsPrefix,
          scopedPath: entry.path,
          useCase: "pod",
        });
        if (!gcsPath) {
          return { ...entry, signedDownloadUrl: null };
        }
        const signed = await getConversationFileMountSignedUrl(
          auth,
          { useCase: "pod", podId: space.sId },
          gcsPath
        );
        return {
          ...entry,
          signedDownloadUrl: signed.isOk() ? signed.value : null,
        };
      },
      { concurrency: 8 }
    );

    return ctx.json({ files: filesWithSignedUrls });
  }
);

export default app;
