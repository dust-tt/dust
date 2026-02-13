import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForPoke } from "@app/lib/api/auth_wrappers";
import { Authenticator } from "@app/lib/auth";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { TriggerResource } from "@app/lib/resources/trigger_resource";
import { WebhookSourceResource } from "@app/lib/resources/webhook_source_resource";
import { WebhookSourcesViewResource } from "@app/lib/resources/webhook_sources_view_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import { isString } from "@app/types/shared/utils/general";
import type { WebhookSourceType } from "@app/types/triggers/webhooks";

export type PokeListWebhookSources = {
  webhookSources: Array<
    WebhookSourceType & { viewCount: number; triggerCount: number }
  >;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<PokeListWebhookSources>>,
  session: SessionWithUser
): Promise<void> {
  const { wId } = req.query;
  if (!isString(wId)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "workspace_not_found",
        message: "The workspace was not found.",
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
        message: "Could not find workspace.",
      },
    });
  }

  switch (req.method) {
    case "GET": {
      const sources = await WebhookSourceResource.listByWorkspace(auth);
      const results: PokeListWebhookSources["webhookSources"] = [];

      for (const source of sources) {
        const views = await WebhookSourcesViewResource.listByWebhookSource(
          auth,
          source.id
        );
        let triggerCount = 0;
        for (const view of views) {
          const triggers = await TriggerResource.listByWebhookSourceViewId(
            auth,
            view.id
          );
          triggerCount += triggers.length;
        }

        results.push({
          ...source.toJSON(),
          viewCount: views.length,
          triggerCount,
        });
      }

      return res.status(200).json({ webhookSources: results });
    }

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method is not supported.",
        },
      });
  }
}

export default withSessionAuthenticationForPoke(handler);
