import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { getServerTypeAndIdFromSId } from "@app/lib/actions/mcp_helper";
import { getInternalMCPServerNameAndWorkspaceId } from "@app/lib/actions/mcp_internal_actions/constants";
import { getInternalServerCredentialPolicy } from "@app/lib/actions/mcp_server_connection_credential_policies";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import apiConfig from "@app/lib/api/config";
import { checkConnectionOwnership } from "@app/lib/api/oauth";
import type { Authenticator } from "@app/lib/auth";
import type {
  MCPServerConnectionConnectionType,
  MCPServerConnectionType,
} from "@app/lib/resources/mcp_server_connection_resource";
import {
  isMCPServerConnectionConnectionType,
  MCPServerConnectionResource,
} from "@app/lib/resources/mcp_server_connection_resource";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import { OAuthAPI } from "@app/types/oauth/oauth_api";

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

type PostConnectionAuthReference =
  | {
      kind: "oauth_connection";
      connectionId: string;
    }
  | {
      kind: "credential";
      credentialId: string;
    };

type RouteAPIError = {
  status_code: number;
  api_error: {
    type: "invalid_request_error" | "connector_credentials_not_found";
    message: string;
  };
};

function makeInvalidRequestError(message: string): RouteAPIError {
  return {
    status_code: 400,
    api_error: {
      type: "invalid_request_error",
      message,
    },
  };
}

function makeCredentialNotFoundError(): RouteAPIError {
  return {
    status_code: 404,
    api_error: {
      type: "connector_credentials_not_found",
      message: "The credential you requested was not found.",
    },
  };
}

function getAuthReferenceFromBody(
  validatedBody: PostConnectionBodyType
): PostConnectionAuthReference {
  if ("connectionId" in validatedBody) {
    return {
      kind: "oauth_connection",
      connectionId: validatedBody.connectionId,
    };
  }

  return {
    kind: "credential",
    credentialId: validatedBody.credentialId,
  };
}

async function validateCredentialAuthReference(
  auth: Authenticator,
  {
    mcpServerId,
    connectionType,
    serverType,
    credentialId,
  }: {
    mcpServerId: string;
    connectionType: MCPServerConnectionConnectionType;
    serverType: ReturnType<typeof getServerTypeAndIdFromSId>["serverType"];
    credentialId: string;
  }
): Promise<RouteAPIError | null> {
  if (connectionType !== "workspace") {
    return makeInvalidRequestError(
      "Credential-backed MCP server connections are only supported for workspace connections."
    );
  }

  if (serverType !== "internal") {
    return makeInvalidRequestError(
      "Credential-backed MCP server connections are only supported for internal MCP servers."
    );
  }

  const internalServerNameRes =
    getInternalMCPServerNameAndWorkspaceId(mcpServerId);
  if (internalServerNameRes.isErr()) {
    return makeInvalidRequestError(internalServerNameRes.error.message);
  }

  const internalServerName = internalServerNameRes.value.name;
  const policy = getInternalServerCredentialPolicy(internalServerName);
  if (!policy) {
    return makeInvalidRequestError(
      "Credential-backed MCP server connections are not supported for this internal MCP server."
    );
  }

  const oauthApi = new OAuthAPI(apiConfig.getOAuthAPIConfig(), logger);
  const credentialRes = await oauthApi.getCredentials({
    credentialsId: credentialId,
  });
  if (credentialRes.isErr()) {
    return makeCredentialNotFoundError();
  }

  const owner = auth.getNonNullableWorkspace();
  const credential = credentialRes.value.credential;
  if (credential.metadata.workspace_id !== owner.sId) {
    return makeInvalidRequestError(
      "The credential you requested does not belong to your workspace."
    );
  }

  if (credential.provider !== policy.provider) {
    return makeInvalidRequestError(
      `The credential provided is not compatible with the ${internalServerName} internal MCP server.`
    );
  }

  if (!policy.validateContent(credential.content)) {
    return makeInvalidRequestError(policy.invalidContentMessage);
  }

  return null;
}

async function validateAuthReferenceForMCPConnection(
  auth: Authenticator,
  {
    authReference,
    mcpServerId,
    connectionType,
    serverType,
  }: {
    authReference: PostConnectionAuthReference;
    mcpServerId: string;
    connectionType: MCPServerConnectionConnectionType;
    serverType: ReturnType<typeof getServerTypeAndIdFromSId>["serverType"];
  }
): Promise<RouteAPIError | null> {
  if (authReference.kind === "oauth_connection") {
    const ownershipRes = await checkConnectionOwnership(
      auth,
      authReference.connectionId
    );
    if (ownershipRes.isErr()) {
      return makeInvalidRequestError(
        "Failed to get the access token for the MCP server."
      );
    }

    return null;
  }

  return validateCredentialAuthReference(auth, {
    mcpServerId,
    connectionType,
    serverType,
    credentialId: authReference.credentialId,
  });
}

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
      const authReference = getAuthReferenceFromBody(validatedBody);

      const { serverType, id } = getServerTypeAndIdFromSId(mcpServerId);
      const authReferenceValidationError =
        await validateAuthReferenceForMCPConnection(auth, {
          authReference,
          mcpServerId,
          connectionType,
          serverType,
        });

      if (authReferenceValidationError) {
        return apiError(req, res, authReferenceValidationError);
      }

      const connectionResource = await MCPServerConnectionResource.makeNew(
        auth,
        {
          connectionId:
            authReference.kind === "oauth_connection"
              ? authReference.connectionId
              : null,
          credentialId:
            authReference.kind === "credential"
              ? authReference.credentialId
              : null,
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
