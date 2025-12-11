import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { fromError } from "zod-validation-error";

import type { CustomResourceIconType } from "@app/components/resources/resources_icons";
import {
  getServerTypeAndIdFromSId,
  requiresBearerTokenConfiguration,
} from "@app/lib/actions/mcp_helper";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { MCPServerType } from "@app/lib/api/mcp";
import type { Authenticator } from "@app/lib/auth";
import { InternalMCPServerInMemoryResource } from "@app/lib/resources/internal_mcp_server_in_memory_resource";
import { RemoteMCPServerResource } from "@app/lib/resources/remote_mcp_servers_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";
import { headersArrayToRecord } from "@app/types";
import { assertNever } from "@app/types";

const PatchMCPServerBodySchema = z
  .object({
    icon: z.string(),
  })
  .or(
    z
      .object({
        sharedSecret: z.string().optional(),
        customHeaders: z
          .array(z.object({ key: z.string(), value: z.string() }))
          .nullable()
          .optional(),
      })
      .refine(
        (data) =>
          data.sharedSecret !== undefined || data.customHeaders !== undefined,
        {
          message: "Either sharedSecret or customHeaders must be provided",
        }
      )
  );

export type PatchMCPServerBody = z.infer<typeof PatchMCPServerBodySchema>;

export type GetMCPServerResponseBody = {
  server: MCPServerType;
};

export type PatchMCPServerResponseBody = {
  success: true;
  server: MCPServerType;
};

export type DeleteMCPServerResponseBody = {
  deleted: boolean;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<
      | GetMCPServerResponseBody
      | PatchMCPServerResponseBody
      | DeleteMCPServerResponseBody
    >
  >,
  auth: Authenticator
): Promise<void> {
  const { serverId } = req.query;

  if (typeof serverId !== "string") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid path parameters.",
      },
    });
  }

  if (!auth.isUser()) {
    return apiError(req, res, {
      status_code: 401,
      api_error: {
        type: "mcp_auth_error",
        message:
          "You are not authorized to make request to inspect an MCP server.",
      },
    });
  }

  switch (req.method) {
    case "GET": {
      const { serverType, id } = getServerTypeAndIdFromSId(serverId);
      switch (serverType) {
        case "internal": {
          const systemSpace =
            await SpaceResource.fetchWorkspaceSystemSpace(auth);
          const server = await InternalMCPServerInMemoryResource.fetchById(
            auth,
            serverId,
            systemSpace
          );

          if (!server) {
            return apiError(req, res, {
              status_code: 404,
              api_error: {
                type: "data_source_not_found",
                message: "Internal MCP Server not found",
              },
            });
          }

          return res.status(200).json({ server: server.toJSON() });
        }
        case "remote": {
          const server = await RemoteMCPServerResource.fetchById(
            auth,
            serverId
          );

          if (!server || server.id !== id) {
            return apiError(req, res, {
              status_code: 404,
              api_error: {
                type: "data_source_not_found",
                message: "Remote MCP Server not found",
              },
            });
          }

          return res.status(200).json({ server: server.toJSON() });
        }
        default:
          assertNever(serverType);
      }
      break;
    }
    case "PATCH": {
      const r = PatchMCPServerBodySchema.safeParse(req.body);
      if (r.error) {
        return apiError(req, res, {
          api_error: {
            type: "invalid_request_error",
            message: fromError(r.error).toString(),
          },
          status_code: 400,
        });
      }

      const { serverType } = getServerTypeAndIdFromSId(serverId);

      if (serverType === "remote") {
        const remoteServer = await RemoteMCPServerResource.fetchById(
          auth,
          serverId
        );
        if (!remoteServer) {
          return apiError(req, res, {
            status_code: 404,
            api_error: {
              type: "mcp_server_not_found",
              message: "Remote MCP Server not found",
            },
          });
        }
        return handleRemotePatch(req, res, auth, remoteServer, r.data);
      }

      const systemSpace = await SpaceResource.fetchWorkspaceSystemSpace(auth);
      const internalServer = await InternalMCPServerInMemoryResource.fetchById(
        auth,
        serverId,
        systemSpace
      );
      if (!internalServer) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "mcp_server_not_found",
            message: "Internal MCP Server not found",
          },
        });
      }
      return handleInternalPatch(req, res, auth, internalServer, r.data);
    }

    case "DELETE": {
      const { serverType } = getServerTypeAndIdFromSId(serverId);

      const systemSpace = await SpaceResource.fetchWorkspaceSystemSpace(auth);

      const server =
        serverType == "remote"
          ? await RemoteMCPServerResource.fetchById(auth, serverId)
          : await InternalMCPServerInMemoryResource.fetchById(
              auth,
              serverId,
              systemSpace
            );

      if (!server) {
        return apiError(req, res, {
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
            return apiError(req, res, {
              status_code: 401,
              api_error: {
                type: "workspace_auth_error",
                message: "You are not authorized to delete the MCP server.",
              },
            });
          default:
            assertNever(r.error.code);
        }
      }

      return res.status(200).json({
        deleted: true,
      });
    }
    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message:
            "The method passed is not supported, GET, PATCH, DELETE are expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(handler);

async function handleRemotePatch(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<
      PatchMCPServerResponseBody | DeleteMCPServerResponseBody
    >
  >,
  auth: Authenticator,
  server: RemoteMCPServerResource,
  body: PatchMCPServerBody
) {
  if ("icon" in body) {
    const update = await server.updateMetadata(auth, {
      icon: body.icon as CustomResourceIconType | undefined,
      lastSyncAt: new Date(),
    });
    if (update.isErr()) {
      if (update.error.code === "unauthorized") {
        return respondUnauthorizedUpdate(req, res);
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
        return respondUnauthorizedUpdate(req, res);
      }
      return assertNever(update.error.code);
    }
  }

  return res.status(200).json({ success: true, server: server.toJSON() });
}

async function handleInternalPatch(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<
      PatchMCPServerResponseBody | DeleteMCPServerResponseBody
    >
  >,
  auth: Authenticator,
  server: InternalMCPServerInMemoryResource,
  body: PatchMCPServerBody
) {
  if ("icon" in body) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Internal MCP server does not support editing icon.",
      },
    });
  }

  const requiresBearerToken = requiresBearerTokenConfiguration(server.toJSON());
  if (!requiresBearerToken) {
    return apiError(req, res, {
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
        return respondUnauthorizedUpdate(req, res);
      }
      throw upsertResult.error;
    }
  }

  return res.status(200).json({ success: true, server: server.toJSON() });
}

function respondUnauthorizedUpdate(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<PatchMCPServerResponseBody>>
) {
  return apiError(req, res, {
    status_code: 401,
    api_error: {
      type: "workspace_auth_error",
      message: "You are not authorized to update the MCP server.",
    },
  });
}
