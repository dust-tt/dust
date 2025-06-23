import { isLeft } from "fp-ts/lib/Either";
import * as reporter from "io-ts-reporters";
import _ from "lodash";
import type { NextApiRequest, NextApiResponse } from "next";

import { getAgentsUsage } from "@app/lib/api/assistant/agent_usage";
import { getAgentConfigurations } from "@app/lib/api/assistant/configuration";
import { createOrUpgradeAgentConfiguration } from "@app/lib/api/assistant/configuration";
import { getAgentsRecentAuthors } from "@app/lib/api/assistant/recent_authors";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { runOnRedis } from "@app/lib/api/redis";
import type { Authenticator } from "@app/lib/auth";
import { AgentMessageFeedbackResource } from "@app/lib/resources/agent_message_feedback_resource";
import { KillSwitchResource } from "@app/lib/resources/kill_switch_resource";
import { apiError } from "@app/logger/withlogging";
import type {
  LightAgentConfigurationType,
  WithAPIErrorResponse,
} from "@app/types";
import {
  GetAgentConfigurationsQuerySchema,
  PostOrPatchAgentConfigurationRequestBodySchema,
} from "@app/types";

export type GetAgentConfigurationsResponseBody = {
  agentConfigurations: LightAgentConfigurationType[];
};
export type PostAgentConfigurationResponseBody = {
  agentConfiguration: LightAgentConfigurationType;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<
      | GetAgentConfigurationsResponseBody
      | PostAgentConfigurationResponseBody
      | void
    >
  >,
  auth: Authenticator
): Promise<void> {
  const owner = auth.getNonNullableWorkspace();

  switch (req.method) {
    case "GET":
      // extract the view from the query parameters
      const queryValidation = GetAgentConfigurationsQuerySchema.decode({
        ...req.query,
        limit:
          typeof req.query.limit === "string"
            ? parseInt(req.query.limit, 10)
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

      const { view, limit, withUsage, withAuthors, withFeedbacks, sort } =
        queryValidation.right;
      let viewParam = view ? view : "all";
      // @ts-expect-error: added for backwards compatibility
      viewParam = viewParam === "assistant-search" ? "list" : viewParam;
      if (viewParam === "admin_internal" && !auth.isDustSuperUser()) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "app_auth_error",
            message: "Only Dust Super Users can see admin_internal agents.",
          },
        });
      }
      let agentConfigurations = await getAgentConfigurations({
        auth,
        agentsGetView:
          viewParam === "workspace"
            ? "published" // workspace is deprecated, return all visible agents
            : viewParam,
        variant: "light",
        limit,
        sort,
      });
      if (withUsage === "true") {
        const mentionCounts = await runOnRedis(
          { origin: "agent_usage" },
          async (redis) => {
            return getAgentsUsage({
              providedRedis: redis,
              workspaceId: owner.sId,
              limit:
                typeof req.query.limit === "string"
                  ? parseInt(req.query.limit, 10)
                  : -1,
            });
          }
        );
        const usageMap = _.keyBy(mentionCounts, "agentId");
        agentConfigurations = agentConfigurations.map((agentConfiguration) =>
          usageMap[agentConfiguration.sId]
            ? {
                ...agentConfiguration,
                usage: _.omit(usageMap[agentConfiguration.sId], ["agentId"]),
              }
            : agentConfiguration
        );
      }
      if (withAuthors === "true") {
        const recentAuthors = await getAgentsRecentAuthors({
          auth,
          agents: agentConfigurations,
        });
        agentConfigurations = agentConfigurations.map(
          (agentConfiguration, index) => {
            return {
              ...agentConfiguration,
              lastAuthors: recentAuthors[index],
            };
          }
        );
      }
      if (withFeedbacks === "true") {
        const feedbacks =
          await AgentMessageFeedbackResource.getFeedbackCountForAssistants(
            auth,
            agentConfigurations
              .filter((agent) => agent.scope !== "global")
              .map((agent) => agent.sId),
            30
          );
        agentConfigurations = agentConfigurations.map((agentConfiguration) => ({
          ...agentConfiguration,
          feedbacks: {
            up:
              feedbacks.find(
                (f) =>
                  f.agentConfigurationId === agentConfiguration.sId &&
                  f.thumbDirection === "up"
              )?.count ?? 0,
            down:
              feedbacks.find(
                (f) =>
                  f.agentConfigurationId === agentConfiguration.sId &&
                  f.thumbDirection === "down"
              )?.count ?? 0,
          },
        }));
      }

      return res.status(200).json({
        agentConfigurations,
      });
    case "POST":
      const killSwitches = await KillSwitchResource.listEnabledKillSwitches();
      if (killSwitches?.includes("save_agent_configurations")) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "app_auth_error",
            message:
              "Saving agent configurations is temporarily disabled, try again later.",
          },
        });
      }
      const bodyValidation =
        PostOrPatchAgentConfigurationRequestBodySchema.decode(req.body);
      if (isLeft(bodyValidation)) {
        const pathError = reporter.formatValidationErrors(bodyValidation.left);
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid request body: ${pathError}`,
          },
        });
      }

      const maxStepsPerRun = bodyValidation.right.assistant.maxStepsPerRun;

      const isLegacyConfiguration =
        bodyValidation.right.assistant.actions.length === 1 &&
        !bodyValidation.right.assistant.actions[0].description;

      if (isLegacyConfiguration && maxStepsPerRun !== undefined) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "app_auth_error",
            message: "maxStepsPerRun is only supported in multi-actions mode.",
          },
        });
      }
      if (!isLegacyConfiguration && maxStepsPerRun === undefined) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "app_auth_error",
            message: "maxStepsPerRun is required in multi-actions mode.",
          },
        });
      }
      const agentConfigurationRes = await createOrUpgradeAgentConfiguration({
        auth,
        assistant: { ...bodyValidation.right.assistant, maxStepsPerRun },
      });

      if (agentConfigurationRes.isErr()) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "assistant_saving_error",
            message: `Error saving agent: ${agentConfigurationRes.error.message}`,
          },
        });
      }

      return res.status(200).json({
        agentConfiguration: agentConfigurationRes.value,
      });

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message:
            "The method passed is not supported, GET OR POST is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(handler);
