import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import { NextApiRequest, NextApiResponse } from "next";

import {
  createAgentActionConfiguration,
  createAgentConfiguration,
  createAgentGenerationConfiguration,
  getAgentConfigurations,
} from "@app/lib/api/assistant/configuration";
import { Authenticator, getSession } from "@app/lib/auth";
import { ReturnedAPIErrorType } from "@app/lib/error";
import { apiError, withLogging } from "@app/logger/withlogging";
import { AgentConfigurationType } from "@app/types/assistant/agent";

export type GetAssistantResponseBody = {
  assistants: AgentConfigurationType[];
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

  const agentPrefix = req.query.agentPrefix;
  if (typeof agentPrefix !== "string") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "The agentPrefix parameter is required.",
      },
    });
  }

  switch (req.method) {
    case "GET":
      const assistants = await getAgentConfigurations(auth);
      return res.status(200).json({
        assistants,
      });

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, GET  is expected.",
        },
      });
  }
}

export default withLogging(handler);
