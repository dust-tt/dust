import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";

import { withSessionAuthentication } from "@app/lib/api/auth_wrappers";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { getUserFromSession } from "@app/lib/iam/session";
import { UserResource } from "@app/lib/resources/user_resource";
import { apiError } from "@app/logger/withlogging";
import type { UserMetadataType, WithAPIErrorResponse } from "@app/types";

export type PostUserMetadataResponseBody = {
  metadata: UserMetadataType;
};
export type GetUserMetadataResponseBody = {
  metadata: UserMetadataType | null;
};

const PatchUserMetadataRequestBodySchema = z.object({
  value: z.string(),
});

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<
      PostUserMetadataResponseBody | GetUserMetadataResponseBody
    >
  >,
  session: SessionWithUser
): Promise<void> {
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

  // We get the UserResource from the session userId.
  // Temporary, as we'd need to refactor the getUserFromSession method
  // to return the UserResource instead of a UserTypeWithWorkspace.
  const u = await UserResource.fetchByModelId(user.id);

  if (!u) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "user_not_found",
        message: "Could not find the user.",
      },
    });
  }

  const { key } = req.query;

  if (typeof key !== "string") {
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
      const metadata = await u.getMetadata(key);

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

      await u.setMetadata(key, req.body.value);

      res.status(200).json({
        metadata: {
          key,
          value: req.body.value,
        },
      });
      return;

    // PATCH is used to append a value to the existing metadata
    case "PATCH":
      const body = PatchUserMetadataRequestBodySchema.safeParse(req.body);
      if (!body.success || !body.data.value) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "The request body is invalid, expects { value: string }.",
          },
        });
      }

      await u.appendToMetadata(key, body.data.value);
      return res.status(200).json({
        metadata: {
          key,
          value: body.data.value,
        },
      });

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message:
            "The method passed is not supported, GET, PATCH, POST or DELETE is expected.",
        },
      });
  }
}

export default withSessionAuthentication(handler);
