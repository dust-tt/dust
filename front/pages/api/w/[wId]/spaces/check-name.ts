import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { NextApiRequest, NextApiResponse } from "next";
import z from "zod";

const CheckNameQuerySchema = z.object({
  name: z.string().min(1),
});

export type CheckNameResponseBody = {
  available: boolean;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<CheckNameResponseBody>>,
  auth: Authenticator
): Promise<void> {
  switch (req.method) {
    case "GET": {
      const queryValidation = CheckNameQuerySchema.safeParse(req.query);
      if (!queryValidation.success) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "The query parameter `name` is required.",
          },
        });
      }

      const { name } = queryValidation.data;

      // Find the space with this name (case-insensitive)
      const existingSpace = await SpaceResource.fetchByName(auth, name);
      return res.status(200).json({ available: !existingSpace });
    }

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

export default withSessionAuthenticationForWorkspace(handler);
