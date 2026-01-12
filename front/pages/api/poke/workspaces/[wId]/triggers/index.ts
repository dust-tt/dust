import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForPoke } from "@app/lib/api/auth_wrappers";
import { Authenticator } from "@app/lib/auth";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { TriggerResource } from "@app/lib/resources/trigger_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { WebhookSourcesViewResource } from "@app/lib/resources/webhook_sources_view_resource";
import { apiError } from "@app/logger/withlogging";
import type { UserType, WithAPIErrorResponse } from "@app/types";
import { removeNulls } from "@app/types";
import type { TriggerType } from "@app/types/assistant/triggers";
import type { WebhookProvider } from "@app/types/triggers/webhooks";

export type TriggerWithProviderType = TriggerType & {
  provider?: WebhookProvider | null;
  editorUser?: UserType | null;
};

export type PokeListTriggers = {
  triggers: TriggerWithProviderType[];
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<PokeListTriggers>>,
  session: SessionWithUser
): Promise<void> {
  const { wId } = req.query;
  if (typeof wId !== "string") {
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
        type: "trigger_not_found",
        message: "Could not find triggers.",
      },
    });
  }

  switch (req.method) {
    case "GET":
      const triggers = await TriggerResource.listByWorkspace(auth);
      const triggerJSONs = triggers.map((t) => t.toJSON());

      const webhookSourceViewIds = removeNulls(
        triggerJSONs.map((t) =>
          t.kind === "webhook" ? t.webhookSourceViewSId : null
        )
      );

      const webhookSourceViews =
        webhookSourceViewIds.length > 0
          ? await WebhookSourcesViewResource.fetchByIds(
              auth,
              webhookSourceViewIds
            )
          : [];

      const providerMap = new Map<string, WebhookProvider | null>();
      for (const view of webhookSourceViews) {
        const viewJSON = view.toJSON();
        providerMap.set(viewJSON.sId, viewJSON.provider);
      }

      // Fetch editor users
      const editorIds = removeNulls(triggerJSONs.map((t) => t.editor));
      const editorUsers =
        editorIds.length > 0
          ? await UserResource.fetchByModelIds(editorIds)
          : [];
      const editorUserMap = new Map(editorUsers.map((u) => [u.id, u.toJSON()]));

      const triggersWithProvider: TriggerWithProviderType[] = triggerJSONs.map(
        (t) => {
          const editorUser = editorUserMap.get(t.editor) ?? null;
          if (t.kind === "webhook" && t.webhookSourceViewSId) {
            return {
              ...t,
              provider: providerMap.get(t.webhookSourceViewSId) ?? null,
              editorUser,
            };
          }
          return {
            ...t,
            provider: t.kind === "schedule" ? undefined : null,
            editorUser,
          };
        }
      );

      return res.status(200).json({
        triggers: triggersWithProvider,
      });

    case "DELETE":
      const { tId } = req.query;
      if (typeof tId !== "string") {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "The trigger ID is required.",
          },
        });
      }

      const trigger = await TriggerResource.fetchById(auth, tId);
      if (!trigger) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "trigger_not_found",
            message: "The trigger was not found.",
          },
        });
      }

      const deleteResult = await trigger.delete(auth);
      if (deleteResult.isErr()) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "Failed to delete trigger.",
          },
        });
      }

      res.status(204).end();
      return;

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
