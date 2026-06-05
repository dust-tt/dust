/** @ignoreswagger */
// @migration-status: MIGRATED_TO_HONO
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { DustFileSystem } from "@app/lib/api/file_system/dust_file_system";
import type {
  FileSystemEntry,
  GetSpaceFilesResponseBody,
  PostSpaceFolderResponseBody,
} from "@app/lib/api/file_system/types";
import { SCOPED_PREFIX_POD } from "@app/lib/api/file_system/types";
import { enrichListWithFileResourceIds } from "@app/lib/api/files/file_system_ops";
import { isGCSMountDirectoryAlreadyExistsError } from "@app/lib/api/files/gcs_mount/errors";
import type { GCSMountDirectoryEntry } from "@app/lib/api/files/gcs_mount/files";
import { createProjectFolder } from "@app/lib/api/projects/context";
import { PostPodFolderRequestBodySchema } from "@app/lib/api/projects/pod_mount_schemas";
import { withResourceFetchingFromRoute } from "@app/lib/api/resource_wrappers";
import type { Authenticator } from "@app/lib/auth";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { NextApiRequest, NextApiResponse } from "next";
import { fromError } from "zod-validation-error";

export type { FileSystemEntry, GCSMountDirectoryEntry };

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<
      GetSpaceFilesResponseBody | PostSpaceFolderResponseBody
    >
  >,
  auth: Authenticator,
  { space }: { space: SpaceResource }
): Promise<void> {
  if (!space.isProject()) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Files are only available for Pod spaces.",
      },
    });
  }

  switch (req.method) {
    case "GET": {
      const fsResult = await DustFileSystem.forPod(auth, space);
      if (fsResult.isErr()) {
        return apiError(req, res, {
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

      return res.status(200).json({ files });
    }

    case "POST": {
      if (!space.canWrite(auth)) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "workspace_auth_error",
            message: "You do not have write access to this project.",
          },
        });
      }

      const bodyValidation = PostPodFolderRequestBodySchema.safeParse(req.body);
      if (!bodyValidation.success) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid request body: ${fromError(bodyValidation.error).toString()}`,
          },
        });
      }

      const { folderName, parentRelativePath } = bodyValidation.data;

      const createResult = await createProjectFolder(auth, {
        space,
        folderName,
        parentRelativePath,
      });
      if (createResult.isErr()) {
        return apiError(req, res, {
          status_code: isGCSMountDirectoryAlreadyExistsError(createResult.error)
            ? 409
            : 400,
          api_error: {
            type: "invalid_request_error",
            message: createResult.error.message,
          },
        });
      }

      return res.status(201).json({ folder: createResult.value });
    }

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "Only GET and POST methods are supported.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(
  withResourceFetchingFromRoute(handler, {
    space: { requireCanRead: true },
  })
);
