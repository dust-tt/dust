import type { NextApiRequest, NextApiResponse } from "next";

import type { MCPServersUsageByAgent } from "@app/lib/api/agent_actions";
import { getToolsUsage } from "@app/lib/api/agent_actions";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";

export type GetMCPServersUsageResponseBody = {
  usage: MCPServersUsageByAgent;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetMCPServersUsageResponseBody>>,
  auth: Authenticator
) {
  const { method } = req;

  switch (method) {
    case "GET": {
      const usage = await getToolsUsage(auth);
      return res.status(200).json({ usage });
    }
    default: {
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "Method not supported",
        },
      });
    }
  }
}

export default withSessionAuthenticationForWorkspace(handler);
