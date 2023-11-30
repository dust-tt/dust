import { AgentConfigurationType } from "@dust-tt/types";
import { isLeft } from "fp-ts/lib/Either";
import * as reporter from "io-ts-reporters";
import { NextApiRequest, NextApiResponse } from "next";

import {
  archiveAgentConfiguration,
  getAgentConfiguration,
} from "@app/lib/api/assistant/configuration";
import { Authenticator, getSession } from "@app/lib/auth";
import { ReturnedAPIErrorType } from "@app/lib/error";
import { apiError, withLogging } from "@app/logger/withlogging";

import {
  createOrUpgradeAgentConfiguration,
  PostOrPatchAgentConfigurationRequestBodySchema,
} from "..";

export type GetAgentConfigurationResponseBody = {
  agentConfiguration: AgentConfigurationType;
};
export type DeleteAgentConfigurationResponseBody = {
  success: boolean;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    | GetAgentConfigurationResponseBody
    | DeleteAgentConfigurationResponseBody
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
          "Only the users that are `builders` for the current workspace can access an Assistant.",
      },
    });
  }

  switch (req.method) {
    case "GET":
      const assistant = await getAgentConfiguration(
        auth,
        req.query.aId as string
      );
      if (!assistant) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "agent_configuration_not_found",
            message: "The Assistant you're trying to access was not found.",
          },
        });
      }
      return res.status(200).json({
        agentConfiguration: assistant,
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

      const agentConfiguration = await createOrUpgradeAgentConfiguration(
        auth,
        bodyValidation.right,
        req.query.aId as string
      );

      return res.status(200).json({
        agentConfiguration: agentConfiguration,
      });
    case "DELETE":
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

export default withLogging(handler);
