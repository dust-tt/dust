import * as t from "io-ts";
import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import type { MCPServerConnectionType } from "@app/lib/resources/mcp_server_connection_resource";
import { MCPServerConnectionResource } from "@app/lib/resources/mcp_server_connection_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";

export const PostConnectionBodySchema = t.type({
  connectionId: t.string,
  internalMCPServerId: t.string,
});

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<
      { success: boolean } | { connection: MCPServerConnectionType }
    >
  >,
  auth: Authenticator
): Promise<void> {
  const connectionResource = await MCPServerConnectionResource.fetchById(
    auth,
    req.query.cId as string
  );

  if (connectionResource.isErr()) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "mcp_server_connection_not_found",
        message: "Connection not found",
      },
    });
  }

  switch (req.method) {
    case "GET":
      return res
        .status(200)
        .json({ connection: connectionResource.value.toJSON() });
    case "DELETE":
      await connectionResource.value.delete(auth);

      return res.status(200).json({
        success: true,
      });
    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(handler);
