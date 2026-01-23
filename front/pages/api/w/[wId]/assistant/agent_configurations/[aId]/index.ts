import { isLeft } from "fp-ts/lib/Either";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import {
  archiveAgentConfiguration,
  getAgentConfiguration,
} from "@app/lib/api/assistant/configuration/agent";
import { getAgentRecentAuthors } from "@app/lib/api/assistant/recent_authors";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { AgentConfigurationModel } from "@app/lib/models/agent/agent";
import { apiError } from "@app/logger/withlogging";
import { createOrUpgradeAgentConfiguration } from "@app/pages/api/w/[wId]/assistant/agent_configurations";
import type { AgentConfigurationType, WithAPIErrorResponse } from "@app/types";
import { PostOrPatchAgentConfigurationRequestBodySchema } from "@app/types";

export type GetAgentConfigurationResponseBody = {
  agentConfiguration: AgentConfigurationType;
};
export type DeleteAgentConfigurationResponseBody = {
  success: boolean;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<
      | GetAgentConfigurationResponseBody
      | DeleteAgentConfigurationResponseBody
      | void
    >
  >,
  auth: Authenticator
): Promise<void> {
  const agent = await getAgentConfiguration(auth, {
    agentId: req.query.aId as string,
    variant: "full",
  });
  if (!agent || (!agent.canRead && !auth.isAdmin())) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "agent_configuration_not_found",
        message: "The Agent you're trying to access was not found.",
      },
    });
  }

  switch (req.method) {
    case "GET":
      return res.status(200).json({
        agentConfiguration: {
          ...agent,
          lastAuthors: await getAgentRecentAuthors({
            agent,
            auth,
          }),
        },
      });

    case "PATCH":
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

      if (!agent.canEdit && !auth.isAdmin()) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "app_auth_error",
            message: "Only editors can modify workspace agent.",
          },
        });
      }

      const agentConfiguration = await AgentConfigurationModel.findOne({
        where: {
          sId: req.query.aId as string,
          workspaceId: auth.workspace()?.id,
        },
      });

      if (!agentConfiguration) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "agent_configuration_not_found",
            message: "The Agent you're trying to access was not found.",
          },
        });
      }

      const agentConfigurationRes = await createOrUpgradeAgentConfiguration({
        auth,
        assistant: bodyValidation.right.assistant,
        agentConfigurationId: req.query.aId as string,
      });

      if (agentConfigurationRes.isErr()) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "assistant_saving_error",
            message: `Error updating agent: ${agentConfigurationRes.error.message}`,
          },
        });
      }

      return res.status(200).json({
        agentConfiguration: agentConfigurationRes.value,
      });

    case "DELETE":
      if (!agent.canEdit && !auth.isAdmin()) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "app_auth_error",
            message: "Only editors can delete workspace agent.",
          },
        });
      }

      const archived = await archiveAgentConfiguration(
        auth,
        req.query.aId as string
      );
      if (!archived) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "agent_configuration_not_found",
            message: "The agent you're trying to delete was not found.",
          },
        });
      }

      return res.status(200).json({ success: true });

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message:
            "The method passed is not supported, GET or PATCH or DELETE is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(handler);
