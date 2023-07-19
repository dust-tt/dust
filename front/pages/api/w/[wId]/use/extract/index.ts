import { NextApiRequest, NextApiResponse } from "next";

import { getEventSchemas } from "@app/lib/api/extract";
import { Authenticator, getSession, getUserFromSession } from "@app/lib/auth";
import { ReturnedAPIErrorType } from "@app/lib/error";
import { apiError, withLogging } from "@app/logger/withlogging";
import { EventSchemaType } from "@app/types/extract";

export type GetEventSchemasResponseBody = {
  schemas: EventSchemaType[];
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<GetEventSchemasResponseBody | ReturnedAPIErrorType>
) {
  const session = await getSession(req, res);
  const user = await getUserFromSession(session);
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

  if (!user) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "workspace_user_not_found",
        message: "Could not find the user of the current session.",
      },
    });
  }

  if (!auth.isUser()) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message:
          "Only users of the current workspace can retrieve event schemas.",
      },
    });
  }

  switch (req.method) {
    case "GET":
      const schemas = await getEventSchemas(auth);

      res.status(200).json({
        schemas,
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

export default withLogging(handler);
