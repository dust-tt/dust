import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { getServerTypeAndIdFromSId } from "@app/lib/actions/mcp_helper";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { checkConnectionOwnership } from "@app/lib/api/oauth";
import type { Authenticator } from "@app/lib/auth";
import type { MCPServerConnectionType } from "@app/lib/resources/mcp_server_connection_resource";
import { MCPServerConnectionResource } from "@app/lib/resources/mcp_server_connection_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";
import { OauthProviderCodec } from "@app/types";

const PostConnectionBodySchema = t.type({
  connectionId: t.string,
  mcpServerId: t.string,
  provider: OauthProviderCodec,
});
export type PostConnectionBodyType = t.TypeOf<typeof PostConnectionBodySchema>;

export type PostConnectionResponseBody = {
  success: boolean;
  connection: MCPServerConnectionType;
};

export type GetConnectionsResponseBody = {
  connections: MCPServerConnectionType[];
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<
      PostConnectionResponseBody | GetConnectionsResponseBody
    >
  >,
  auth: Authenticator
): Promise<void> {
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
      const { connectionId, mcpServerId, provider } = validatedBody;

      if (connectionId) {
        const checkConnectionOwnershipRes = await checkConnectionOwnership(
          auth,
          provider,
          connectionId
        );
        if (checkConnectionOwnershipRes.isErr()) {
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: "Failed to get the access token for the connector.",
            },
          });
        }
      }

      const { serverType, id } = getServerTypeAndIdFromSId(mcpServerId);

      const connectionResource = await MCPServerConnectionResource.makeNew(
        auth,
        {
          connectionId,
          connectionType: "workspace",
          serverType,
          internalMCPServerId: serverType === "internal" ? mcpServerId : null,
          remoteMCPServerId: serverType === "remote" ? id : null,
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
