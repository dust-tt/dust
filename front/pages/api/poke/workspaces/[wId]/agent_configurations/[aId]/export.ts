import type { NextApiRequest, NextApiResponse } from "next";

import type { AgentActionConfigurationType } from "@app/lib/actions/types/agent";
import { getAgentConfiguration } from "@app/lib/api/assistant/configuration";
import { withSessionAuthentication } from "@app/lib/api/auth_wrappers";
import { Authenticator } from "@app/lib/auth";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { apiError } from "@app/logger/withlogging";
import type {
  LightAgentConfigurationType,
  WithAPIErrorResponse,
} from "@app/types";

export type ExportAgentConfigurationResponseBody = {
  assistant: Omit<
    LightAgentConfigurationType,
    | "id"
    | "versionCreatedAt"
    | "sId"
    | "version"
    | "owner"
    | "workspace"
    | "createdAt"
    | "versionAuthorId"
    | "userFavorite"
    | "requestedGroupIds"
  > & {
    // If empty, no actions are performed, otherwise the actions are performed.
    actions: Omit<AgentActionConfigurationType, "id" | "sId">[];
  };
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<ExportAgentConfigurationResponseBody>
  >,
  session: SessionWithUser
): Promise<void> {
  const auth = await Authenticator.fromSuperUserSession(
    session,
    req.query.wId as string
  );

  const { aId } = req.query;
  if (typeof aId !== "string") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid path parameters.",
      },
    });
  }

  const agentConfiguration = await getAgentConfiguration(auth, aId, "full");
  if (!agentConfiguration) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "agent_configuration_not_found",
        message: "The agent configuration you requested was not found.",
      },
    });
  }

  if (
    agentConfiguration.status !== "active" ||
    agentConfiguration.scope === "global"
  ) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "The agent configuration is not active, or has global scope.",
      },
    });
  }

  switch (req.method) {
    case "GET":
      res.status(200).json({
        assistant: {
          name: agentConfiguration.name,
          description: agentConfiguration.description,
          instructions: agentConfiguration.instructions,
          pictureUrl: agentConfiguration.pictureUrl,
          status: agentConfiguration.status,
          scope: agentConfiguration.scope,
          model: agentConfiguration.model,
          actions: agentConfiguration.actions.map((action) => {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { id, sId, ...actionWithoutIds } = action;
            return {
              ...actionWithoutIds,
              ...("dataSources" in action ? { dataSources: [] } : {}),
              ...("tables" in action ? { tables: [] } : {}),
            };
          }),
          templateId: agentConfiguration.templateId,
          maxStepsPerRun: agentConfiguration.maxStepsPerRun,
          visualizationEnabled: agentConfiguration.visualizationEnabled,
        },
      });
      return;

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

export default withSessionAuthentication(handler);
