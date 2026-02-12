import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { FileResource } from "@app/lib/resources/file_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { FileTypeWithMetadata } from "@app/types/files";
import { isString } from "@app/types/shared/utils/general";

export type FileWithCreatorType = FileTypeWithMetadata & {
  createdAt: number;
  updatedAt: number;
  user: {
    sId: string;
    name: string | null;
    imageUrl: string | null;
  } | null;
};

export type GetProjectFilesResponseBody = {
  files: FileWithCreatorType[];
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetProjectFilesResponseBody>>,
  auth: Authenticator
): Promise<void> {
  const { spaceId } = req.query;
  if (!isString(spaceId)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid spaceId query parameter.",
      },
    });
  }

  const space = await SpaceResource.fetchById(auth, spaceId);
  if (!space || !space.canRead(auth)) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "space_not_found",
        message: "Space not found.",
      },
    });
  }

  switch (req.method) {
    case "GET": {
      const files = await FileResource.listByProject(auth, {
        projectId: spaceId,
      });

      // Fetch user information for all files
      const userIds = files
        .map((f) => f.userId)
        .filter((id): id is number => id !== null);
      const uniqueUserIds = Array.from(new Set(userIds));
      const users = await UserResource.fetchByModelIds(uniqueUserIds);
      const userMap = new Map(users.map((u) => [u.id, u]));

      const filesWithMetadata: FileWithCreatorType[] = files.map((f) => {
        const user = f.userId ? userMap.get(f.userId) : null;
        return {
          sId: f.sId,
          id: f.sId, // For FileType compatibility
          fileName: f.fileName,
          fileSize: f.fileSize,
          contentType: f.contentType,
          status: f.status,
          version: f.version,
          useCase: f.useCase,
          useCaseMetadata: f.useCaseMetadata ?? {},
          createdAt: f.createdAt.getTime(),
          updatedAt: f.updatedAt.getTime(),
          user: user
            ? {
                sId: user.sId,
                name: user.fullName() || user.username,
                imageUrl: user.imageUrl,
              }
            : null,
        };
      });

      res.status(200).json({ files: filesWithMetadata });
      return;
    }

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "Method not supported.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(handler);
