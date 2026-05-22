import { getWebhookFilterGeneration } from "@app/lib/api/assistant/configuration/triggers/webhook_filter";
import {
  WEBHOOK_PRESETS,
  WEBHOOK_PROVIDERS,
} from "@app/types/triggers/webhooks";
import { workspaceApp } from "@front-api/middleware/env";
import type { HandlerResult } from "@front-api/middleware/utils";
import { apiError } from "@front-api/middleware/utils";
import { validate } from "@front-api/middleware/validator";
import { z } from "zod";

export type PostWebhookFilterGeneratorResponseBody = {
  filter: string;
};

const PostWebhookFilterGeneratorRequestBodySchema = z.object({
  naturalDescription: z.string(),
  event: z.string(),
  provider: z.enum(WEBHOOK_PROVIDERS),
});

// Mounted at /api/w/:wId/assistant/agent_configurations/webhook_filter_generator.
const app = workspaceApp();

app.post(
  "/",
  validate("json", PostWebhookFilterGeneratorRequestBodySchema),
  async (ctx): HandlerResult<PostWebhookFilterGeneratorResponseBody> => {
    const auth = ctx.get("auth");
    const {
      naturalDescription,
      event: eventValue,
      provider,
    } = ctx.req.valid("json");

    const {
      filterGenerationInstructions: providerSpecificInstructions,
      events,
    } = WEBHOOK_PRESETS[provider];

    const event = events.find((event) => event.value === eventValue);

    if (!event) {
      return apiError(ctx, {
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
      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: filterGenerationResult.error.message,
        },
      });
    }

    return ctx.json({ filter: filterGenerationResult.value.filter });
  }
);

export default app;
