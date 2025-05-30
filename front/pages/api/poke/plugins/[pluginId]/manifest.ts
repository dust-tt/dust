import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForPoke } from "@app/lib/api/auth_wrappers";
import { pluginManager } from "@app/lib/api/poke/plugin_manager";
import { Authenticator } from "@app/lib/auth";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { apiError } from "@app/logger/withlogging";
import type {
  PluginArgs,
  PluginManifest,
  SupportedResourceType,
  WithAPIErrorResponse,
} from "@app/types";

export interface PokeGetPluginDetailsResponseBody {
  manifest: PluginManifest<PluginArgs, SupportedResourceType>;
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<PokeGetPluginDetailsResponseBody>>,
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
      const { pluginId } = req.query;
      if (typeof pluginId !== "string") {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "Missing `pluginId` in query.",
          },
        });
      }

      const plugin = pluginManager.getPluginById(pluginId);
      if (!plugin) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "plugin_not_found",
            message: "Could not find the plugin.",
          },
        });
      }

      res.status(200).json({ manifest: plugin.manifest });

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
