import type { Resource } from "@modelcontextprotocol/sdk/types.js";
import type { NextApiRequest, NextApiResponse } from "next";

import { validateInternalMCPServerId } from "@app/lib/actions/mcp";
import { getMCPServerResources } from "@app/lib/actions/mcp_actions";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";

export type GetMCPServerResourcesResponseBody = {
  resources: Pick<Resource, "name" | "description" | "mimeType" | "uri">[];
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetMCPServerResourcesResponseBody>>,
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
    case "GET":
      if (!serverId) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_mcp_server_id",
            message: "MCP server id is required.",
          },
        });
      }
      if (!validateInternalMCPServerId(serverId)) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_mcp_server_id",
            message: "Only internal MCP server ids are supported.",
          },
        });
      }

      const resources = await getMCPServerResources({
        serverType: "internal",
        internalMCPServerId: serverId,
      });

      return res.status(200).json({
        resources: resources.map((resource) => ({
          name: resource.name,
          description: resource.description,
          uri: resource.uri,
          mimeType: resource.mimeType,
        })),
      });
    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, GET is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(handler);
