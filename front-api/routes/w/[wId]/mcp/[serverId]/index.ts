import type { CustomResourceIconType } from "@app/components/resources/resources_icons";
import {
  getServerTypeAndIdFromSId,
  requiresBearerTokenConfiguration,
} from "@app/lib/actions/mcp_helper";
import type {
  DeleteMCPServerResponseBody,
  GetMCPServerResponseBody,
  MCPServerType,
  MCPServerTypeWithViews,
  PatchMCPServerBody,
  PatchMCPServerResponseBody,
} from "@app/lib/api/mcp";
import { withWorkspaceConnectionRequirement } from "@app/lib/api/mcp_oauth_prerequisites";
import { PatchMCPServerBodySchema } from "@app/lib/api/mcp_schemas";
import type { Authenticator } from "@app/lib/auth";
import { InternalMCPServerInMemoryResource } from "@app/lib/resources/internal_mcp_server_in_memory_resource";
import { MCPServerConnectionResource } from "@app/lib/resources/mcp_server_connection_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { RemoteMCPServerResource } from "@app/lib/resources/remote_mcp_servers_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { headersArrayToRecord } from "@app/types/shared/utils/http_headers";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsUser } from "@front-api/middlewares/ensure_role";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import type { Context } from "hono";
import { z } from "zod";

import sync from "./sync";
import tools from "./tools";

const ParamsSchema = z.object({
  serverId: z.string(),
});

// Mounted under /api/w/:wId/mcp/:serverId.
const app = workspaceApp();

/** @ignoreswagger */
app.get(
  "/",
  validate("param", ParamsSchema),
  ensureIsUser(),
  async (ctx): HandlerResult<GetMCPServerResponseBody> => {
    const auth = ctx.get("auth");
    const { serverId } = ctx.req.valid("param");

    const { serverType, id } = getServerTypeAndIdFromSId(serverId);
    switch (serverType) {
      case "internal": {
        const systemSpace = await SpaceResource.fetchWorkspaceSystemSpace(auth);
        const server = await InternalMCPServerInMemoryResource.fetchById(
          auth,
          serverId,
          systemSpace
        );

        if (!server) {
          return apiError(ctx, {
            status_code: 404,
            api_error: {
              type: "data_source_not_found",
              message: "Internal MCP Server not found",
            },
          });
        }

        return ctx.json({ server: await enrichServer(auth, server.toJSON()) });
      }
      case "remote": {
        const server = await RemoteMCPServerResource.fetchById(auth, serverId);

        if (!server || server.id !== id) {
          return apiError(ctx, {
            status_code: 404,
            api_error: {
              type: "data_source_not_found",
              message: "Remote MCP Server not found",
            },
          });
        }

        return ctx.json({ server: await enrichServer(auth, server.toJSON()) });
      }
      default:
        return assertNever(serverType);
    }
  }
);

app.patch(
  "/",
  validate("param", ParamsSchema),
  ensureIsUser(),
  validate("json", PatchMCPServerBodySchema),
  async (ctx): HandlerResult<PatchMCPServerResponseBody> => {
    const auth = ctx.get("auth");
    const { serverId } = ctx.req.valid("param");
    const body = ctx.req.valid("json");

    const { serverType } = getServerTypeAndIdFromSId(serverId);

    if (serverType === "remote") {
      const remoteServer = await RemoteMCPServerResource.fetchById(
        auth,
        serverId
      );
      if (!remoteServer) {
        return apiError(ctx, {
          status_code: 404,
          api_error: {
            type: "mcp_server_not_found",
            message: "Remote MCP Server not found",
          },
        });
      }
      return handleRemotePatch(ctx, auth, remoteServer, body);
    }

    const systemSpace = await SpaceResource.fetchWorkspaceSystemSpace(auth);
    const internalServer = await InternalMCPServerInMemoryResource.fetchById(
      auth,
      serverId,
      systemSpace
    );
    if (!internalServer) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "mcp_server_not_found",
          message: "Internal MCP Server not found",
        },
      });
    }
    return handleInternalPatch(ctx, auth, internalServer, body);
  }
);

