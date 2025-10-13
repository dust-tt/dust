import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { updateMCPServerHeartbeat } from "@app/lib/api/actions/mcp/client_side_registry";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";

const PostMCPHeartbeatRequestBodyCodec = t.type({
  serverId: t.string,
});

export type PostMCPHeartbeatRequestBody = t.TypeOf<
  typeof PostMCPHeartbeatRequestBodyCodec
>;

interface MCPServerHeartbeatSuccess {
  expiresAt: string;
  success: true;
}

interface MCPServerHeartbeatFailure {
  success: false;
}

export type HeartbeatMCPResponseType =
  | MCPServerHeartbeatSuccess
  | MCPServerHeartbeatFailure;

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
  if (isLeft(bodyValidation)) {
    const pathError = reporter.formatValidationErrors(bodyValidation.left);
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: `Invalid server id: ${pathError}`,
      },
    });
  }

  const { serverId } = bodyValidation.right;

  // Update the heartbeat for the server.
  const result = await updateMCPServerHeartbeat(auth, {
    serverId,
    workspaceId: auth.getNonNullableWorkspace().sId,
  });

  if (!result) {
    // Return 200 with success: false instead of a 4xx error to avoid triggering monitoring alerts
    // for expected conditions (expired/terminated connections).
    res.status(200).json({
      success: false,
    });
    return;
  }

  res.status(200).json(result);
}

export default withSessionAuthenticationForWorkspace(handler);
