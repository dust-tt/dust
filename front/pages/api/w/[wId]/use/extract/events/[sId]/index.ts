import type { ExtractedEventType } from "@dust-tt/types";
import type { ReturnedAPIErrorType } from "@dust-tt/types";
import type { NextApiRequest, NextApiResponse } from "next";

import { getExtractedEvent, updateExtractedEvent } from "@app/lib/api/extract";
import { Authenticator, getSession } from "@app/lib/auth";
import { apiError, withLogging } from "@app/logger/withlogging";

export type GetExtractedEventResponseBody = {
  event: ExtractedEventType;
};
export type GetExtractedEventsResponseBody = {
  events: ExtractedEventType[];
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<GetExtractedEventResponseBody | ReturnedAPIErrorType>
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
        message: "The workspace you're trying to interact with was not found.",
      },
    });
  }

  if (!auth.isBuilder()) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message: "Only builders can edit extracted events.",
      },
    });
  }

  const eventSId = req.query.sId as string;
  const event = await getExtractedEvent({
    auth,
    sId: eventSId,
  });
  if (!event) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "extracted_event_not_found",
        message: "The event was not found.",
      },
    });
  }

  switch (req.method) {
    case "PATCH":
      let isRequestValid = false;
      if (
        typeof req.body.status == "string" &&
        ["pending", "accepted", "rejected"].includes(req.body.status)
      ) {
        isRequestValid = true;
      }
      if (typeof req.body.properties == "string") {
        isRequestValid = true;
      }

      if (!isRequestValid) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "The request body is invalid.",
          },
        });
      }

      let updatedEvent = null;
      if (req.body.status) {
        updatedEvent = await updateExtractedEvent({
          auth,
          sId: eventSId,
          status: req.body.status,
          properties: null,
        });
      }
      if (req.body.properties) {
        updatedEvent = await updateExtractedEvent({
          auth,
          sId: eventSId,
          status: null,
          properties: JSON.parse(req.body.properties),
        });
      }

      if (!updatedEvent) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "The request could not be processed.",
          },
        });
      }
      res.status(200).json({
        event: updatedEvent,
      });
      return;

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, PATCH is expected.",
        },
      });
  }
}

export default withLogging(handler);
