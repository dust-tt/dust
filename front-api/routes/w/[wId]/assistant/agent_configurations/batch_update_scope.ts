import { updateAgentConfigurationsScope } from "@app/lib/api/assistant/configuration/agent";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const BatchUpdateAgentScopeRequestBodySchema = z.object({
  agentIds: z.array(z.string()),
  scope: z.enum(["hidden", "visible"]),
});

// Mounted at /api/w/:wId/assistant/agent_configurations/batch_update_scope.
const app = workspaceApp();

app.post(
  "/",
  validate("json", BatchUpdateAgentScopeRequestBodySchema),
  async (ctx) => {
    const auth = ctx.get("auth");

    if (!auth.isBuilder()) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "app_auth_error",
          message: "You do not have the required permissions.",
        },
      });
    }

    const { agentIds, scope } = ctx.req.valid("json");

    const result = await updateAgentConfigurationsScope(auth, agentIds, scope);
    if (result.isErr()) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: result.error.message,
        },
      });
    }

    return ctx.json({ success: true });
  }
);

export default app;
