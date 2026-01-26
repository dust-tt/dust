import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { getServerTypeAndIdFromSId } from "@app/lib/actions/mcp_helper";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import {
  checkConnectionOwnership,
  checkCredentialOwnership,
} from "@app/lib/api/oauth";
import type { Authenticator } from "@app/lib/auth";
import type { MCPServerConnectionType } from "@app/lib/resources/mcp_server_connection_resource";
import {
  isMCPServerConnectionConnectionType,
  MCPServerConnectionResource,
} from "@app/lib/resources/mcp_server_connection_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";

// Support both OAuth (connectionId) and key pair (credentialId) authentication.
// At least one must be provided, but not both.
const PostConnectionBodySchema = t.intersection([
  t.type({
    mcpServerId: t.string,
  }),
  t.partial({
    connectionId: t.string, // OAuth connection ID from OAuth API.
    credentialId: t.string, // Credential ID from Core (key pair auth).
  }),
]);
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
  if (!isMCPServerConnectionConnectionType(req.query.connectionType)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid connection type",
      },
    });
  }

  const connectionType = req.query.connectionType;

  switch (req.method) {
    case "GET":
      const connections = await MCPServerConnectionResource.listByWorkspace(
        auth,
        {
          connectionType,
        }
      );
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
      const { connectionId, credentialId, mcpServerId } = validatedBody;

      // Validate that exactly one of connectionId or credentialId is provided.
      if (!connectionId && !credentialId) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message:
              "Either connectionId (OAuth) or credentialId (key pair) must be provided.",
          },
        });
      }
      if (connectionId && credentialId) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message:
              "Cannot provide both connectionId (OAuth) and credentialId (key pair). Choose one authentication method.",
          },
        });
      }

      // Verify ownership of the connection or credential.
      if (connectionId) {
        const checkConnectionOwnershipRes = await checkConnectionOwnership(
          auth,
          connectionId
        );
        if (checkConnectionOwnershipRes.isErr()) {
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: "Failed to verify ownership of the OAuth connection.",
            },
          });
        }
      }
      if (credentialId) {
        const checkCredentialOwnershipRes = await checkCredentialOwnership(
          auth,
          credentialId
        );
        if (checkCredentialOwnershipRes.isErr()) {
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: "Failed to verify ownership of the credential.",
            },
          });
        }
      }

      const { serverType, id } = getServerTypeAndIdFromSId(mcpServerId);

      const connectionResource = await MCPServerConnectionResource.makeNew(
        auth,
        {
          // For OAuth: use connectionId, credentialId is null.
          // For key pair: use sentinel "keypair", credentialId stores the actual ID.
          connectionId: connectionId ?? "keypair",
          credentialId: credentialId ?? null,
          connectionType,
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
