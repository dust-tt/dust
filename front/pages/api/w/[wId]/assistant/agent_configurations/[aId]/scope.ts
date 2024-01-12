import { ReturnedAPIErrorType } from "@dust-tt/types";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import { NextApiRequest, NextApiResponse } from "next";

import {
  getAgentConfiguration,
  setAgentScope,
} from "@app/lib/api/assistant/configuration";
import { Authenticator, getSession } from "@app/lib/auth";
import { apiError, withLogging } from "@app/logger/withlogging";

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ReturnedAPIErrorType | void>
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
          "Only users of the current workspace can access its assistants.",
      },
    });
  }
  const assistant = await getAgentConfiguration(auth, req.query.aId as string);
  if (
    !assistant ||
    (assistant.scope === "private" &&
      assistant.versionAuthorId !== auth.user()?.id)
  ) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "agent_configuration_not_found",
        message: "The Assistant you're trying to access was not found.",
      },
    });
  }

  switch (req.method) {
    case "POST":
      const bodyValidation = t
        .type({
          scope: t.union([
            t.literal("workspace"),
            t.literal("published"),
            t.literal("private"),
          ]),
        })
        .decode(req.body);
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

      if (assistant.scope === "workspace" && !auth.isBuilder()) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "app_auth_error",
            message: "Only builders can modify workspace assistants.",
          },
        });
      }
      if (
        assistant.scope !== "private" &&
        bodyValidation.right.scope === "private"
      ) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "Non-private assistants cannot be set back to private.",
          },
        });
      }

      const result = await setAgentScope(
        auth,
        assistant.sId,
        bodyValidation.right.scope
      );

      if (result.isErr()) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: result.error.message,
          },
        });
      }

      res.status(200).end();
      return;

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

export default withLogging(handler);
