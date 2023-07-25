import { NextApiRequest, NextApiResponse } from "next";

import { deleteExtractedEvent, getExtractedEvents } from "@app/lib/api/extract";
import { Authenticator, getSession, getUserFromSession } from "@app/lib/auth";
import { APIErrorType, ReturnedAPIErrorType } from "@app/lib/error";
import { apiError, withLogging } from "@app/logger/withlogging";
import { ExtractedEventType } from "@app/types/extract";

export type GetExtractedEventsResponseBody = {
  events: ExtractedEventType[];
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<GetExtractedEventsResponseBody | ReturnedAPIErrorType>
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
        type: "extracted_event_not_found",
        message: "The event was not found.",
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
          "Only users of the current workspace can retrieve extracted events.",
      },
    });
  }

  switch (req.method) {
    case "GET":
      const events = await getExtractedEvents(
        auth,
        parseInt(req.query.id as string)
      );
      return res.status(200).json({ events });

    case "DELETE":
      try {
        await deleteExtractedEvent(auth, req.query.id as string);
        res.status(200).end();
      } catch (code) {
        let statusCode = 500;
        let apiErrorType = "internal_server_error" as APIErrorType;
        let apiErrorMessage = "An internal server error occured.";

        if (code === "extracted_event_not_found") {
          statusCode = 404;
          apiErrorType = "extracted_event_not_found";
          apiErrorMessage =
            "Could not find the extracted event you're trying to delete.";
        } else if (code === "extracted_event_auth_error") {
          statusCode = 403;
          apiErrorType = "extracted_event_auth_error";
          apiErrorMessage =
            "Only users of the current workspace can delete extracted events.";
        }

        return apiError(req, res, {
          status_code: statusCode,
          api_error: {
            type: apiErrorType,
            message: apiErrorMessage,
          },
        });
      }
      return;

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message:
            "The method passed is not supported, GET or DELETE is expected.",
        },
      });
  }
}

export default withLogging(handler);
