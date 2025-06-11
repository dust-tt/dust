import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import { NumberFromString, withFallback } from "io-ts-types";
import type { NextApiRequest, NextApiResponse } from "next";

import { getAgentConfiguration } from "@app/lib/api/assistant/configuration";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import type { MCPAction } from "@app/lib/resources/agent_mcp_action_resource";
import { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";

const GetMCPActionsQuerySchema = t.type({
  agentId: t.string,
  limit: withFallback(
    t.refinement(
      NumberFromString,
      (n): n is number => n >= 1 && n <= 100,
      `LimitWithRange`
    ),
    25
  ),
  cursor: t.union([t.string, t.undefined]),
});

export type GetMCPActionsResponseBody = {
  actions: MCPAction[];
  nextCursor: string | null;
  totalCount: number;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetMCPActionsResponseBody>>,
  auth: Authenticator
): Promise<void> {
  switch (req.method) {
    case "GET":
      const queryValidation = GetMCPActionsQuerySchema.decode({
        ...req.query,
        limit: req.query.limit
          ? parseInt(req.query.limit as string, 10)
          : undefined,
      });

      if (isLeft(queryValidation)) {
        const pathError = reporter.formatValidationErrors(queryValidation.left);
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid query parameters: ${pathError}`,
          },
        });
      }

      const { agentId, limit, cursor } = queryValidation.right;

      const owner = auth.getNonNullableWorkspace();
      const flags = await getFeatureFlags(owner);
      if (!flags.includes("labs_mcp_actions_dashboard")) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "feature_flag_not_found",
            message: "MCP Actions dashboard is not available.",
          },
        });
      }

      // Only admins can access the MCP Actions Dashboard
      if (!auth.isAdmin()) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "workspace_auth_error",
            message:
              "Only workspace admins can access the MCP Actions Dashboard.",
          },
        });
      }

      // Verify the agent exists and user has access
      const agentConfiguration = await getAgentConfiguration(
        auth,
        agentId,
        "light"
      );
      if (!agentConfiguration) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "agent_configuration_not_found",
            message: "The agent you're trying to access was not found.",
          },
        });
      }

      const result = await AgentMCPActionResource.getMCPActionsForAgent(auth, {
        agentConfigurationId: agentConfiguration.sId,
        limit,
        cursor,
      });

      if (result.isErr()) {
        const error = result.error;
        if (error.message === "Invalid cursor format") {
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: "Invalid cursor format.",
            },
          });
        }

        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "Failed to fetch MCP actions from database.",
          },
        });
      }

      const { actions, nextCursor, totalCount } = result.value;

      return res.status(200).json({
        actions,
        nextCursor,
        totalCount,
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
