import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForPoke } from "@app/lib/api/auth_wrappers";
import { pluginManager } from "@app/lib/api/poke/plugin_manager";
import type { PluginListItem } from "@app/lib/api/poke/types";
import { fetchPluginResource } from "@app/lib/api/poke/utils";
import { Authenticator } from "@app/lib/auth";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";
import { isSupportedResourceType } from "@app/types";

export interface PokeListPluginsForScopeResponseBody {
  plugins: PluginListItem[];
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<PokeListPluginsForScopeResponseBody>
  >,
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
      const { resourceType, resourceId, workspaceId } = req.query;
      if (
        typeof resourceType !== "string" ||
        !isSupportedResourceType(resourceType)
      ) {
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
            message: "Invalid resource id type.",
          },
        });
      }

      if (workspaceId && typeof workspaceId !== "string") {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "Invalid workspace id type.",
          },
        });
      }

      // If the run targets a specific workspace, use a workspace-scoped authenticator.
      if (workspaceId) {
        auth = await Authenticator.fromSuperUserSession(session, workspaceId);
      }

      const plugins = pluginManager.getPluginsForResourceType(resourceType);

      const resource = resourceId
        ? await fetchPluginResource(auth, resourceType, resourceId)
        : null;

      const pluginList = plugins
        .filter((p) => !resourceId || p.isApplicableTo(auth, resource))
        .filter((p) => !p.manifest.isHidden)
        .map((p) => ({
          id: p.manifest.id,
          name: p.manifest.name,
          description: p.manifest.description,
        }));

      res.status(200).json({ plugins: pluginList });
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
