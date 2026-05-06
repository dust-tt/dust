/** @ignoreswagger */
import { withSessionAuthenticationForPoke } from "@app/lib/api/auth_wrappers";
import { Authenticator } from "@app/lib/auth";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { ProjectMetadataResource } from "@app/lib/resources/project_metadata_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { SpaceType } from "@app/types/space";
import type { NextApiRequest, NextApiResponse } from "next";

export type PokeProjectType = SpaceType & {
  description: string | null;
  archivedAt: number | null;
  todoGenerationEnabled: boolean;
};

export type PokeListProjects = {
  projects: PokeProjectType[];
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<PokeListProjects>>,
  session: SessionWithUser
): Promise<void> {
  const { wId } = req.query;
  if (typeof wId !== "string") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "workspace_not_found",
        message: "Workspace not found.",
      },
    });
  }

  const auth = await Authenticator.fromSuperUserSession(session, wId);

  const owner = auth.workspace();
  if (!owner || !auth.isDustSuperUser()) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "workspace_not_found",
        message: "Workspace not found.",
      },
    });
  }

  switch (req.method) {
    case "GET":
      const projectSpaces = await SpaceResource.listProjectSpaces(auth);

      const metadataResources = await ProjectMetadataResource.fetchBySpaceIds(
        auth,
        projectSpaces.map((s) => s.id)
      );
      const metadataBySpaceId = new Map(
        metadataResources.map((m) => [m.spaceId, m])
      );

      const projects: PokeProjectType[] = projectSpaces.map((space) => {
        const metadata = metadataBySpaceId.get(space.id);
        return {
          ...space.toJSON(),
          description: metadata?.description ?? null,
          archivedAt: metadata?.archivedAt?.getTime() ?? null,
          todoGenerationEnabled: metadata?.todoGenerationEnabled ?? false,
        };
      });

      return res.status(200).json({ projects });

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

export default withSessionAuthenticationForPoke(handler);
