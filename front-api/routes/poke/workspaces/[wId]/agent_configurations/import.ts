import { createOrUpgradeAgentConfiguration } from "@app/lib/api/assistant/configuration/create_or_upgrade";
import { PostOrPatchAgentConfigurationRequestBodySchema } from "@app/types/api/internal/agent_configuration";
import type { AgentConfigurationType } from "@app/types/assistant/agent";
import { pokeApp } from "@front-api/middlewares/ctx";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";

export type PokeImportAgentConfigurationResponseBody = {
  assistant: AgentConfigurationType;
};

// Mounted at /api/poke/workspaces/:wId/agent_configurations/import.
const app = pokeApp();

app.post(
  "/",
  validate("json", PostOrPatchAgentConfigurationRequestBodySchema),
  async (ctx): HandlerResult<PokeImportAgentConfigurationResponseBody> => {
    const auth = ctx.get("auth");
    const body = ctx.req.valid("json");

    const result = await createOrUpgradeAgentConfiguration({
      auth,
      assistant: body.assistant,
    });

    if (result.isErr()) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: result.error.message,
        },
      });
    }

    return ctx.json({ assistant: result.value });
  }
);

export default app;
