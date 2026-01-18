import type { NextApiRequest, NextApiResponse } from "next";

import { listsAgentConfigurationVersions } from "@app/lib/api/assistant/configuration/agent";
import { getAuthors, getEditors } from "@app/lib/api/assistant/editors";
import { withSessionAuthenticationForPoke } from "@app/lib/api/auth_wrappers";
import { Authenticator } from "@app/lib/auth";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { apiError } from "@app/logger/withlogging";
import type {
  AgentConfigurationType,
  SpaceType,
  UserType,
  WithAPIErrorResponse,
} from "@app/types";

export type PokeGetAgentDetails = {
  agentConfigurations: AgentConfigurationType[];
  authors: UserType[];
  lastVersionEditors: UserType[];
  spaces: SpaceType[];
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<PokeGetAgentDetails>>,
  session: SessionWithUser
): Promise<void> {
  const { wId, aId } = req.query;
  if (typeof wId !== "string" || typeof aId !== "string") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid workspace or agent ID.",
      },
    });
  }

  const auth = await Authenticator.fromSuperUserSession(session, wId);
  const owner = auth.workspace();

  if (!owner || !auth.isDustSuperUser()) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "workspace_not_found",
        message: "Workspace not found.",
      },
    });
  }

  switch (req.method) {
    case "GET":
      const agentConfigurations = await listsAgentConfigurationVersions(auth, {
        agentId: aId,
        variant: "full",
      });

      if (agentConfigurations.length === 0) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "agent_configuration_not_found",
            message: "Agent configuration not found.",
          },
        });
      }

      const lastVersionEditors = await getEditors(auth, agentConfigurations[0]);
      const [latestAgentConfiguration] = agentConfigurations;

      const spaces = await SpaceResource.fetchByIds(
        auth,
        latestAgentConfiguration.requestedSpaceIds
      );

      return res.status(200).json({
        agentConfigurations,
        authors: await getAuthors(agentConfigurations),
        lastVersionEditors,
        spaces: spaces.map((s) => s.toJSON()),
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

export default withSessionAuthenticationForPoke(handler);
