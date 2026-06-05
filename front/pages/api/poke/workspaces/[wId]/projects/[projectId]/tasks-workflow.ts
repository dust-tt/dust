/** @ignoreswagger */
// @migration-status: MIGRATED_TO_HONO
import { withSessionAuthenticationForPoke } from "@app/lib/api/auth_wrappers";
import config from "@app/lib/api/config";
import type {
  PokeGetProjectWorkflow,
  PokeProjectWorkflowInfo,
} from "@app/lib/api/poke/projects";
import { Authenticator } from "@app/lib/auth";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { ProjectMetadataResource } from "@app/lib/resources/project_metadata_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import {
  describeTemporalWorkflow,
  getTemporalClientForFrontNamespace,
} from "@app/lib/temporal";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import { isString } from "@app/types/shared/utils/general";
import type { NextApiRequest, NextApiResponse } from "next";

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<PokeGetProjectWorkflow>>,
  session: SessionWithUser
): Promise<void> {
  const { wId, projectId } = req.query;
  if (!isString(wId) || !isString(projectId)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid workspace or project ID.",
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
      const space = await SpaceResource.fetchById(auth, projectId);
      if (!space || !space.isProject()) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "space_not_found",
            message: "Project not found.",
          },
        });
      }

      const metadata = await ProjectMetadataResource.fetchBySpace(auth, space);
      const workflowId = `project-todo-${owner.sId}-${space.sId}`;

      const temporalClient = await getTemporalClientForFrontNamespace();

      const description = await describeTemporalWorkflow(temporalClient, {
        workflowId,
      });
      const latestWorkflow: PokeProjectWorkflowInfo | null = description
        ? {
            workflowId,
            runId: description.runId,
            status: description.status.name,
            startTime: description.startTime?.getTime() ?? null,
            closeTime: description.closeTime?.getTime() ?? null,
          }
        : null;

      return res.status(200).json({
        metadata: metadata ? metadata.toJSON() : null,
        temporalNamespace: config.getTemporalFrontNamespace() ?? "",
        workflowId,
        latestWorkflow,
      });

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
