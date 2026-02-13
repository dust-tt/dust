import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { enrichProjectsWithMetadata } from "@app/lib/api/projects/list";
import type { Authenticator } from "@app/lib/auth";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { ProjectType } from "@app/types/space";
import type { NextApiRequest, NextApiResponse } from "next";
import z from "zod";

const SpacesLookupQuerySchema = z.object({
  ids: z.union([z.string(), z.array(z.string())]),
});

export type SpacesLookupResponseBody = {
  spaces: ProjectType[];
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

      const projectsWithDescriptions = await enrichProjectsWithMetadata(
        auth,
        openProjects
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
