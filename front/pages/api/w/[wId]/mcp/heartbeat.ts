import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import type { NextApiRequest, NextApiResponse } from "next";

import { updateMCPServerHeartbeat } from "@app/lib/api/actions/mcp/local_registry";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";
import { isValidUUIDv4 } from "@app/types";

const PostMCPHeartbeatRequestBodyCodec = t.type({
  serverId: t.string,
});

type HeartbeatMCPResponseType = {
  expiresAt: string;
  success: boolean;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<HeartbeatMCPResponseType>>,
  auth: Authenticator
): Promise<void> {
  if (req.method !== "POST") {
    return apiError(req, res, {
      status_code: 405,
      api_error: {
        type: "invalid_request_error",
        message: "Method not allowed.",
      },
    });
  }

  const bodyValidation = PostMCPHeartbeatRequestBodyCodec.decode(req.body);
  if (isLeft(bodyValidation) || !isValidUUIDv4(bodyValidation.right.serverId)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid server ID format. Must be a valid UUID.",
      },
    });
  }

  const { serverId } = bodyValidation.right;

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
