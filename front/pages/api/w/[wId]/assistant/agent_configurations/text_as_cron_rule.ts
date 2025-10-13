import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";

import {
  generateCronRule,
  GENERIC_ERROR_MESSAGE,
  INVALID_TIMEZONE_MESSAGE,
  TOO_FREQUENT_MESSAGE,
} from "@app/lib/api/assistant/configuration/triggers";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { apiError, withLogging } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";

export type PostTextAsCronRuleResponseBody = {
  cronRule: string;
  timezone: string;
};

const PostTextAsCronRuleRequestBodySchema = z.object({
  naturalDescription: z.string(),
  defaultTimezone: z.string(),
});

export type PostTextAsCronRuleRequestBody = z.infer<
  typeof PostTextAsCronRuleRequestBodySchema
>;

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<PostTextAsCronRuleResponseBody>>,
  auth: Authenticator
): Promise<void> {
  switch (req.method) {
    case "POST": {
      const bodyValidation = PostTextAsCronRuleRequestBodySchema.safeParse(
        JSON.parse(req.body)
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

      const { naturalDescription, defaultTimezone } = bodyValidation.data;

      const r = await generateCronRule(auth, {
        naturalDescription,
        defaultTimezone,
      });

      if (r.isErr()) {
        const cleanMessage = [
          INVALID_TIMEZONE_MESSAGE,
          TOO_FREQUENT_MESSAGE,
        ].includes(r.error.message)
          ? r.error.message
          : GENERIC_ERROR_MESSAGE;
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: cleanMessage,
          },
        });
      }

      return res.status(200).json({
        cronRule: r.value.cron,
        timezone: r.value.timezone,
      });
    }

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, POST is expected.",
        },
      });
  }
}

export default withLogging(withSessionAuthenticationForWorkspace(handler));
