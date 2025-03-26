import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import type { InternalMCPServerId } from "@app/lib/actions/mcp_internal_actions";
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
      | { success: boolean; connection: MCPServerConnectionType }
      | { connections: MCPServerConnectionType[] }
    >
  >,
  auth: Authenticator
): Promise<void> {
  const owner = auth.getNonNullableWorkspace();

  switch (req.method) {
    case "GET":
      const connections = await MCPServerConnectionResource.listByWorkspace({
        auth,
      });
      return res.status(200).json({
        connections: connections.map((c) => c.toJSON()),
      });
    case "POST":
      const bodyValidation = PostConnectionBodySchema.decode(req.body);
      if (isLeft(bodyValidation)) {
        const pathError = reporter.formatValidationErrors(bodyValidation.left);

        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid request body: ${pathError}`,
          },
        });
      }

      const validatedBody = bodyValidation.right;
      const { connectionId, internalMCPServerId } = validatedBody;

      const connectionResource = await MCPServerConnectionResource.makeNew(
        auth,
        {
          connectionId,
          connectionType: "workspace",
          serverType: "internal",
          internalMCPServerId: internalMCPServerId as InternalMCPServerId,
          workspaceId: owner.id,
        }
      );

      return res
        .status(200)
        .json({ success: true, connection: connectionResource.toJSON() });

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
