import { getWebhookFilterGeneration } from "@app/lib/api/assistant/configuration/triggers/webhook_filter";
import {
  WEBHOOK_PRESETS,
  WEBHOOK_PROVIDERS,
} from "@app/types/triggers/webhooks";
import { apiError } from "@front-api/middleware/utils";
import { validate } from "@front-api/middleware/validator";
import { Hono } from "hono";
import { z } from "zod";

const PostWebhookFilterGeneratorRequestBodySchema = z.object({
  naturalDescription: z.string(),
  event: z.string(),
  provider: z.enum(WEBHOOK_PROVIDERS),
});

// Mounted at /api/w/:wId/assistant/agent_configurations/webhook_filter_generator.
const app = new Hono();

app.post(
  "/",
  validate("json", PostWebhookFilterGeneratorRequestBodySchema),
  async (c) => {
    const auth = c.get("auth");
    const {
      naturalDescription,
      event: eventValue,
      provider,
    } = c.req.valid("json");

    const {
      filterGenerationInstructions: providerSpecificInstructions,
      events,
    } = WEBHOOK_PRESETS[provider];

    const event = events.find((event) => event.value === eventValue);

    if (!event) {
      return apiError(c, {
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
      return apiError(c, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: filterGenerationResult.error.message,
        },
      });
    }

    return c.json({ filter: filterGenerationResult.value.filter });
  }
);

export default app;
