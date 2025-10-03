import type { NextApiRequest, NextApiResponse } from "next";
import { fromError } from "zod-validation-error";

import { getWebhookSourcesUsage } from "@app/lib/api/agent_triggers";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { generateSecureSecret } from "@app/lib/resources/string_ids";
import { WebhookSourceResource } from "@app/lib/resources/webhook_source_resource";
import { WebhookSourcesViewResource } from "@app/lib/resources/webhook_sources_view_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";
import type {
  WebhookSourceType,
  WebhookSourceWithViewsAndUsage,
} from "@app/types/triggers/webhooks";
import { PostWebhookSourcesSchema } from "@app/types/triggers/webhooks";

export type GetWebhookSourcesResponseBody = {
  success: true;
  webhookSourcesWithViews: WebhookSourceWithViewsAndUsage[];
};

export type PostWebhookSourcesResponseBody = {
  success: true;
  webhookSource: WebhookSourceType;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<
      GetWebhookSourcesResponseBody | PostWebhookSourcesResponseBody
    >
  >,
  auth: Authenticator
): Promise<void> {
  const { method } = req;

  switch (method) {
    case "GET": {
      const webhookSourceResources =
        await WebhookSourceResource.listByWorkspace(auth);

      try {
        const usageBySourceId = await getWebhookSourcesUsage({ auth });
        const webhookSourcesWithViews = await concurrentExecutor(
          webhookSourceResources,
          async (webhookSourceResource) => {
            const webhookSource = webhookSourceResource.toJSON();
            const webhookSourceViewResources =
              await WebhookSourcesViewResource.listByWebhookSource(
                auth,
                webhookSource.id
              );
            const views = webhookSourceViewResources.map((view) =>
              view.toJSON()
            );

            return { ...webhookSource, views };
          },
          {
            concurrency: 10,
          }
        );

        return res.status(200).json({
          success: true,
          webhookSourcesWithViews: webhookSourcesWithViews.map((source) => ({
            ...source,
            usage: usageBySourceId[source.id] ?? { count: 0, agents: [] },
          })),
        });
      } catch (error) {
        return res.status(500).json({
          error: {
            type: "internal_server_error",
            message: "Failed to load webhook source views.",
          },
        });
      }
    }

    case "POST": {
      const bodyValidation = PostWebhookSourcesSchema.safeParse(req.body);

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

      const {
        name,
        secret,
        signatureHeader,
        signatureAlgorithm,
        customHeaders,
        includeGlobal,
      } = bodyValidation.data;

      const workspace = auth.getNonNullableWorkspace();

      const trimmedSignatureHeader = signatureHeader.trim();

      try {
        const webhookSourceRes = await WebhookSourceResource.makeNew(auth, {
          workspaceId: workspace.id,
          name,
          secret:
            trimmedSignatureHeader.length === 0
              ? null
              : secret && secret.length > 0
                ? secret
                : generateSecureSecret(64),
          urlSecret: generateSecureSecret(64),
          signatureHeader:
            trimmedSignatureHeader.length > 0 ? trimmedSignatureHeader : null,
          signatureAlgorithm,
          customHeaders,
        });

        if (webhookSourceRes.isErr()) {
          throw new Error(webhookSourceRes.error.message);
        }

        const webhookSource = webhookSourceRes.value.toJSON();

        if (includeGlobal) {
          const systemView =
            await WebhookSourcesViewResource.getWebhookSourceViewForSystemSpace(
              auth,
              webhookSource.sId
            );

          if (systemView === null) {
            return apiError(req, res, {
              status_code: 400,
              api_error: {
                type: "invalid_request_error",
                message:
                  "Missing system view for webhook source, it should have been created when creating the webhook source.",
              },
            });
          }

          const globalSpace =
            await SpaceResource.fetchWorkspaceGlobalSpace(auth);

          await WebhookSourcesViewResource.create(auth, {
            systemView,
            space: globalSpace,
          });
        }

        return res.status(201).json({
          success: true,
          webhookSource,
        });
      } catch (error) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "Failed to create webhook source.",
          },
        });
      }
    }

    default: {
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message:
            "The method passed is not supported, GET or POST is expected.",
        },
      });
    }
  }
}

export default withSessionAuthenticationForWorkspace(handler);
