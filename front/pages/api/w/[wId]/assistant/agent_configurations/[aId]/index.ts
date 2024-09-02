import type {
  AgentConfigurationType,
  WithAPIErrorResponse,
} from "@dust-tt/types";
import { PostOrPatchAgentConfigurationRequestBodySchema } from "@dust-tt/types";
import { isLeft } from "fp-ts/lib/Either";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import {
  archiveAgentConfiguration,
  getAgentConfiguration,
} from "@app/lib/api/assistant/configuration";
import { getAgentRecentAuthors } from "@app/lib/api/assistant/recent_authors";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/wrappers";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";
import { createOrUpgradeAgentConfiguration } from "@app/pages/api/w/[wId]/assistant/agent_configurations";

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
  const assistant = await getAgentConfiguration(auth, req.query.aId as string);
  if (
    !assistant ||
    (assistant.scope === "private" &&
      assistant.versionAuthorId !== auth.user()?.id)
  ) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "agent_configuration_not_found",
        message: "The Assistant you're trying to access was not found.",
      },
    });
  }

  switch (req.method) {
    case "GET":
      return res.status(200).json({
        agentConfiguration: {
          ...assistant,
          lastAuthors: await getAgentRecentAuthors({
            agent: assistant,
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

      if (assistant.scope === "workspace" && !auth.isBuilder()) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "app_auth_error",
            message: "Only builders can modify workspace assistants.",
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
        agentConfigurationId: req.query.aId as string,
      });

      if (agentConfigurationRes.isErr()) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "assistant_saving_error",
            message: `Error updating assistant: ${agentConfigurationRes.error.message}`,
          },
        });
      }

      return res.status(200).json({
        agentConfiguration: agentConfigurationRes.value,
      });

    case "DELETE":
      if (assistant.scope === "workspace" && !auth.isBuilder()) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "app_auth_error",
            message: "Only builders can modify workspace assistants.",
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
            message: "The Assistant you're trying to delete was not found.",
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
