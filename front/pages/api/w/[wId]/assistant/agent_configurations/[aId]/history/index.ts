import {
  getAgentConfiguration,
  listsAgentConfigurationVersions,
} from "@app/lib/api/assistant/configuration/agent";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";
import { GetAgentConfigurationsHistoryQuerySchema } from "@app/types/api/internal/agent_configuration";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import type { WithAPIErrorResponse } from "@app/types/error";
import { isLeft } from "fp-ts/lib/Either";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

export type GetAgentConfigurationsResponseBody = {
  history: LightAgentConfigurationType[];
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<GetAgentConfigurationsResponseBody | void>
  >,
  auth: Authenticator
): Promise<void> {
  const { aId } = req.query;
  if (typeof aId !== "string") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid agent ID provided.",
      },
    });
  }

  // Check that user has access to this agent
  const assistant = await getAgentConfiguration(auth, {
    agentId: aId,
    variant: "light",
  });
  if (!assistant || (!assistant.canRead && !auth.isAdmin())) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "agent_configuration_not_found",
        message: "The agent you're trying to access was not found.",
      },
    });
  }

  switch (req.method) {
    case "GET":
      // extract the limit from the query parameters
      const queryValidation = GetAgentConfigurationsHistoryQuerySchema.decode({
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

      const { limit } = queryValidation.right;

      let agentConfigurations = await listsAgentConfigurationVersions(auth, {
        agentId: aId,
        variant: "light",
      });

      // Return the latest versions first (sort by version DESC, which is already done in getAllVersionsForOneAgent)
      if (limit) {
        agentConfigurations = agentConfigurations.slice(0, limit);
      }

      if (!agentConfigurations || !agentConfigurations[0].canRead) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "agent_configuration_not_found",
            message: "The agent you're trying to access was not found.",
          },
        });
      }

      return res.status(200).json({ history: agentConfigurations });
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
