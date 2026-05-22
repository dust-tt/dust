import { getServerTypeAndIdFromSId } from "@app/lib/actions/mcp_helper";
import { getInternalMCPServerNameAndWorkspaceId } from "@app/lib/actions/mcp_internal_actions/constants";
import { getInternalServerCredentialPolicy } from "@app/lib/actions/mcp_server_connection_credential_policies";
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
import type { APIErrorWithStatusCode } from "@app/types/error";
import { OAuthAPI } from "@app/types/oauth/oauth_api";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

import connection from "./[cId]";

const PostConnectionOAuthBodySchema = z.object({
  connectionId: z.string(),
  mcpServerId: z.string(),
});

const PostConnectionCredentialsBodySchema = z.object({
  credentialId: z.string(),
  mcpServerId: z.string(),
});

const PostConnectionBodySchema = z.union([
  PostConnectionOAuthBodySchema,
  PostConnectionCredentialsBodySchema,
]);

export type PostConnectionBodyType = z.infer<typeof PostConnectionBodySchema>;

// Wire shape: ctx.json serializes Date to ISO string, so the response type
// must reflect that to satisfy HandlerResult<T>.
type MCPServerConnectionWire = Omit<
  MCPServerConnectionType,
  "createdAt" | "updatedAt"
> & {
  createdAt: string;
  updatedAt: string;
};

export type PostConnectionResponseBody = {
  success: boolean;
  connection: MCPServerConnectionWire;
};

export type GetConnectionsResponseBody = {
  connections: MCPServerConnectionWire[];
};

type PostConnectionAuthReference =
  | { kind: "oauth_connection"; connectionId: string }
  | { kind: "credential"; credentialId: string };

function makeInvalidRequestError(message: string): APIErrorWithStatusCode {
  return {
    status_code: 400,
    api_error: { type: "invalid_request_error", message },
  };
}

function makeCredentialNotFoundError(): APIErrorWithStatusCode {
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
  return { kind: "credential", credentialId: validatedBody.credentialId };
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
): Promise<APIErrorWithStatusCode | null> {
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
): Promise<APIErrorWithStatusCode | null> {
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

// Mounted under /api/w/:wId/mcp/connections/:connectionType.
const app = workspaceApp();

app.get("/", async (ctx): HandlerResult<GetConnectionsResponseBody> => {
  const connectionType = ctx.req.param("connectionType");
  if (!isMCPServerConnectionConnectionType(connectionType)) {
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid connection type",
      },
    });
  }

  const auth = ctx.get("auth");
  const connections = await MCPServerConnectionResource.listByWorkspace(auth, {
    connectionType,
  });
  return ctx.json({ connections: connections.map((c) => c.toJSON()) });
});

app.post(
  "/",
  validate("json", PostConnectionBodySchema),
  async (ctx): HandlerResult<PostConnectionResponseBody> => {
    const connectionType = ctx.req.param("connectionType");
    if (!isMCPServerConnectionConnectionType(connectionType)) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "Invalid connection type",
        },
      });
    }

    const auth = ctx.get("auth");
    const validatedBody = ctx.req.valid("json");
    const mcpServerId = validatedBody.mcpServerId;
    const authReference = getAuthReferenceFromBody(validatedBody);

    const { serverType, id } = getServerTypeAndIdFromSId(mcpServerId);
    const err = await validateAuthReferenceForMCPConnection(auth, {
      authReference,
      mcpServerId,
      connectionType,
      serverType,
    });
    if (err) {
      return apiError(ctx, err);
    }

    const connectionResource = await MCPServerConnectionResource.makeNew(auth, {
      connectionId:
        authReference.kind === "oauth_connection"
          ? authReference.connectionId
          : null,
      credentialId:
        authReference.kind === "credential" ? authReference.credentialId : null,
      connectionType,
      serverType,
      internalMCPServerId: serverType === "internal" ? mcpServerId : null,
      remoteMCPServerId: serverType === "remote" ? id : null,
    });

    return ctx.json({ success: true, connection: connectionResource.toJSON() });
  }
);

app.route("/:cId", connection);

export default app;
