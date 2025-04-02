import { randomBytes } from "crypto";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import type { NextApiRequest, NextApiResponse } from "next";

import type { MCPServerType } from "@app/lib/actions/mcp_metadata";
import {
  fetchRemoteServerMetaDataByURL,
  getAllMCPServersMetadataLocally,
  getMCPServerMetadataLocally,
} from "@app/lib/actions/mcp_metadata";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { RemoteMCPServerResource } from "@app/lib/resources/remote_mcp_servers_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";

const allowedFiltersSchema = t.union([
  t.literal("internal"),
  t.literal("remote"),
  t.literal("all"),
]);

export type AllowedFilter = t.TypeOf<typeof allowedFiltersSchema>;

const QueryParamsSchema = t.type({
  filter: allowedFiltersSchema,
});

export type GetMCPServersQueryParams = t.TypeOf<typeof QueryParamsSchema>;

export type GetMCPServersResponseBody = {
  success: boolean;
  servers: MCPServerType[];
};

export type CreateMCPServerResponseBody = {
  success: boolean;
  server: MCPServerType;
};

const PostQueryParamsSchema = t.union([
  t.type({
    serverType: t.literal("remote"),
    url: t.string,
  }),
  t.type({
    serverType: t.literal("internal"),
    internalMCPServerId: t.string,
  }),
]);

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<
      GetMCPServersResponseBody | CreateMCPServerResponseBody
    >
  >,
  auth: Authenticator
): Promise<void> {
  const { method } = req;

  switch (method) {
    case "GET": {
      const r = QueryParamsSchema.decode(req.query);

      if (isLeft(r)) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "Invalid query parameters.",
          },
        });
      }

      switch (r.right.filter) {
        case "internal": {
          const mcpServers = await getAllMCPServersMetadataLocally(auth);
          return res.status(200).json({
            success: true,
            servers: mcpServers,
          });
        }

        case "remote": {
          const remoteMCPs =
            await RemoteMCPServerResource.listByWorkspace(auth);
          return res.status(200).json({
            success: true,
            servers: remoteMCPs.map((r) => r.toJSON()),
          });
        }

        case "all":
          const remoteMCPs =
            await RemoteMCPServerResource.listByWorkspace(auth);
          const internalMCPs = await getAllMCPServersMetadataLocally(auth);

          return res.status(200).json({
            success: true,
            servers: [...remoteMCPs.map((r) => r.toJSON()), ...internalMCPs],
          });
      }
      break;
    }
    case "POST": {
      const r = PostQueryParamsSchema.decode(req.body);

      if (isLeft(r)) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "Invalid request body",
          },
        });
      }

      const body = r.right;
      if (body.serverType === "remote") {
        const { url } = body;

        if (!url) {
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: "URL is required",
            },
          });
        }

        const existingServer = await RemoteMCPServerResource.findByUrl(
          auth,
          url
        );

        if (existingServer) {
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: "A server with this URL already exists",
            },
          });
        }

        const metadata = await fetchRemoteServerMetaDataByURL(auth, url);
        const sharedSecret = randomBytes(32).toString("hex");

        const newRemoteMCPServer = await RemoteMCPServerResource.makeNew(auth, {
          workspaceId: auth.getNonNullableWorkspace().id,
          name: metadata.name,
          url: url,
          description: metadata.description,
          cachedTools: metadata.tools,
          lastSyncAt: new Date(),
          sharedSecret,
        });

        return res.status(201).json({
          success: true,
          server: {
            ...metadata,
            id: newRemoteMCPServer.sId,
          },
        });
      } else {
        const { internalMCPServerId } = body;
        await MCPServerViewResource.create(auth, {
          mcpServerId: internalMCPServerId,
          space: await SpaceResource.fetchWorkspaceSystemSpace(auth),
        });
        const server = await getMCPServerMetadataLocally(auth, {
          mcpServerId: internalMCPServerId,
        });
        return res.status(201).json({
          success: true,
          server,
        });
      }
    }

    default: {
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message:
            "The method passed is not supported, GET or POST is expected.",
        },
      });
    }
  }
}

export default withSessionAuthenticationForWorkspace(handler);
