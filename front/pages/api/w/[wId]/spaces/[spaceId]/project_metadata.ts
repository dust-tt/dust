import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { withResourceFetchingFromRoute } from "@app/lib/api/resource_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { ProjectMetadataResource } from "@app/lib/resources/project_metadata_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { apiError } from "@app/logger/withlogging";
import { PatchProjectMetadataBodySchema } from "@app/types/api/internal/spaces";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { ProjectMetadataType } from "@app/types/project_metadata";

export type GetProjectMetadataResponseBody = {
  projectMetadata: ProjectMetadataType | null;
};

export type PatchProjectMetadataResponseBody = {
  projectMetadata: ProjectMetadataType;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<
      GetProjectMetadataResponseBody | PatchProjectMetadataResponseBody
    >
  >,
  auth: Authenticator,
  { space }: { space: SpaceResource }
): Promise<void> {
  // Only project spaces can have metadata
  if (!space.isProject()) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Project metadata is only available for project spaces.",
      },
    });
  }

  switch (req.method) {
    case "GET": {
      const metadata = await ProjectMetadataResource.fetchBySpace(auth, space);
      return res.status(200).json({
        projectMetadata: metadata ? metadata.toJSON() : null,
      });
    }

    case "PATCH": {
      if (!space.canAdministrate(auth)) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "workspace_auth_error",
            message: "Only project members can update project metadata.",
          },
        });
      }

      const bodyValidation = PatchProjectMetadataBodySchema.safeParse(req.body);
      if (!bodyValidation.success) {
        const errorMessage = bodyValidation.error.errors
          .map((e) => `${e.path.join(".")}: ${e.message}`)
          .join(", ");
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid request body: ${errorMessage}`,
          },
        });
      }

      const body = bodyValidation.data;

      let metadata = await ProjectMetadataResource.fetchBySpace(auth, space);

      if (!metadata) {
        // Create new metadata
        metadata = await ProjectMetadataResource.makeNew(auth, space, {
          description: body.description ?? null,
        });
      } else {
        // Update existing metadata
        await metadata.updateMetadata(body);
      }

      return res.status(200).json({
        projectMetadata: metadata.toJSON(),
      });
    }

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, GET or PATCH expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(
  withResourceFetchingFromRoute(handler, {
    space: { requireCanReadOrAdministrate: true },
  })
);
