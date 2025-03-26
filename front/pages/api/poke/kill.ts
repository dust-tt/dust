import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthentication } from "@app/lib/api/auth_wrappers";
import { Authenticator } from "@app/lib/auth";
import type { SessionWithUser } from "@app/lib/iam/provider";
import type { KillSwitchType } from "@app/lib/poke/types";
import { isKillSwitchType } from "@app/lib/poke/types";
import { KillSwitchResource } from "@app/lib/resources/kill_switch_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";

export type GetKillSwitchesResponseBody = {
  killSwitches: KillSwitchType[];
};

const KillSwitchTypeSchema = t.type({
  enabled: t.boolean,
  type: t.string,
});

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
      const payloadValidation = KillSwitchTypeSchema.decode(req.body);
      if (isLeft(payloadValidation)) {
        const pathError = reporter.formatValidationErrors(
          payloadValidation.left
        );
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `The request body is invalid: ${pathError}`,
          },
        });
      }
      const { enabled, type } = payloadValidation.right;
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

export default withSessionAuthentication(handler);
