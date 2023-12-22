import {
  AgentConfigurationTypeWithUsage,
  GetAgentConfigurationsLeaderboardQuerySchema,
} from "@dust-tt/types";
import { ReturnedAPIErrorType } from "@dust-tt/types";
import { isLeft } from "fp-ts/lib/Either";
import * as reporter from "io-ts-reporters";
import { NextApiRequest, NextApiResponse } from "next";

import { getAgentUsage } from "@app/lib/api/assistant/agent_usage";
import { getAgentConfigurations } from "@app/lib/api/assistant/configuration";
import { Authenticator, getSession } from "@app/lib/auth";
import { safeRedisClient } from "@app/lib/redis";
import { apiError, withLogging } from "@app/logger/withlogging";

export type GetAgentConfigurationsLeaderboardResponseBody = {
  agentConfigurationsWithUsage: AgentConfigurationTypeWithUsage[];
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    GetAgentConfigurationsLeaderboardResponseBody | ReturnedAPIErrorType
  >
): Promise<void> {
  const session = await getSession(req, res);
  const auth = await Authenticator.fromSession(
    session,
    req.query.wId as string
  );
  const owner = auth.workspace();
  if (!owner) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "workspace_not_found",
        message: "The workspace you're trying to modify was not found.",
      },
    });
  }

  switch (req.method) {
    case "GET": {
      if (!auth.isUser()) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "app_auth_error",
            message: "Only the workspace users can see Assistants.",
          },
        });
      }
      const queryValidation =
        GetAgentConfigurationsLeaderboardQuerySchema.decode(req.query);
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
      const { view } = queryValidation.right;

      if (view === "admin_internal" && !auth.isDustSuperUser()) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "app_auth_error",
            message: "Only Dust Super Users can see admin_internal agents.",
          },
        });
      }
      const agentConfigurations = await getAgentConfigurations(auth, view);
      const agentConfigurationsWithUsage = await safeRedisClient(
        async (client) => {
          return await Promise.all(
            agentConfigurations.map(
              async (
                agentConfiguration
              ): Promise<AgentConfigurationTypeWithUsage> => {
                return {
                  ...agentConfiguration,
                  usage: await getAgentUsage({
                    providedRedis: client,
                    workspaceId: owner.sId,
                    agentConfigurationId: agentConfiguration.sId,
                  }),
                };
              }
            )
          );
        }
      );

      return res
        .status(200)
        .json({ agentConfigurationsWithUsage: agentConfigurationsWithUsage });
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

export default withLogging(handler);
