import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForPoke } from "@app/lib/api/auth_wrappers";
import { pluginManager } from "@app/lib/api/poke/plugin_manager";
import { Authenticator } from "@app/lib/auth";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { PluginRunResource } from "@app/lib/resources/plugin_run_resource";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import { apiError } from "@app/logger/withlogging";
import { launchScheduleWorkspaceScrubWorkflow } from "@app/temporal/scrub_workspace/client";
import type { LightWorkspaceType, WithAPIErrorResponse } from "@app/types";

export type DowngradeWorkspaceResponseBody = {
  workspace: LightWorkspaceType;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<DowngradeWorkspaceResponseBody>>,
  session: SessionWithUser
): Promise<void> {
  const auth = await Authenticator.fromSuperUserSession(
    session,
    req.query.wId as string
  );

  const owner = auth.workspace();

  if (!owner || !auth.isDustSuperUser()) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "user_not_found",
        message: "Could not find the user.",
      },
    });
  }

  switch (req.method) {
    case "POST":
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

      await SubscriptionResource.internalSubscribeWorkspaceToFreeNoPlan({
        workspaceId: owner.sId,
      });

      // On downgrade, start a worklflow to pause all connectors + scrub the data after a specified retention period.
      await launchScheduleWorkspaceScrubWorkflow({ workspaceId: owner.sId });

      await pluginRun.recordResult({
        display: "text",
        value: `Workspace ${owner.name} downgraded.`,
      });

      return res.status(200).json({
        workspace: renderLightWorkspaceType({
          workspace: owner,
          role: "admin",
        }),
      });

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, POST is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForPoke(handler);
