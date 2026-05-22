// @migration-status: MIGRATED_TO_HONO
/** @ignoreswagger */
import { upsertGlobalAgentSettings } from "@app/lib/api/assistant/global_agents/global_agents";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { fromError } from "zod-validation-error";

type PatchGlobalAgentSettingResponseBody = {
  success: boolean;
};
const PatchGlobalAgentSettingsRequestBodySchema = z.object({
  status: z.enum(["active", "disabled_by_admin"]),
});

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<PatchGlobalAgentSettingResponseBody | void>
  >,
  auth: Authenticator
): Promise<void> {
  if (!auth.isBuilder()) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "app_auth_error",
        message:
          "Only the users that are `builders` for the current workspace can access an agent.",
      },
    });
  }

  switch (req.method) {
    case "PATCH":
      const bodyValidation =
        PatchGlobalAgentSettingsRequestBodySchema.safeParse(req.body);
      if (!bodyValidation.success) {
        const pathError = fromError(bodyValidation.error).toString();
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid request body: ${pathError}`,
          },
        });
      }

      const created = await upsertGlobalAgentSettings(auth, {
        agentId: req.query.aId as string,
        status: bodyValidation.data.status,
      });

      if (!created) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "global_agent_error",
            message: "Couldn't update the settings for this global agent.",
          },
        });
      }

      return res.status(200).json({
        success: created,
      });
    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, PATCH is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(handler);
