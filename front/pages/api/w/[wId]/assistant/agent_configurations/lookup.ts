/** @ignoreswagger */
import { getAgentIdFromName } from "@app/lib/api/assistant/configuration/helpers";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";

const GetLookupRequestSchema = z.object({
  handle: z.string(),
});

const GetLookupResponseBodySchema = z.object({
  sId: z.string(),
});
type GetLookupResponseBody = z.infer<typeof GetLookupResponseBodySchema>;

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetLookupResponseBody | void>>,
  auth: Authenticator
): Promise<void> {
  switch (req.method) {
    case "GET":
      const bodyValidation = GetLookupRequestSchema.safeParse(req.query);

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
      if (!sId) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "agent_configuration_not_found",
            message: "The Agent you're trying to access was not found.",
          },
        });
      }

      return res.status(200).json({ sId });

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
