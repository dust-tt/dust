import type { NextApiRequest, NextApiResponse } from "next";

import {
  getAgentConfiguration,
  restoreAgentConfiguration,
} from "@app/lib/api/assistant/configuration/agent";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";

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
      const agentConfiguration = await getAgentConfiguration(auth, {
        agentId: req.query.aId as string,
        variant: "light",
      });
      if (
        !agentConfiguration ||
        (!agentConfiguration.canEdit && !auth.isAdmin())
      ) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "agent_configuration_not_found",
            message: "Could not find the agent configuration.",
          },
        });
      }

      const restoredResult = await restoreAgentConfiguration(
        auth,
        agentConfiguration.sId
      );

      if (!restoredResult.isOk() || !restoredResult.value.restored) {
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
