import type { RegisterMCPResponseType } from "@dust-tt/client";
import type { NextApiRequest, NextApiResponse } from "next";

import { registerMCPServer } from "@app/lib/api/actions/mcp/local_registry";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";
import { isValidUUIDv4 } from "@app/types";

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<RegisterMCPResponseType>>,
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

  // Register the server.
  const registration = await registerMCPServer({
    auth,
    workspaceId: auth.getNonNullableWorkspace().sId,
    serverId,
  });

  res.status(200).json(registration);
}

export default withSessionAuthenticationForWorkspace(handler);
