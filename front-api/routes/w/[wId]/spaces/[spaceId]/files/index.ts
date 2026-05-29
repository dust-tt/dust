import { DustFileSystem } from "@app/lib/api/file_system/dust_file_system";
import type { FileSystemEntry } from "@app/lib/api/file_system/types";
import { SCOPED_PREFIX_POD } from "@app/lib/api/file_system/types";
import { isGCSMountDirectoryAlreadyExistsError } from "@app/lib/api/files/gcs_mount/errors";
import type { GCSMountDirectoryEntry } from "@app/lib/api/files/gcs_mount/files";
import { enrichListWithFileResourceIds } from "@app/lib/api/files/file_system_ops";
import { createProjectFolder } from "@app/lib/api/projects/context";
import { PostPodFolderRequestBodySchema } from "@app/lib/api/projects/pod_mount_schemas";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { withSpace } from "@front-api/middlewares/with_space";

import rel from "./[...rel]";

export type { GCSMountDirectoryEntry };
export type { FileSystemEntry };

export type GetSpaceFilesResponseBody = {
  files: FileSystemEntry[];
};

export type PostSpaceFolderResponseBody = {
  folder: GCSMountDirectoryEntry;
};

// Mounted under /api/w/:wId/spaces/:spaceId/files.
const app = workspaceApp();

app.get(
  "/",
  withSpace({ requireCanRead: true }),
  async (ctx): HandlerResult<GetSpaceFilesResponseBody> => {
    const auth = ctx.get("auth");
    const space = ctx.get("space");

    if (!space.isProject()) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "Files are only available for Pod spaces.",
        },
      });
    }

    const fsResult = await DustFileSystem.forPod(auth, space);
    if (fsResult.isErr()) {
      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: "Failed to initialise file system.",
        },
      });
    }

    const dustFs = fsResult.value;
    const files = await enrichListWithFileResourceIds(
      auth,
      dustFs,
      await dustFs.list(`${SCOPED_PREFIX_POD}${space.sId}`)
    );

    return ctx.json({ files });
  }
);

app.post(
  "/",
  withSpace({ requireCanRead: true }),
  validate("json", PostPodFolderRequestBodySchema),
  async (c): HandlerResult<PostSpaceFolderResponseBody> => {
    const auth = c.get("auth");
    const space = c.get("space");

    if (!space.isProject()) {
      return apiError(c, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "Files are only available for Pod spaces.",
        },
      });
    }

    if (!space.canWrite(auth)) {
      return apiError(c, {
        status_code: 403,
        api_error: {
          type: "workspace_auth_error",
          message: "You do not have write access to this Pod.",
        },
      });
    }

    const { folderName, parentRelativePath } = c.req.valid("json");

    const createResult = await createProjectFolder(auth, {
      space,
      folderName,
      parentRelativePath,
    });
    if (createResult.isErr()) {
      return apiError(c, {
        status_code: isGCSMountDirectoryAlreadyExistsError(createResult.error)
          ? 409
          : 400,
        api_error: {
          type: "invalid_request_error",
          message: createResult.error.message,
        },
      });
    }

    return c.json({ folder: createResult.value }, 201);
  }
);

// Catch-all wildcard for /files/<...rel>. Registered AFTER `/` to avoid
// swallowing requests to the bare /files endpoint.
app.route("/", rel);

export default app;
