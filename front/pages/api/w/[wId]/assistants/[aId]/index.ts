import * as t from "io-ts";
import { NextApiRequest, NextApiResponse } from "next";

import { getAgentConfiguration } from "@app/lib/api/assistant/configuration";
import { Authenticator, getSession } from "@app/lib/auth";
import { ReturnedAPIErrorType } from "@app/lib/error";
import { apiError, withLogging } from "@app/logger/withlogging";
import { AgentConfigurationType } from "@app/types/assistant/agent";

export type GetAssistantResponseBody = {
  assistant: AgentConfigurationType;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<GetAssistantResponseBody | ReturnedAPIErrorType | void>
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

  if (!auth.user()) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "workspace_user_not_found",
        message: "Could not find the user of the current session.",
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
            message:
              "The agent configuration you're trying to access was not found.",
          },
        });
      }
      return res.status(200).json({
        assistant,
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

export default withLogging(handler);
