import { isServerSideMCPServerConfiguration } from "@app/lib/actions/types/guards";
import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { withPublicAPIAuthentication } from "@app/lib/api/auth_wrappers";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import {
  type SandboxExecTokenPayload,
  verifySandboxExecToken,
} from "@app/lib/api/sandbox/access_tokens";
import type { Authenticator } from "@app/lib/auth";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { NextApiRequest, NextApiResponse } from "next";

interface GetSandboxToolsResponseType {
  serverViews: MCPServerViewType[];
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetSandboxToolsResponseType>>,
  auth: Authenticator
): Promise<void> {
  switch (req.method) {
    case "GET": {
      // Extract and verify sandbox token to get the aId claim.
      const token = req.headers.authorization?.replace("Bearer ", "");
      if (!token) {
        return apiError(req, res, {
          status_code: 401,
          api_error: {
            type: "not_authenticated",
            message:
              "The request does not have valid authentication credentials.",
          },
        });
      }

      const claims: SandboxExecTokenPayload | null =
        verifySandboxExecToken(token);
      if (!claims) {
        return apiError(req, res, {
          status_code: 401,
          api_error: {
            type: "invalid_sandbox_token_error",
            message: "The sandbox token is invalid or expired.",
          },
        });
      }

      const { aId } = claims;

      // Fetch the agent configuration.
      const agentConfig = await getAgentConfiguration(auth, {
        agentId: aId,
        variant: "full",
      });
      if (!agentConfig) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "agent_configuration_not_found",
            message: `Agent configuration ${aId} not found.`,
          },
        });
      }

      // Extract MCP server view IDs from server-side actions.
      const viewIds = agentConfig.actions
        .filter(isServerSideMCPServerConfiguration)
        .map((action) => action.mcpServerViewId);

      if (viewIds.length === 0) {
        return res.status(200).json({ serverViews: [] });
      }

      // Fetch the server views with their tools metadata.
      const views = await MCPServerViewResource.fetchByIds(auth, viewIds);

      return res.status(200).json({
        serverViews: views.map((view) => view.toJSON()),
      });
    }

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

export default withPublicAPIAuthentication(handler);
