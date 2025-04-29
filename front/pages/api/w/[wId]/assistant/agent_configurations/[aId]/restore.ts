import type { NextApiRequest, NextApiResponse } from "next";

import {
  getAgentConfiguration,
  restoreAgentConfiguration,
} from "@app/lib/api/assistant/configuration";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";

export type RestoreAgentConfigurationResponseBody = {
  success: true;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<RestoreAgentConfigurationResponseBody>
  >,
  auth: Authenticator
): Promise<void> {
  switch (req.method) {
    case "POST":
      const agentConfiguration = await getAgentConfiguration(
        auth,
        req.query.aId as string,
        "light"
      );
      if (!agentConfiguration || !agentConfiguration.canEdit) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "agent_configuration_not_found",
            message: "Could not find the agent configuration.",
          },
        });
      }

      const restored = await restoreAgentConfiguration(
        auth,
        agentConfiguration.sId
      );

      if (!restored) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "Could not restore the agent configuration.",
          },
        });
      }

      return res.status(200).json({ success: true });
    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, POST is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(handler);
