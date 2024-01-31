import type { WithAPIErrorReponse } from "@dust-tt/types";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { upsertGlobalAgentSettings } from "@app/lib/api/assistant/global_agents";
import { Authenticator, getSession } from "@app/lib/auth";
import { apiError, withLogging } from "@app/logger/withlogging";

type PatchGlobalAgentSettingResponseBody = {
  success: boolean;
};
const PatchGlobalAgentSettingsRequestBodySchema = t.type({
  status: t.union([t.literal("active"), t.literal("disabled_by_admin")]),
});

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorReponse<PatchGlobalAgentSettingResponseBody | void>
  >
): Promise<void> {
  const session = await getSession(req, res);
  const auth = await Authenticator.fromSession(
    session,
    req.query.wId as string
  );
  const owner = auth.workspace();
  if (!owner) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "workspace_not_found",
        message: "The workspace you're trying to modify was not found.",
      },
    });
  }

  if (!auth.isBuilder()) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "app_auth_error",
        message:
          "Only the users that are `builders` for the current workspace can access an Assistant.",
      },
    });
  }

  switch (req.method) {
    case "PATCH":
      const bodyValidation = PatchGlobalAgentSettingsRequestBodySchema.decode(
        req.body
      );
      if (isLeft(bodyValidation)) {
        const pathError = reporter.formatValidationErrors(bodyValidation.left);
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
        status: bodyValidation.right.status,
      });

      if (!created) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "global_agent_error",
            message: "Couldn't update the settings for this global Assistant.",
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

export default withLogging(handler);
