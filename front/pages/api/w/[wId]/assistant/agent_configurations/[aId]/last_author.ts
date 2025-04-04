import type { NextApiRequest, NextApiResponse } from "next";

import { getAgentConfiguration } from "@app/lib/api/assistant/configuration";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { UserResource } from "@app/lib/resources/user_resource";
import { apiError } from "@app/logger/withlogging";
import type { UserType, WithAPIErrorResponse } from "@app/types";

export type GetAgentLastAuthorResponseBody = {
  user: UserType | null;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetAgentLastAuthorResponseBody>>,
  auth: Authenticator
): Promise<void> {
  switch (req.method) {
    case "GET":
      const agentConfiguration = await getAgentConfiguration(
        auth,
        req.query.aId as string,
        "light"
      );
      if (!agentConfiguration) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "agent_configuration_not_found",
            message: "The agent you're trying to access was not found.",
          },
        });
      }

      if (!agentConfiguration.versionAuthorId) {
        return res.status(200).json({
          user: null,
        });
      }

      const agentLastAuthor = await UserResource.fetchByModelIds([
        agentConfiguration.versionAuthorId,
      ]);

      return res.status(200).json({
        user: agentLastAuthor[0] ? agentLastAuthor[0].toJSON() : null,
      });

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, POST is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(handler);
