import { AgentConfigurationType } from "@dust-tt/types";
import { ReturnedAPIErrorType } from "@dust-tt/types";
import { NextApiRequest, NextApiResponse } from "next";

import { duplicateAgentConfiguration } from "@app/lib/api/assistant/configuration";
import { Authenticator, getSession } from "@app/lib/auth";
import { apiError, withLogging } from "@app/logger/withlogging";

type GetAgentConfigurationResponseBody = {
  agentConfiguration: AgentConfigurationType;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<GetAgentConfigurationResponseBody | ReturnedAPIErrorType>
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

  if (!auth.isUser()) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "app_auth_error",
        message:
          "Only the users that are members for the current workspace can duplicate an Assistant.",
      },
    });
  }

  switch (req.method) {
    case "POST":
      const duplicated = await duplicateAgentConfiguration(
        auth,
        req.query.aId as string
      );

      return res.status(200).json({ agentConfiguration: duplicated });

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
