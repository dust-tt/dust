import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { fromError } from "zod-validation-error";

import { getServerTypeAndIdFromSId } from "@app/lib/actions/mcp_helper";
import type { CustomServerIconType } from "@app/lib/actions/mcp_icons";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { MCPServerType } from "@app/lib/api/mcp";
import type { Authenticator } from "@app/lib/auth";
import { InternalMCPServerInMemoryResource } from "@app/lib/resources/internal_mcp_server_in_memory_resource";
import { RemoteMCPServerResource } from "@app/lib/resources/remote_mcp_servers_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";
import { assertNever } from "@app/types";

const PatchMCPServerBodySchema = z
  .object({
    icon: z.string(),
  })
  .or(
    z.object({
      sharedSecret: z.string(),
    })
  )
  .or(
    z.object({
      customHeaders: z
        .array(z.object({ key: z.string(), value: z.string() }))
        .nullable()
        .optional(),
    })
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
          const server = await InternalMCPServerInMemoryResource.fetchById(
            auth,
            serverId
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

      if (serverType !== "remote") {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "Internal MCP servers cannot be updated.",
          },
        });
      }

      const server = await RemoteMCPServerResource.fetchById(auth, serverId);

      if (!server) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "mcp_server_not_found",
            message: "Internal MCP Server not found",
          },
        });
      }

      if ("icon" in r.data) {
        if (server instanceof RemoteMCPServerResource) {
          const r2 = await server.updateMetadata(auth, {
            icon: r.data.icon as CustomServerIconType | undefined,
            lastSyncAt: new Date(),
          });
          if (r2.isErr()) {
            switch (r2.error.code) {
              case "unauthorized":
                return apiError(req, res, {
                  status_code: 401,
                  api_error: {
                    type: "workspace_auth_error",
                    message: "You are not authorized to update the MCP server.",
                  },
                });
              default:
                assertNever(r2.error.code);
            }
          }
        } else {
          return apiError(req, res, {
            status_code: 404,
            api_error: {
              type: "invalid_request_error",
              message:
                "Internal MCP server does not support editing icon or shared secret.",
            },
          });
        }
      } else if ("sharedSecret" in r.data) {
        if (server instanceof RemoteMCPServerResource) {
          const r2 = await server.updateMetadata(auth, {
            sharedSecret: r.data.sharedSecret,
            lastSyncAt: new Date(),
          });
          if (r2.isErr()) {
            switch (r2.error.code) {
              case "unauthorized":
                return apiError(req, res, {
                  status_code: 401,
                  api_error: {
                    type: "workspace_auth_error",
                    message: "You are not authorized to update the MCP server.",
                  },
                });
            }
          }
        }
      } else if ("customHeaders" in r.data) {
        if (server instanceof RemoteMCPServerResource) {
          const headersRecord = r.data.customHeaders
            ? Object.fromEntries(
                r.data.customHeaders
                  .filter((h) => h.key && h.value)
                  .map(({ key, value }) => [key.trim(), value.trim()])
              )
            : null;

          // Strip any Authorization key from persisted headers; auth is handled separately
          const sanitizedRecord = headersRecord
            ? Object.fromEntries(
                Object.entries(headersRecord).filter(
                  ([k]) => k.toLowerCase() !== "authorization"
                )
              )
            : null;

          const r2 = await server.updateMetadata(auth, {
            customHeaders: sanitizedRecord,
            lastSyncAt: new Date(),
          });
          if (r2.isErr()) {
            switch (r2.error.code) {
              case "unauthorized":
                return apiError(req, res, {
                  status_code: 401,
                  api_error: {
                    type: "workspace_auth_error",
                    message: "You are not authorized to update the MCP server.",
                  },
                });
            }
          }
        }
      }

      return res.status(200).json({
        success: true,
        server: server.toJSON(),
      });
    }

    case "DELETE": {
      const { serverType } = getServerTypeAndIdFromSId(serverId);

      const server =
        serverType == "remote"
          ? await RemoteMCPServerResource.fetchById(auth, serverId)
          : await InternalMCPServerInMemoryResource.fetchById(auth, serverId);

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
