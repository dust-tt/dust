import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { getServerTypeAndIdFromSId } from "@app/lib/actions/mcp_helper";
import { getInternalMCPServerNameAndWorkspaceId } from "@app/lib/actions/mcp_internal_actions/constants";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import apiConfig from "@app/lib/api/config";
import { checkConnectionOwnership } from "@app/lib/api/oauth";
import type { Authenticator } from "@app/lib/auth";
import type { MCPServerConnectionType } from "@app/lib/resources/mcp_server_connection_resource";
import {
  isMCPServerConnectionConnectionType,
  MCPServerConnectionResource,
} from "@app/lib/resources/mcp_server_connection_resource";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";
import { OAuthAPI, SnowflakeKeyPairCredentialsSchema } from "@app/types";

const PostConnectionOAuthBodySchema = t.type({
  connectionId: t.string,
  mcpServerId: t.string,
});

const PostConnectionCredentialsBodySchema = t.type({
  credentialId: t.string,
  mcpServerId: t.string,
});

const PostConnectionBodySchema = t.union([
  PostConnectionOAuthBodySchema,
  PostConnectionCredentialsBodySchema,
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
      const mcpServerId = validatedBody.mcpServerId;

      const { serverType, id } = getServerTypeAndIdFromSId(mcpServerId);

      let connectionId: string | null = null;
      let credentialId: string | null = null;

      if ("connectionId" in validatedBody) {
        connectionId = validatedBody.connectionId;
        const checkConnectionOwnershipRes = await checkConnectionOwnership(
          auth,
          connectionId
        );
        if (checkConnectionOwnershipRes.isErr()) {
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: "Failed to get the access token for the MCP server.",
            },
          });
        }
      } else if ("credentialId" in validatedBody) {
        if (connectionType !== "workspace") {
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message:
                "Credential-backed MCP server connections are only supported for workspace connections.",
            },
          });
        }

        if (serverType !== "internal") {
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message:
                "Credential-backed MCP server connections are only supported for internal MCP servers.",
            },
          });
        }

        const internalServerNameRes =
          getInternalMCPServerNameAndWorkspaceId(mcpServerId);
        if (internalServerNameRes.isErr()) {
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: internalServerNameRes.error.message,
            },
          });
        }

        if (internalServerNameRes.value.name !== "snowflake") {
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message:
                "Credential-backed MCP server connections are only supported for the Snowflake internal server.",
            },
          });
        }

        credentialId = validatedBody.credentialId;

        const oauthApi = new OAuthAPI(apiConfig.getOAuthAPIConfig(), logger);
        const credentialRes = await oauthApi.getCredentials({
          credentialsId: credentialId,
        });

        if (credentialRes.isErr()) {
          return apiError(req, res, {
            status_code: 404,
            api_error: {
              type: "connector_credentials_not_found",
              message: "The credential you requested was not found.",
            },
          });
        }

        const owner = auth.getNonNullableWorkspace();
        const { credential } = credentialRes.value;

        if (credential.metadata.workspace_id !== owner.sId) {
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message:
                "The credential you requested does not belong to your workspace.",
            },
          });
        }

        if (credential.provider !== "snowflake") {
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: "The credential provided is not a Snowflake credential.",
            },
          });
        }

        const keyPairValidation = SnowflakeKeyPairCredentialsSchema.decode(
          credential.content
        );
        if (isLeft(keyPairValidation)) {
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message:
                "The credential provided must be a Snowflake key-pair credential.",
            },
          });
        }
      }

      const connectionResource = await MCPServerConnectionResource.makeNew(
        auth,
        {
          connectionId,
          credentialId,
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
