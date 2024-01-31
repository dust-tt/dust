import type { EventSchemaType, WithAPIErrorReponse } from "@dust-tt/types";
import type { NextApiRequest, NextApiResponse } from "next";

import { createEventSchema, getEventSchemas } from "@app/lib/api/extract";
import { Authenticator, getSession } from "@app/lib/auth";
import { apiError, withLogging } from "@app/logger/withlogging";

export type GetEventSchemasResponseBody = {
  schemas: EventSchemaType[];
};
export type CreateEventSchemaResponseBody = {
  schema: EventSchemaType;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorReponse<
      GetEventSchemasResponseBody | CreateEventSchemaResponseBody
    >
  >
) {
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

    case "POST":
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

      const newSchema = await createEventSchema({
        auth,
        marker: req.body.marker,
        description: req.body.description,
        properties: req.body.properties,
      });

      if (!newSchema) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "The request could not be processed.",
          },
        });
      }
      res.status(200).json({
        schema: newSchema,
      });
      return;

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message:
            "The method passed is not supported, GET or POST is expected.",
        },
      });
  }
}

export default withLogging(handler);
