import { pluginManager } from "@app/lib/api/poke/plugin_manager";
import { PluginRunResource } from "@app/lib/resources/plugin_run_resource";
import { ProgrammaticUsageConfigurationResource } from "@app/lib/resources/programmatic_usage_configuration_resource";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import { launchScheduleWorkspaceScrubWorkflow } from "@app/temporal/scrub_workspace/client";
import type { LightWorkspaceType } from "@app/types/user";
import { pokeApp } from "@front-api/middlewares/ctx";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";

export type PokeDowngradeWorkspaceResponseBody = {
  workspace: LightWorkspaceType;
};

// Mounted at /api/poke/workspaces/:wId/downgrade.
const app = pokeApp();

app.post(
  "/",
  async (ctx): HandlerResult<PokeDowngradeWorkspaceResponseBody> => {
    const auth = ctx.get("auth");
    const owner = auth.getNonNullableWorkspace();

    const plugin = pluginManager.getNonNullablePlugin("downgrade-no-plan");
    const pluginRun = await PluginRunResource.makeNew(
      plugin,
      {},
      auth.getNonNullableUser(),
      owner,
      {
        resourceId: owner.sId,
        resourceType: "workspaces",
      }
    );

    const programmaticUsageConfig =
      await ProgrammaticUsageConfigurationResource.fetchByWorkspaceId(auth);
    if (programmaticUsageConfig?.paygCapMicroUsd) {
      const errorMessage =
        "Cannot downgrade while PAYG is enabled. Please disable PAYG first.";
      await pluginRun.recordError(errorMessage);
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: errorMessage,
        },
      });
    }

    await SubscriptionResource.internalSubscribeWorkspaceToFreeNoPlan({
      workspaceId: owner.sId,
    });

    // On downgrade, start a workflow to pause all connectors + scrub the data
    // after a specified retention period.
    await launchScheduleWorkspaceScrubWorkflow({ workspaceId: owner.sId });

    await pluginRun.recordResult({
      display: "text",
      value: `Workspace ${owner.name} downgraded.`,
    });

    return ctx.json({
      workspace: renderLightWorkspaceType({
        workspace: owner,
        role: "admin",
      }),
    });
  }
);

export default app;
