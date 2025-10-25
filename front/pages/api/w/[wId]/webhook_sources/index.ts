import type { NextApiRequest, NextApiResponse } from "next";
import type { z } from "zod";
import { fromError } from "zod-validation-error";

import { getWebhookSourcesUsage } from "@app/lib/api/agent_triggers";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import config from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { generateSecureSecret } from "@app/lib/resources/string_ids";
import { WebhookSourceResource } from "@app/lib/resources/webhook_source_resource";
import { WebhookSourcesViewResource } from "@app/lib/resources/webhook_sources_view_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { buildWebhookUrl } from "@app/lib/webhookSource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";
import type {
  WebhookSourceForAdminType,
  WebhookSourceWithViewsAndUsageType,
} from "@app/types/triggers/webhooks";
import {
  WEBHOOK_PRESETS,
  WebhookSourcesSchema,
} from "@app/types/triggers/webhooks";

export const PostWebhookSourcesSchema = WebhookSourcesSchema;

export type PostWebhookSourcesBody = z.infer<typeof PostWebhookSourcesSchema>;

export type GetWebhookSourcesResponseBody = {
  success: true;
  webhookSourcesWithViews: WebhookSourceWithViewsAndUsageType[];
};

export type PostWebhookSourcesResponseBody = {
  success: true;
  webhookSource: WebhookSourceForAdminType;
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
  const isAdmin = await SpaceResource.canAdministrateSystemSpace(auth);
  if (!isAdmin) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message: "Only admin can manage webhook sources.",
      },
    });
  }

  switch (method) {
    case "GET": {
      const webhookSourceResources =
        await WebhookSourceResource.listByWorkspace(auth);

      try {
        const usageBySourceId = await getWebhookSourcesUsage({ auth });
        const webhookSourcesWithViews = await concurrentExecutor(
          webhookSourceResources,
          async (webhookSourceResource) => {
            const webhookSource = webhookSourceResource.toJSONForAdmin();
            const webhookSourceViewResources =
              await WebhookSourcesViewResource.listByWebhookSource(
                auth,
                webhookSource.id
              );
            const views = webhookSourceViewResources.map((view) =>
              view.toJSONForAdmin()
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
        includeGlobal,
        subscribedEvents,
        provider,
        connectionId,
        remoteMetadata,
      } = bodyValidation.data;

      if (provider && subscribedEvents.length === 0) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "Subscribed events must not be empty.",
          },
        });
      }

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
          provider,
          signatureHeader:
            trimmedSignatureHeader.length > 0 ? trimmedSignatureHeader : null,
          signatureAlgorithm,
          subscribedEvents,
        });

        if (webhookSourceRes.isErr()) {
          throw new Error(webhookSourceRes.error.message);
        }

        const webhookSource = webhookSourceRes.value;

        if (includeGlobal) {
          const systemView =
            await WebhookSourcesViewResource.getWebhookSourceViewForSystemSpace(
              auth,
              webhookSource.sId()
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

        if (provider && connectionId && remoteMetadata) {
          // Allow redirection to public URL in local dev for webhook registrations.
          const baseUrl =
            process.env.DUST_WEBHOOKS_PUBLIC_URL ?? config.getClientFacingUrl();
          const webhookUrl = buildWebhookUrl({
            apiBaseUrl: baseUrl,
            workspaceId: workspace.sId,
            webhookSource: webhookSource.toJSONForAdmin(),
          });
          const service = WEBHOOK_PRESETS[provider].webhookService;
          const result = await service.createWebhooks({
            auth,
            connectionId,
            remoteMetadata,
            webhookUrl,
            events: subscribedEvents,
            secret: webhookSource.getSecretPotentiallyRedacted() ?? undefined,
          });

          if (result.isErr()) {
            // If remote webhook creation fails, we still keep the webhook source
            // but return an error message so the user knows
            return apiError(req, res, {
              status_code: 500,
              api_error: {
                type: "internal_server_error",
                message: `Webhook source created but failed to create remote webhook: ${result.error.message}`,
              },
            });
          }

          // Update the webhook source with the id of the webhook
          const updatedRemoteMetadata = result.value.updatedRemoteMetadata;
          await webhookSource.updateRemoteMetadata({
            remoteMetadata: updatedRemoteMetadata,
            oauthConnectionId: connectionId,
          });
        }

        return res.status(201).json({
          success: true,
          webhookSource: webhookSource.toJSONForAdmin(),
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
