import { getBuilderJsonSchemaGenerator } from "@app/lib/api/assistant/json_schema_generator";
import { getSmallWhitelistedModel } from "@app/lib/api/assistant/models";
import { getLargeWhitelistedModel } from "@app/lib/assistant";
import { InternalPostBuilderGenerateSchemaRequestBodySchema } from "@app/types/api/internal/assistant";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";

// Mounted at /api/w/:wId/assistant/builder/process/generate_schema.
const app = workspaceApp();

app.post(
  "/",
  validate("json", InternalPostBuilderGenerateSchemaRequestBodySchema),
  async (ctx) => {
    const auth = ctx.get("auth");
    const { instructions } = ctx.req.valid("json");

    const model = !auth.isUpgraded()
      ? await getSmallWhitelistedModel(auth)
      : await getLargeWhitelistedModel(auth);
    if (!model) {
      return apiError(ctx, {
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
      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: `Error generating schema: ${JSON.stringify(schemaRes.error)}`,
        },
      });
    }

    return ctx.json({ schema: schemaRes.value.schema });
  }
);

export default app;
