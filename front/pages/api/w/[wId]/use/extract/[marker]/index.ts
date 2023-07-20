import { NextApiRequest, NextApiResponse } from "next";

import { getEventSchema, updateEventSchema } from "@app/lib/api/extract";
import { Authenticator, getSession, getUserFromSession } from "@app/lib/auth";
import { ReturnedAPIErrorType } from "@app/lib/error";
import { apiError, withLogging } from "@app/logger/withlogging";
import { EventSchemaType } from "@app/types/extract";

export type GetEventSchemaResponseBody = {
  schema: EventSchemaType;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<GetEventSchemaResponseBody | ReturnedAPIErrorType>
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
      const schema = await getEventSchema(auth, req.query.marker as string);
      if (!schema) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "template_not_found",
            message: "The workspace you're trying to modify was not found.",
          },
        });
      }
      res.status(200).json({
        schema,
      });
      return;
    case "PATCH":
      if (!auth.isBuilder()) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "app_auth_error",
            message:
              "Only the users that are `builders` for the current workspace can create templates to extract.",
          },
        });
      }

      if (
        !req.query.marker ||
        !(typeof req.query.marker == "string") ||
        !req.body ||
        !(typeof req.body.marker == "string") ||
        !(typeof req.body.description == "string") ||
        !Array.isArray(req.body.properties)
      ) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message:
              "The request body is invalid, expects { marker: string, description: string, properties: any[] }.",
          },
        });
      }

      const updatedSchema = await updateEventSchema(
        auth,
        req.query.marker,
        req.body.marker,
        req.body.description,
        req.body.properties
      );

      if (!updatedSchema) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "The request could not be processed.",
          },
        });
      }
      res.status(200).json({
        schema: updatedSchema,
      });
      return;

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message:
            "The method passed is not supported, GET or PATCH is expected.",
        },
      });
  }
}

export default withLogging(handler);
