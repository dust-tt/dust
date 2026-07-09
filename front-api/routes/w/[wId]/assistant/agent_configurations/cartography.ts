import { computeAgentCartographyCoordinates } from "@app/lib/api/assistant/cartography";
import type { GetAgentCartographyCoordinatesResponseBody } from "@app/types/api/assistant/cartography";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";

// Mounted at /api/w/:wId/assistant/agent_configurations/cartography. workspaceAuth
// is applied by the parent workspace sub-app.
const app = workspaceApp();

/** @ignoreswagger */
app.get(
  "/",
  async (ctx): HandlerResult<GetAgentCartographyCoordinatesResponseBody> => {
    const auth = ctx.get("auth");

    const result = await computeAgentCartographyCoordinates(auth);
    if (result.isErr()) {
      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: `Failed to compute agent cartography: ${result.error.message}`,
        },
      });
    }

    return ctx.json({ coordinates: result.value });
  }
);

export default app;
