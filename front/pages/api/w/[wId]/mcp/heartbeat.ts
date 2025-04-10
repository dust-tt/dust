import type { HeartbeatMCPResponseType } from "@dust-tt/client";
import type { NextApiRequest, NextApiResponse } from "next";

import { updateMCPServerHeartbeat } from "@app/lib/api/actions/mcp/local_registry";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";
import { isValidUUIDv4 } from "@app/types";

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<HeartbeatMCPResponseType>>,
  auth: Authenticator
): Promise<void> {
  // Extract the client-provided server ID.
  const { serverId } = req.body;
  if (typeof serverId !== "string" || !isValidUUIDv4(serverId)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid server ID format. Must be a valid UUID.",
      },
    });
  }

  // Update the heartbeat for the server.
  const result = await updateMCPServerHeartbeat({
    auth,
    workspaceId: auth.getNonNullableWorkspace().sId,
    serverId,
  });

  if (!result) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "mcp_server_connection_not_found",
        message: "MCP server not registered or expired",
      },
    });
  }

  res.status(200).json(result);
}

export default withSessionAuthenticationForWorkspace(handler);
