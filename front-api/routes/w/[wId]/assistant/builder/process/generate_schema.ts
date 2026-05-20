import { getBuilderJsonSchemaGenerator } from "@app/lib/api/assistant/json_schema_generator";
import {
  getLargeWhitelistedModel,
  getSmallWhitelistedModel,
} from "@app/lib/assistant";
import { InternalPostBuilderGenerateSchemaRequestBodySchema } from "@app/types/api/internal/assistant";
import { apiError } from "@front-api/middleware/utils";
import { validate } from "@front-api/middleware/validator";
import { Hono } from "hono";

// Mounted at /api/w/:wId/assistant/builder/process/generate_schema.
const app = new Hono();

app.post(
  "/",
  validate("json", InternalPostBuilderGenerateSchemaRequestBodySchema),
  async (c) => {
    const auth = c.get("auth");
    const { instructions } = c.req.valid("json");

    const model = !auth.isUpgraded()
      ? await getSmallWhitelistedModel(auth)
      : await getLargeWhitelistedModel(auth);
    if (!model) {
      return apiError(c, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "No whitelisted models were found for the workspace.",
        },
      });
    }

    const schemaRes = await getBuilderJsonSchemaGenerator(auth, {
      instructions,
      modelId: model.modelId,
      providerId: model.providerId,
    });

    if (schemaRes.isErr()) {
      return apiError(c, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: `Error generating schema: ${JSON.stringify(schemaRes.error)}`,
        },
      });
    }

    return c.json({ schema: schemaRes.value.schema });
  }
);

export default app;
