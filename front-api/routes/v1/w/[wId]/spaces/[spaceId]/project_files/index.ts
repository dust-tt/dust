import { DustFileSystem } from "@app/lib/api/file_system/dust_file_system";
import type { FileSystemEntry } from "@app/lib/api/file_system/types";
import { SCOPED_PREFIX_POD } from "@app/lib/api/file_system/types";
import { enrichListWithFileResourceIds } from "@app/lib/api/files/file_system_ops";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { publicApiApp } from "@front-api/middlewares/ctx";
import { ensureIsSystemKey } from "@front-api/middlewares/ensure_role";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

export type GetSpaceGCSMountFilesResponseType = {
  files: FileSystemEntry[];
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
  ensureIsSystemKey(),
  validate("param", ParamsSchema),
  validate("query", QuerySchema),
  async (ctx): HandlerResult<GetSpaceGCSMountFilesResponseType> => {
    const auth = ctx.get("auth");
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

    const fsResult = await DustFileSystem.forPod(auth, space);
    if (fsResult.isErr()) {
      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: "Failed to list project files.",
        },
      });
    }
    const dustFs = fsResult.value;

    let entries = await enrichListWithFileResourceIds(
      auth,
      dustFs,
      await dustFs.list(`${SCOPED_PREFIX_POD}${space.sId}`)
    );

    if (updatedSinceFilter !== null) {
      entries = entries.filter((e) => e.lastModifiedMs >= updatedSinceFilter);
    }

    const filesWithSignedUrls = await concurrentExecutor(
      entries,
      async (entry) => {
        if (entry.isDirectory) {
          return entry;
        }
        const urlResult = await dustFs.getDownloadUrl(entry.path);
        return {
          ...entry,
          signedDownloadUrl: urlResult.isOk() ? urlResult.value : null,
        };
      },
      { concurrency: 8 }
    );

    return ctx.json({ files: filesWithSignedUrls });
  }
);

export default app;
