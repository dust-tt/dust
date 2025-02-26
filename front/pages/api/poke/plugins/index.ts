import type { WithAPIErrorResponse } from "@dust-tt/types";
import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthentication } from "@app/lib/api/auth_wrappers";
import { pluginManager } from "@app/lib/api/poke/plugin_manager";
import type { PluginListItem } from "@app/lib/api/poke/types";
import { Authenticator } from "@app/lib/auth";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { apiError } from "@app/logger/withlogging";

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
  const auth = await Authenticator.fromSuperUserSession(session, null);
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
      const { resourceType, resourceId } = req.query;
      if (typeof resourceType !== "string") {
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

      const plugins = pluginManager.getPluginsForResourceType(resourceType);

      const visiblePluginResults = await Promise.all(
        plugins.map((p) => !resourceId || p.isVisible(auth, resourceId))
      );

      const pluginList = plugins
        .filter((_, i) => visiblePluginResults[i])
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

export default withSessionAuthentication(handler);
