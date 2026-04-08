/** @ignoreswagger */
import { getAgentIdFromName } from "@app/lib/api/assistant/configuration/helpers";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";

export const GetAgentNameIsAvailableResponseBodySchema = z.object({
  available: z.boolean(),
});
export type GetAgentNameIsAvailableResponseBody = z.infer<
  typeof GetAgentNameIsAvailableResponseBodySchema
>;

export const GetAgentConfigurationNameIsAvailable = z.object({
  handle: z.string(),
});

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<GetAgentNameIsAvailableResponseBody | void>
  >,
  auth: Authenticator
): Promise<void> {
  switch (req.method) {
    case "GET":
      const bodyValidation = GetAgentConfigurationNameIsAvailable.safeParse(
        req.query
      );

      if (!bodyValidation.success) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid request body: ${bodyValidation.error.message}`,
          },
        });
      }
      const sId = await getAgentIdFromName(auth, bodyValidation.data.handle);
      const available = sId === null;
      return res.status(200).json({ available });

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
