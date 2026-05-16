import { Hono } from "hono";

import { getBuilderJsonSchemaGenerator } from "@app/lib/api/assistant/json_schema_generator";
import {
  getLargeWhitelistedModel,
  getSmallWhitelistedModel,
} from "@app/lib/assistant";
import { InternalPostBuilderGenerateSchemaRequestBodySchema } from "@app/types/api/internal/assistant";

import { validate } from "../../../../middleware/validator";

// Mounted under /api/w/:wId/assistant/builder/process.

export const processApp = new Hono();

processApp.post(
  "/generate_schema",
  validate("json", InternalPostBuilderGenerateSchemaRequestBodySchema),
  async (c) => {
    const auth = c.get("auth");
    const { instructions } = c.req.valid("json");

    const model = !auth.isUpgraded()
      ? await getSmallWhitelistedModel(auth)
      : await getLargeWhitelistedModel(auth);
    if (!model) {
      return c.json(
        {
          error: {
            type: "invalid_request_error",
            message: "No whitelisted models were found for the workspace.",
          },
        },
        400
      );
    }

    const schemaRes = await getBuilderJsonSchemaGenerator(auth, {
      instructions,
      modelId: model.modelId,
      providerId: model.providerId,
    });

    if (schemaRes.isErr()) {
      return c.json(
        {
          error: {
            type: "internal_server_error",
            message: `Error generating schema: ${JSON.stringify(schemaRes.error)}`,
          },
        },
        500
      );
    }

    return c.json({ schema: schemaRes.value.schema });
  }
);
