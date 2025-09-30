import { isLeft } from "fp-ts/lib/Either";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForPoke } from "@app/lib/api/auth_wrappers";
import { pluginManager } from "@app/lib/api/poke/plugin_manager";
import { Authenticator } from "@app/lib/auth";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { PluginRunResource } from "@app/lib/resources/plugin_run_resource";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import { apiError } from "@app/logger/withlogging";
import type { LightWorkspaceType, WithAPIErrorResponse } from "@app/types";
import { FreePlanUpgradeFormSchema } from "@app/types";

export type UpgradeWorkspaceResponseBody = {
  workspace: LightWorkspaceType;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<UpgradeWorkspaceResponseBody>>,
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
      const plugin = pluginManager.getNonNullablePlugin("upgrade-free-plan");
      const pluginRun = await PluginRunResource.makeNew(
        plugin,
        req.body,
        auth.getNonNullableUser(),
        owner,
        {
          resourceId: owner.sId,
          resourceType: "workspaces",
        }
      );

      const bodyValidation = FreePlanUpgradeFormSchema.decode(req.body);
      if (isLeft(bodyValidation)) {
        const pathError = reporter.formatValidationErrors(bodyValidation.left);
        const errorMessage = `The request body is invalid: ${pathError}`;
        await pluginRun.recordError(errorMessage);
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: errorMessage,
          },
        });
      }
      const body = bodyValidation.right;
      const planCode = body.planCode;
      const endDate = body.endDate;

      if (endDate && new Date(endDate) < new Date()) {
        const errorMessage = "The end date is in the past.";
        await pluginRun.recordError(errorMessage);
        return apiError(req, res, {
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

      await pluginRun.recordResult({
        display: "text",
        value: `Workspace ${owner.name} upgraded to plan ${planCode}.`,
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
