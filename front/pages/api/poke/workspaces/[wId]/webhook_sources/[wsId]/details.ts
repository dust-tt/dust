import { withSessionAuthenticationForPoke } from "@app/lib/api/auth_wrappers";
import { Authenticator } from "@app/lib/auth";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { TriggerResource } from "@app/lib/resources/trigger_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { WebhookRequestResource } from "@app/lib/resources/webhook_request_resource";
import { WebhookSourceResource } from "@app/lib/resources/webhook_source_resource";
import { WebhookSourcesViewResource } from "@app/lib/resources/webhook_sources_view_resource";
import { apiError } from "@app/logger/withlogging";
import type { TriggerType } from "@app/types/assistant/triggers";
import type { WithAPIErrorResponse } from "@app/types/error";
import { isString, removeNulls } from "@app/types/shared/utils/general";
import type {
  WebhookSourceForAdminType,
  WebhookSourceViewForAdminType,
} from "@app/types/triggers/webhooks";
import type { UserType } from "@app/types/user";
import type { NextApiRequest, NextApiResponse } from "next";

export type PokeGetWebhookSourceDetails = {
  webhookSource: WebhookSourceForAdminType;
  views: WebhookSourceViewForAdminType[];
  triggers: Array<TriggerType & { editorUser: UserType | null }>;
  requestStats: { last24h: number; last7d: number; last30d: number };
};

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

      const views = await WebhookSourcesViewResource.listByWebhookSource(
        auth,
        source.id
      );

      // Collect all triggers from all views
      const allTriggers: TriggerType[] = [];
      for (const view of views) {
        const triggers = await TriggerResource.listByWebhookSourceViewId(
          auth,
          view.id
        );
        for (const t of triggers) {
          allTriggers.push(t.toJSON());
        }
      }

      // Batch-fetch editor users
      const editorIds = removeNulls(allTriggers.map((t) => t.editor));
      const editorUsers =
        editorIds.length > 0
          ? await UserResource.fetchByModelIds(editorIds)
          : [];
      const editorUserMap = new Map(editorUsers.map((u) => [u.id, u.toJSON()]));

      const triggersWithEditors = allTriggers.map((t) => ({
        ...t,
        editorUser: editorUserMap.get(t.editor) ?? null,
      }));

      // Get request stats
      const requestStats = await WebhookRequestResource.countBySourceInPeriods(
        auth,
        source.id
      );

      return res.status(200).json({
        webhookSource: source.toJSONForAdmin(),
        views: views.map((v) => v.toJSONForAdmin()),
        triggers: triggersWithEditors,
        requestStats,
      });
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
