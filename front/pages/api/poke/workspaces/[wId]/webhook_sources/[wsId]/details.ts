/** @ignoreswagger */
// @migration-status: MIGRATED_TO_HONO
import { withSessionAuthenticationForPoke } from "@app/lib/api/auth_wrappers";
import type { PokeGetWebhookSourceDetails } from "@app/lib/api/poke/webhook_sources";
import { getWebhookSourceAdminDetails } from "@app/lib/api/webhook_source";
import { Authenticator } from "@app/lib/auth";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { WebhookSourceResource } from "@app/lib/resources/webhook_source_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import { isString } from "@app/types/shared/utils/general";
import type { NextApiRequest, NextApiResponse } from "next";

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<PokeGetWebhookSourceDetails>>,
  session: SessionWithUser
): Promise<void> {
  const { wId, wsId } = req.query;
  if (!isString(wId) || !isString(wsId)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid workspace or webhook source ID.",
      },
    });
  }

  const auth = await Authenticator.fromSuperUserSession(session, wId);
  const owner = auth.workspace();

  if (!owner || !auth.isDustSuperUser()) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "workspace_not_found",
        message: "Workspace not found.",
      },
    });
  }

  switch (req.method) {
    case "GET": {
      const source = await WebhookSourceResource.fetchById(auth, wsId);
      if (!source) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "webhook_source_not_found",
            message: "Webhook source not found.",
          },
        });
      }

      const details = await getWebhookSourceAdminDetails(auth, source);

      return res.status(200).json(details);
    }

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
