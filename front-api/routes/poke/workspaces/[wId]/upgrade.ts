import { pluginManager } from "@app/lib/api/poke/plugin_manager";
import { restoreWorkspaceAfterSubscription } from "@app/lib/api/subscription";
import { PluginRunResource } from "@app/lib/resources/plugin_run_resource";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import { FreePlanUpgradeFormSchema } from "@app/types/plan";
import type { LightWorkspaceType } from "@app/types/user";
import { apiError, type HandlerResult } from "@front-api/middleware/utils";
import { Hono } from "hono";
import { fromError } from "zod-validation-error";

export type PokeUpgradeWorkspaceResponseBody = {
  workspace: LightWorkspaceType;
};

// Mounted at /api/poke/workspaces/:wId/upgrade.
const app = new Hono();

app.post("/", async (ctx): HandlerResult<PokeUpgradeWorkspaceResponseBody> => {
  const auth = ctx.get("auth");
  const owner = auth.getNonNullableWorkspace();
  const body = await ctx.req.json().catch(() => ({}));

  const plugin = pluginManager.getNonNullablePlugin("upgrade-free-plan");
  const pluginRun = await PluginRunResource.makeNew(
    plugin,
    body,
    auth.getNonNullableUser(),
    owner,
    { resourceId: owner.sId, resourceType: "workspaces" }
  );

  const bodyValidation = FreePlanUpgradeFormSchema.safeParse(body);
  if (!bodyValidation.success) {
    const errorMessage = `The request body is invalid: ${fromError(bodyValidation.error).toString()}`;
    await pluginRun.recordError(errorMessage);
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: errorMessage,
      },
    });
  }
  const { planCode, endDate } = bodyValidation.data;

  if (endDate && new Date(endDate) < new Date()) {
    const errorMessage = "The end date is in the past.";
    await pluginRun.recordError(errorMessage);
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "The end date is in the past.",
      },
    });
  }

  await SubscriptionResource.pokeUpgradeWorkspaceToPlan({
    auth,
    planCode,
    endDate: endDate ? new Date(endDate) : null,
  });

  await restoreWorkspaceAfterSubscription(auth);

  await pluginRun.recordResult({
    display: "text",
    value: `Workspace ${owner.name} upgraded to plan ${planCode}.`,
  });

  return ctx.json({
    workspace: renderLightWorkspaceType({ workspace: owner, role: "admin" }),
  });
});

export default app;