app.delete(
  "/",
  validate("param", ParamsSchema),
  ensureIsUser(),
  async (ctx): HandlerResult<DeleteMCPServerResponseBody> => {
    const auth = ctx.get("auth");
    const { serverId } = ctx.req.valid("param");

    const { serverType } = getServerTypeAndIdFromSId(serverId);

    const systemSpace = await SpaceResource.fetchWorkspaceSystemSpace(auth);

    const server =
      serverType === "remote"
        ? await RemoteMCPServerResource.fetchById(auth, serverId)
        : await InternalMCPServerInMemoryResource.fetchById(
            auth,
            serverId,
            systemSpace
          );

    if (!server) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "data_source_not_found",
          message: "Remote MCP Server not found",
        },
      });
    }

    const r = await server.delete(auth);

    if (r.isErr()) {
      switch (r.error.code) {
        case "unauthorized":
          return apiError(ctx, {
            status_code: 401,
            api_error: {
              type: "workspace_auth_error",
              message: "You are not authorized to delete the MCP server.",
            },
          });
        default:
          return assertNever(r.error.code);
      }
    }

    return ctx.json({ deleted: true });
  }
);

app.route("/sync", sync);
app.route("/tools", tools);

async function enrichServer(
  auth: Authenticator,
  json: MCPServerType
): Promise<MCPServerTypeWithViews> {
  const [views, workspaceConnection] = await Promise.all([
    MCPServerViewResource.listByMCPServer(auth, json.sId),
    MCPServerConnectionResource.findByMCPServer(auth, {
      mcpServerId: json.sId,
      connectionType: "workspace",
    }),
  ]);

  return {
    ...json,
    views: views.map((v) => v.toJSON()),
    // Enrich authorization so the client can block the OAuth popup when the
    // workspace-level connection is missing.
    authorization: withWorkspaceConnectionRequirement(json.authorization, {
      isWorkspaceConnected: workspaceConnection.isOk(),
    }),
  };
}

async function handleRemotePatch(
  ctx: Context,
  auth: Authenticator,
  server: RemoteMCPServerResource,
  body: PatchMCPServerBody
): HandlerResult<PatchMCPServerResponseBody> {
  if ("icon" in body) {
    const update = await server.updateMetadata(auth, {
      icon: body.icon as CustomResourceIconType | undefined,
      lastSyncAt: new Date(),
    });
    if (update.isErr()) {
      if (update.error.code === "unauthorized") {
        return respondUnauthorizedUpdate(ctx);
      }
      return assertNever(update.error.code);
    }
  } else if ("sharedSecret" in body || "customHeaders" in body) {
    const sanitizedRecord =
      body.customHeaders !== undefined
        ? headersArrayToRecord(body.customHeaders)
        : undefined;
    const update = await server.updateMetadata(auth, {
      sharedSecret: body.sharedSecret,
      customHeaders: sanitizedRecord,
      lastSyncAt: new Date(),
    });
    if (update.isErr()) {
      if (update.error.code === "unauthorized") {
        return respondUnauthorizedUpdate(ctx);
      }
      return assertNever(update.error.code);
    }
  } else if ("meta" in body) {
    const update = await server.updateMetadata(auth, {
      meta: body.meta,
      lastSyncAt: new Date(),
    });
    if (update.isErr()) {
      if (update.error.code === "unauthorized") {
        return respondUnauthorizedUpdate(ctx);
      }
      return assertNever(update.error.code);
    }
  }

  return ctx.json({ success: true as const, server: server.toJSON() });
}

async function handleInternalPatch(
  ctx: Context,
  auth: Authenticator,
  server: InternalMCPServerInMemoryResource,
  body: PatchMCPServerBody
): HandlerResult<PatchMCPServerResponseBody> {
  if ("icon" in body) {
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Internal MCP server does not support editing icon.",
      },
    });
  }

  if (!requiresBearerTokenConfiguration(server.toJSON())) {
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message:
          "This internal MCP server does not support bearer token credentials.",
      },
    });
  }

  if ("sharedSecret" in body || "customHeaders" in body) {
    const sanitizedRecord =
      body.customHeaders !== undefined
        ? headersArrayToRecord(body.customHeaders)
        : undefined;
    const recordOrNull =
      sanitizedRecord !== undefined
        ? Object.keys(sanitizedRecord).length > 0
          ? sanitizedRecord
          : null
        : undefined;

    const upsertResult = await server.upsertCredentials(auth, {
      sharedSecret: body.sharedSecret,
      customHeaders: recordOrNull,
    });
    if (upsertResult.isErr()) {
      if (upsertResult.error.code === "unauthorized") {
        return respondUnauthorizedUpdate(ctx);
      }
      throw upsertResult.error;
    }
  }

  return ctx.json({ success: true as const, server: server.toJSON() });
}

function respondUnauthorizedUpdate(ctx: Context) {
  return apiError(ctx, {
    status_code: 401,
    api_error: {
      type: "workspace_auth_error",
      message: "You are not authorized to update the MCP server.",
    },
  });
}

export default app;
