import { isServerSideMCPServerConfiguration } from "@app/lib/actions/types/guards";
import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { getConversation } from "@app/lib/api/assistant/conversation/fetch";
import { getJITServers } from "@app/lib/api/assistant/jit_actions";
import { listAttachments } from "@app/lib/api/assistant/jit_utils";
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

      const { aId, cId } = claims;

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

      // Collect view IDs from agent config actions.
      const viewIds = new Set(
        agentConfig.actions
          .filter(isServerSideMCPServerConfiguration)
          .map((action) => action.mcpServerViewId)
      );

      // Fetch conversation and merge JIT servers (conversation files, utilities, etc.).
      const conversationResult = await getConversation(auth, cId);
      if (conversationResult.isOk()) {
        const conversation = conversationResult.value;
        const attachments = await listAttachments(auth, { conversation });
        const { servers: jitServers } = await getJITServers(auth, {
          agentConfiguration: agentConfig,
          conversation,
          attachments,
        });
        for (const srv of jitServers) {
          viewIds.add(srv.mcpServerViewId);
        }
      }

      if (viewIds.size === 0) {
        return res.status(200).json({ serverViews: [] });
      }

      // Fetch the server views with their tools metadata.
      const views = await MCPServerViewResource.fetchByIds(auth, [...viewIds]);

      const { server, light } = req.query;

      let serverViews = views.map((view) => view.toJSON());

      // Filter by server name if requested.
      if (typeof server === "string") {
        serverViews = serverViews.filter((sv) => sv.server.name === server);
      }

      // Strip tool inputSchemas in light mode.
      if (light === "true") {
        serverViews = serverViews.map((sv) => ({
          ...sv,
          server: {
            ...sv.server,
            tools: sv.server.tools.map(({ inputSchema, ...rest }) => rest),
          },
        }));
      }

      return res.status(200).json({ serverViews });
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
