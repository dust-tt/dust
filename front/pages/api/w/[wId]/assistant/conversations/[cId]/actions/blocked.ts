import type { NextApiRequest, NextApiResponse } from "next";

import type { BlockedToolExecution } from "@app/lib/actions/mcp";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";
import { isString } from "@app/types";

export type GetBlockedActionsResponseType = {
  blockedActions: BlockedToolExecution[];
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetBlockedActionsResponseType>>,
  auth: Authenticator
): Promise<void> {
  if (req.method !== "GET") {
    return apiError(req, res, {
      status_code: 405,
      api_error: {
        type: "method_not_supported_error",
        message: "The method is not supported.",
      },
    });
  }

  const { cId } = req.query;

  if (!cId || !isString(cId)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "The conversation ID is required.",
      },
    });
  }

  const blockedActions =
    await AgentMCPActionResource.listBlockedActionsForConversation(auth, cId);

  res.status(200).json({ blockedActions });
}

export default withSessionAuthenticationForWorkspace(handler);
