import type { NextApiRequest, NextApiResponse } from "next";
import z from "zod";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { ProjectMetadataResource } from "@app/lib/resources/project_metadata_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { SpaceType } from "@app/types/space";

const SpacesLookupQuerySchema = z.object({
  ids: z.union([z.string(), z.array(z.string())]),
});

export type SpacesLookupResponseBody = {
  spaces: SpaceType[];
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<SpacesLookupResponseBody>>,
  auth: Authenticator
): Promise<void> {
  switch (req.method) {
    case "GET": {
      const queryValidation = SpacesLookupQuerySchema.safeParse(req.query);
      if (!queryValidation.success) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "The query parameter `ids` is required.",
          },
        });
      }

      const rawIds = queryValidation.data.ids;
      const ids = Array.isArray(rawIds) ? rawIds : [rawIds];

      if (ids.length === 0) {
        return res.status(200).json({ spaces: [] });
      }

      const uniqueIds = Array.from(new Set(ids));
      const spaces = await SpaceResource.fetchByIds(auth, uniqueIds);
      const openProjects = spaces.filter(
        (space) => space.isProject() && space.canRead(auth)
      );

      // Fetch project metadata for projects to include description
      const projectsWithDescriptions = await concurrentExecutor(
        openProjects,
        async (space) => {
          const spaceJson = space.toJSON();

          const projectMetadata = await ProjectMetadataResource.fetchBySpace(
            auth,
            space
          );
          if (projectMetadata) {
            spaceJson.description = projectMetadata.description ?? undefined;
          }
          return spaceJson;
        },
        { concurrency: 8 }
      );

      return res.status(200).json({
        spaces: projectsWithDescriptions,
      });
    }

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, GET is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(handler);
