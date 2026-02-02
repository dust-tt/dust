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
import { OAuthAPI } from "@app/types";

const PostConnectionBodySchema = t.intersection([
  t.type({
    mcpServerId: t.string,
  }),
  t.partial({
    connectionId: t.string,
    credentialId: t.string,
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
      if (connectionType === "workspace" && !auth.isAdmin()) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "app_auth_error",
            message:
              "Only workspace admins can create workspace-wide MCP server connections.",
          },
        });
      }

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

      if (!connectionId && !credentialId) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "Missing authentication reference.",
          },
        });
      }

      if (connectionId && credentialId) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "Provide either connectionId or credentialId, not both.",
          },
        });
      }

      if (connectionType === "personal" && credentialId) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "Personal MCP server connections are OAuth-only.",
          },
        });
      }

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
              message: "Failed to get the access token for the MCP server.",
            },
          });
        }
      }

      const { serverType, id } = getServerTypeAndIdFromSId(mcpServerId);

      if (credentialId) {
        if (serverType !== "internal" || connectionType !== "workspace") {
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message:
                "Key-pair authentication is only supported for workspace connections to the internal Snowflake MCP server.",
            },
          });
        }

        const internalServerRes =
          getInternalMCPServerNameAndWorkspaceId(mcpServerId);
        if (
          internalServerRes.isErr() ||
          internalServerRes.value.name !== "snowflake" ||
          internalServerRes.value.workspaceModelId !==
            auth.getNonNullableWorkspace().id
        ) {
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message:
                "Key-pair authentication is only supported for the internal Snowflake MCP server.",
            },
          });
        }

        const oauthApi = new OAuthAPI(apiConfig.getOAuthAPIConfig(), logger);
        const credentialRes = await oauthApi.getCredentials({
          credentialsId: credentialId,
        });

        if (
          credentialRes.isErr() ||
          credentialRes.value.credential.metadata.user_id !==
            auth.getNonNullableUser().sId ||
          credentialRes.value.credential.metadata.workspace_id !==
            auth.getNonNullableWorkspace().sId ||
          credentialRes.value.credential.provider !== "snowflake"
        ) {
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: "Invalid credential.",
            },
          });
        }

        const content = credentialRes.value.credential.content;
        if (!("private_key" in content)) {
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message:
                "The provided credential is not a Snowflake key-pair credential.",
            },
          });
        }
      }

      const connectionResource = await MCPServerConnectionResource.makeNew(
        auth,
        {
          connectionId: connectionId ?? null,
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
