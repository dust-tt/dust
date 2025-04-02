import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import type { NextApiRequest, NextApiResponse } from "next";

import type { MCPServerType } from "@app/lib/actions/mcp_metadata";
import { fetchRemoteServerMetaDataByURL } from "@app/lib/actions/mcp_metadata";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { InternalMCPServerInMemoryResource } from "@app/lib/resources/internal_mcp_server_in_memory_resource";
import { RemoteMCPServerResource } from "@app/lib/resources/remote_mcp_servers_resource";
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
          const internalMCPs =
            await InternalMCPServerInMemoryResource.listByWorkspace(auth);
          return res.status(200).json({
            success: true,
            servers: await Promise.all(internalMCPs.map((r) => r.toJSON(auth))),
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
          const internalMCPs =
            await InternalMCPServerInMemoryResource.listByWorkspace(auth);

          return res.status(200).json({
            success: true,
            servers: [
              ...remoteMCPs.map((r) => r.toJSON()),
              ...(await Promise.all(internalMCPs.map((r) => r.toJSON(auth)))),
            ],
          });
      }
      break;
    }
    case "POST": {
      console.log("here")
      const { url } = req.body;

      console.log("url", url);

      if (!url) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "URL is required",
          },
        });
      }

      const existingServer = await RemoteMCPServerResource.findByUrl(auth, url);

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

      const newRemoteMCPServer = await RemoteMCPServerResource.makeNew(auth, {
        workspaceId: auth.getNonNullableWorkspace().id,
        name: metadata.name,
        url: url,
        description: metadata.description,
        cachedTools: metadata.tools,
      });

      return res.status(201).json({
        success: true,
        server: {
          ...metadata,
          id: newRemoteMCPServer.sId,
        },
      });
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
