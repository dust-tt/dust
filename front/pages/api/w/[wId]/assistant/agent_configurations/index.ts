import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import { NextApiRequest, NextApiResponse } from "next";

import {
  CreateAgentActionSchema,
  CreateAgentGenerationSchema,
  createOrUpgradeAgentConfiguration,
  getAgentConfigurations,
} from "@app/lib/api/assistant/configuration";
import { Authenticator, getSession } from "@app/lib/auth";
import { ReturnedAPIErrorType } from "@app/lib/error";
import { apiError, withLogging } from "@app/logger/withlogging";
import { AgentConfigurationType } from "@app/types/assistant/agent";

export type GetAgentConfigurationsResponseBody = {
  agentConfigurations: AgentConfigurationType[];
};
export type PostAgentConfigurationResponseBody = {
  agentConfiguration: AgentConfigurationType;
};

export const PostOrPatchAgentConfigurationRequestBodySchema = t.type({
  assistant: t.type({
    name: t.string,
    description: t.string,
    pictureUrl: t.string,
    status: t.union([t.literal("active"), t.literal("archived")]),
    action: t.union([t.null, CreateAgentActionSchema]),
    generation: CreateAgentGenerationSchema,
  }),
});

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    | GetAgentConfigurationsResponseBody
    | PostAgentConfigurationResponseBody
    | ReturnedAPIErrorType
    | void
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

  if (!auth.isBuilder()) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "app_auth_error",
        message:
          "Only the users that are `builders` for the current workspace can access Assistants.",
      },
    });
  }

  switch (req.method) {
    case "GET":
      const agentConfigurations = await getAgentConfigurations(auth);
      return res.status(200).json({
        agentConfigurations,
      });
    case "POST":
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

      const { name, pictureUrl, status, action, generation, description } =
        bodyValidation.right.assistant;

      const agentConfiguration = await createOrUpgradeAgentConfiguration(auth, {
        name,
        description,
        pictureUrl,
        status,
        generation: generation,
        action: action,
        agentConfigurationId: req.query.aId as string,
      });

      return res.status(200).json({
        agentConfiguration: agentConfiguration,
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

export default withLogging(handler);
