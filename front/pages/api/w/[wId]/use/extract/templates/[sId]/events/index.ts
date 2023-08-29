import { NextApiRequest, NextApiResponse } from "next";

import { getExtractedEvents } from "@app/lib/api/extract";
import { getEventSchema } from "@app/lib/api/extract";
import { Authenticator, getSession, getUserFromSession } from "@app/lib/auth";
import { ReturnedAPIErrorType } from "@app/lib/error";
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
          "Only users of the current workspace can retrieve extracted events.",
      },
    });
  }

  const schema = await getEventSchema({ auth, sId: req.query.sId as string });
  if (!schema) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "event_schema_not_found",
        message: "The schema was not found.",
      },
    });
  }

  switch (req.method) {
    case "GET":
      const events = await getExtractedEvents({
        auth,
        schemaSId: req.query.sId as string,
      });
      return res.status(200).json({ events });

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
