import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";

import { generateWebhookFilter } from "@app/lib/api/assistant/configuration/triggers";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { apiError, withLogging } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";

export type PostWebhookFilterGeneratorResponseBody = {
  filter: string;
};

const PostWebhookFilterGeneratorRequestBodySchema = z.object({
  naturalDescription: z.string(),
  eventSchema: z.record(z.any()).optional(),
});

export type PostWebhookFilterGeneratorRequestBody = z.infer<
  typeof PostWebhookFilterGeneratorRequestBodySchema
>;

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<PostWebhookFilterGeneratorResponseBody>
  >,
  auth: Authenticator
): Promise<void> {
  switch (req.method) {
    case "POST": {
      const bodyValidation =
        PostWebhookFilterGeneratorRequestBodySchema.safeParse(
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

      const { naturalDescription, eventSchema } = bodyValidation.data;

      const r = await generateWebhookFilter(auth, {
        naturalDescription,
        eventSchema,
      });

      if (r.isErr()) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: r.error.message,
          },
        });
      }

      return res.status(200).json({
        filter: r.value.filter,
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
