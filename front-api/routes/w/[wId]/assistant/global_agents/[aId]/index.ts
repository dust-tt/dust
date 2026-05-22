import { upsertGlobalAgentSettings } from "@app/lib/api/assistant/global_agents/global_agents";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const PatchGlobalAgentSettingsRequestBodySchema = z.object({
  status: z.enum(["active", "disabled_by_admin"]),
});

export type PatchGlobalAgentSettingResponseBody = {
  success: boolean;
};

// Mounted at /api/w/:wId/assistant/global_agents/:aId.
const app = workspaceApp();

app.patch(
  "/",
  validate("json", PatchGlobalAgentSettingsRequestBodySchema),
  async (ctx): HandlerResult<PatchGlobalAgentSettingResponseBody> => {
    const auth = ctx.get("auth");

    if (!auth.isBuilder()) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "app_auth_error",
          message:
            "Only the users that are `builders` for the current workspace can access an agent.",
        },
      });
    }

    const agentId = ctx.req.param("aId") ?? "";
    const body = ctx.req.valid("json");

    const created = await upsertGlobalAgentSettings(auth, {
      agentId,
      status: body.status,
    });

    if (!created) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "global_agent_error",
          message: "Couldn't update the settings for this global agent.",
        },
      });
    }

    return ctx.json({ success: created });
  }
);

export default app;
