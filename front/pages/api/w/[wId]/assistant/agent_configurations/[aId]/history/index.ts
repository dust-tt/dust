import { isLeft } from "fp-ts/lib/Either";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import {
  getAgentConfiguration,
  getAgentConfigurations,
} from "@app/lib/api/assistant/configuration";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";
import type {
  LightAgentConfigurationType,
  WithAPIErrorResponse,
} from "@app/types";
import { GetAgentConfigurationsHistoryQuerySchema } from "@app/types";

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
  const assistant = await getAgentConfiguration(auth, aId, "light");
  if (!assistant || !assistant.canRead) {
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

      const agentConfigurations = await getAgentConfigurations({
        auth,
        agentsGetView: {
          agentIds: [aId],
          allVersions: true,
        },
        variant: "light",
        // Return the latest versions first
        sort: "updatedAt",
        limit,
      });

      if (
        !agentConfigurations ||
        (agentConfigurations[0].scope === "private" &&
          agentConfigurations[0].versionAuthorId !== auth.user()?.id)
      ) {
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
