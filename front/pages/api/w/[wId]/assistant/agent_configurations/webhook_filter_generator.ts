/** @ignoreswagger */
import { getWebhookFilterGeneration } from "@app/lib/api/assistant/configuration/triggers/webhook_filter";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { apiError, withLogging } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import { isString } from "@app/types/shared/utils/general";
import {
  WEBHOOK_PRESETS,
  WEBHOOK_PROVIDERS,
} from "@app/types/triggers/webhooks";
import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";

export type PostWebhookFilterGeneratorResponseBody = {
  filter: string;
};

const PostWebhookFilterGeneratorRequestBodySchema = z.object({
  naturalDescription: z.string(),
  event: z.string(),
  provider: z.enum(WEBHOOK_PROVIDERS),
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
      let { body } = req;

      // String check for retro-compatibility w.r.t. old clients.
      // TODO(2026-03-18 aubin): remove this once we do not get calls from clients that predate the front-end change.
      if (isString(body)) {
        try {
          body = JSON.parse(body);
        } catch {
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: "Invalid request body, expected JSON.",
            },
          });
        }
      }

      const bodyValidation =
        PostWebhookFilterGeneratorRequestBodySchema.safeParse(body);

      if (!bodyValidation.success) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid request body: ${bodyValidation.error.message}`,
          },
        });
      }

      const {
        naturalDescription,
        event: eventValue,
        provider,
      } = bodyValidation.data;

      const {
        filterGenerationInstructions: providerSpecificInstructions,
        events,
      } = WEBHOOK_PRESETS[provider];

      const event = events.find((event) => event.value === eventValue);

      if (!event) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid event: ${eventValue} for provider ${provider}.`,
          },
        });
      }

      const filterGenerationResult = await getWebhookFilterGeneration(auth, {
        naturalDescription,
        event,
        providerSpecificInstructions,
      });

      if (filterGenerationResult.isErr()) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: filterGenerationResult.error.message,
          },
        });
      }

      return res.status(200).json({
        filter: filterGenerationResult.value.filter,
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
