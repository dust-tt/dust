import assert from "assert";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import { NumberFromString, withFallback } from "io-ts-types";
import type { NextApiRequest, NextApiResponse } from "next";

import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import { AgentStepContentResource } from "@app/lib/resources/agent_step_content_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";
import type { AgentMCPActionType } from "@app/types/actions";

export type GetMCPActionsResult = {
  actions: (AgentMCPActionType & {
    conversationId: string;
    messageId: string;
  })[];
  nextCursor: string | null;
  totalCount: number;
};

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

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetMCPActionsResult>>,
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

      let cursorDate: Date | undefined;
      if (cursor) {
        cursorDate = new Date(cursor);
        if (isNaN(cursorDate.getTime())) {
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: "Invalid cursor format.",
            },
          });
        }
      }

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
      const agentConfiguration = await getAgentConfiguration(auth, {
        agentId,
        variant: "light",
      });
      if (!agentConfiguration) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "agent_configuration_not_found",
            message: "The agent you're trying to access was not found.",
          },
        });
      }

      const { data, totalCount, nextCursor } =
        await AgentStepContentResource.listFunctionCallsForAgent(auth, {
          agentConfiguration,
          limit,
          cursor: cursorDate,
        });

      const contentById = new Map(data.map((s) => [s.stepContent.id, s]));

      const actions = await AgentMCPActionResource.fetchByStepContents(auth, {
        stepContents: data.map((s) => s.stepContent),
      });

      const resultActions = actions.map((a) => {
        const stepContent = contentById.get(a.stepContentId);
        assert(stepContent, "Step content not found.");

        return {
          ...a.toJSON(),
          conversationId: stepContent.conversationId,
          messageId: stepContent.messageId,
        };
      });

      return res.status(200).json({
        actions: resultActions,
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
