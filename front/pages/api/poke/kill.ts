/** @ignoreswagger */
// @migration-status: MIGRATED_TO_HONO
import { withSessionAuthenticationForPoke } from "@app/lib/api/auth_wrappers";
import type { GetKillSwitchesResponseBody } from "@app/lib/api/poke/kill";
import { KillSwitchTypeSchema } from "@app/lib/api/poke/kill";
import { Authenticator } from "@app/lib/auth";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { isKillSwitchType } from "@app/lib/poke/types";
import { KillSwitchResource } from "@app/lib/resources/kill_switch_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { NextApiRequest, NextApiResponse } from "next";
import { fromError } from "zod-validation-error";

export type { GetKillSwitchesResponseBody };

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<GetKillSwitchesResponseBody | { success: true }>
  >,
  session: SessionWithUser
): Promise<void> {
  const auth = await Authenticator.fromSuperUserSession(session, null);

  if (!auth.isDustSuperUser()) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "user_not_found",
        message: "Could not find the user.",
      },
    });
  }

  switch (req.method) {
    case "GET":
      const killSwitches = await KillSwitchResource.listEnabledKillSwitches();
      return res.status(200).json({ killSwitches });
    case "POST":
      const payloadValidation = KillSwitchTypeSchema.safeParse(req.body);
      if (!payloadValidation.success) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `The request body is invalid: ${fromError(payloadValidation.error).toString()}`,
          },
        });
      }
      const { enabled, type } = payloadValidation.data;
      if (!isKillSwitchType(type)) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `The request body is invalid: ${type} is not a valid kill switch type`,
          },
        });
      }
      if (enabled) {
        await KillSwitchResource.enableKillSwitch(type);
      } else {
        await KillSwitchResource.disableKillSwitch(type);
      }
      return res.status(200).json({ success: true });

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, GET is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForPoke(handler);
