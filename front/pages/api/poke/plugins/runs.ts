import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForPoke } from "@app/lib/api/auth_wrappers";
import { Authenticator } from "@app/lib/auth";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { PluginRunResource } from "@app/lib/resources/plugin_run_resource";
import { apiError } from "@app/logger/withlogging";
import type { PluginRunType, WithAPIErrorResponse } from "@app/types";

export interface PokeListPluginRunsResponseBody {
  pluginRuns: PluginRunType[];
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<PokeListPluginRunsResponseBody>>,
  session: SessionWithUser
): Promise<void> {
  let auth = await Authenticator.fromSuperUserSession(session, null);
  if (!auth.isDustSuperUser()) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "user_not_found",
        message: "Could not find the user.",
      },
    });
  }

  switch (req.method) {
    case "GET": {
      const { workspaceId, resourceType, resourceId } = req.query;

      if (workspaceId && typeof workspaceId !== "string") {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "Invalid workspace id type.",
          },
        });
      }

      if (resourceType && typeof resourceType !== "string") {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "Invalid resource type.",
          },
        });
      }

      if (resourceId && typeof resourceId !== "string") {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "Invalid resource id.",
          },
        });
      }

      // If the run targets a specific workspace, use a workspace-scoped authenticator.
      if (workspaceId) {
        auth = await Authenticator.fromSuperUserSession(session, workspaceId);
      }

      const pluginRuns = await PluginRunResource.findByWorkspaceId(auth);

      // Filter runs by resource type and ID if provided
      let filteredRuns = pluginRuns;
      if (resourceType) {
        filteredRuns = filteredRuns.filter((run) => {
          const runData = run.toJSON();
          if (resourceType === "global") {
            return runData.resourceType === "global" || !runData.resourceId;
          }
          return (
            runData.resourceType === resourceType &&
            (!resourceId || runData.resourceId === resourceId)
          );
        });
      }

      res
        .status(200)
        .json({ pluginRuns: filteredRuns.map((run) => run.toJSON()) });
      return;
    }

    default: {
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, POST is expected.",
        },
      });
    }
  }
}

export default withSessionAuthenticationForPoke(handler);
