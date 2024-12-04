import type { UserType, WithAPIErrorResponse } from "@dust-tt/types";
import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthentication } from "@app/lib/api/auth_wrappers";
import { UserResource } from "@app/lib/resources/user_resource";
import { apiError } from "@app/logger/withlogging";

export type GetUserDetailsResponseBody = Pick<
  UserType,
  "firstName" | "lastName" | "image"
>;

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetUserDetailsResponseBody>>
): Promise<void> {
  switch (req.method) {
    case "GET":
      const userId = req.query.uId;
      if (typeof userId !== "string" || userId === "") {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "The query parameter `uId` is not a string or is empty.",
          },
        });
      }

      try {
        parseInt(userId);
      } catch (e) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "The query parameter `uId` is not a number.",
          },
        });
      }

      const user = await UserResource.fetchByModelId(parseInt(userId));
      if (!user) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "user_not_found",
            message: "The user was not found.",
          },
        });
      }

      return res.status(200).json({
        firstName: user.firstName,
        lastName: user.lastName,
        image: user.imageUrl,
      });

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

export default withSessionAuthentication(handler);
