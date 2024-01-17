import type { ReturnedAPIErrorType } from "@dust-tt/types";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { agentNameIsAvailable } from "@app/lib/api/assistant/configuration";
import { Authenticator, getSession } from "@app/lib/auth";
import { apiError, withLogging } from "@app/logger/withlogging";

export type GetAgentNameIsAvailableResponseBody = {
  available: boolean;
};

export const GetAgentConfigurationNameIsAvailable = t.type({
  handle: t.string,
});

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    GetAgentNameIsAvailableResponseBody | ReturnedAPIErrorType | void
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
        message: "The workspace you're trying to access to was not found.",
      },
    });
  }

  switch (req.method) {
    case "GET":
      if (!auth.isUser()) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "app_auth_error",
            message: "Only the workspace users can see Assistants.",
          },
        });
      }
      const bodyValidation = GetAgentConfigurationNameIsAvailable.decode(
        req.query
      );

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
      const available = await agentNameIsAvailable(
        auth,
        bodyValidation.right.handle
      );
      return res.status(200).json({ available });

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
