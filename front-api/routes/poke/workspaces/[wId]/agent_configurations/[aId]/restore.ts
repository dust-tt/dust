import {
  getAgentConfiguration,
  restoreAgentConfiguration,
} from "@app/lib/api/assistant/configuration/agent";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { pokeApp } from "@front-api/middlewares/ctx";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import type { SuccessResponseBody } from "@front-api/routes/types";

// Mounted at /api/poke/workspaces/:wId/agent_configurations/:aId/restore.
const app = pokeApp();

app.post("/", async (ctx): HandlerResult<SuccessResponseBody> => {
  const auth = ctx.get("auth");
  const aId = ctx.req.param("aId") ?? "";

  const agentConfiguration = await getAgentConfiguration(auth, {
    agentId: aId,
    variant: "light",
  });
  if (!agentConfiguration) {
    return apiError(ctx, {
      status_code: 404,
      api_error: {
        type: "agent_configuration_not_found",
        message: "Could not find the agent configuration.",
      },
    });
  }

  const restoredResult = await restoreAgentConfiguration(
    auth,
    agentConfiguration.sId
  );

  if (restoredResult.isErr()) {
    switch (restoredResult.error.code) {
      case "name_conflict":
        return apiError(ctx, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: restoredResult.error.message,
          },
        });
      case "unauthorized":
        return apiError(ctx, {
          status_code: 403,
          api_error: {
            type: "app_auth_error",
            message: restoredResult.error.message,
          },
        });
      case "internal_error":
        return apiError(ctx, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "Could not restore the agent configuration.",
          },
        });
      default:
        assertNever(restoredResult.error.code);
    }
  }

  if (!restoredResult.value.restored) {
    return apiError(ctx, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: "Could not restore the agent configuration.",
      },
    });
  }

  return ctx.json({ success: true });
});

export default app;
