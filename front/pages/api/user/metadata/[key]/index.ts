import { UserMetadataType } from "@dust-tt/types";
import { ReturnedAPIErrorType } from "@dust-tt/types";
import { NextApiRequest, NextApiResponse } from "next";

import { getUserMetadata, setUserMetadata } from "@app/lib/api/user";
import { getSession, getUserFromSession } from "@app/lib/auth";
import { apiError, withLogging } from "@app/logger/withlogging";

export type PostUserMetadataResponseBody = {
  metadata: UserMetadataType;
};
export type GetUserMetadataResponseBody = {
  metadata: UserMetadataType | null;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    | PostUserMetadataResponseBody
    | GetUserMetadataResponseBody
    | ReturnedAPIErrorType
  >
): Promise<void> {
  const session = await getSession(req, res);
  const user = await getUserFromSession(session);

  if (!user) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "user_not_found",
        message: "The user was not found.",
      },
    });
  }

  if (typeof req.query.key != "string") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "The query parameter `key` is not a string.",
      },
    });
  }

  switch (req.method) {
    case "GET":
      const metadata = await getUserMetadata(user, req.query.key as string);

      res.status(200).json({
        metadata,
      });
      return;

    case "POST":
      if (!req.body || !(typeof req.body.value == "string")) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "The request body is invalid, expects { value: string }.",
          },
        });
      }

      await setUserMetadata(user, {
        key: req.query.key as string,
        value: req.body.value,
      });

      res.status(200).json({
        metadata: {
          key: req.query.key as string,
          value: req.body.value,
        },
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
