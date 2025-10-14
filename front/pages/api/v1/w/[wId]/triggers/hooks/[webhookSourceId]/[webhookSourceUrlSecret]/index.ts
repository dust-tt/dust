import type { PostWebhookTriggerResponseType } from "@dust-tt/client";
import type { NextApiResponse } from "next";

import { toFileContentFragment } from "@app/lib/api/assistant/conversation/content_fragment";
import { Authenticator } from "@app/lib/auth";
import { matchPayload, parseMatcherExpression } from "@app/lib/matcher";
import { TriggerResource } from "@app/lib/resources/trigger_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { WebhookSourceResource } from "@app/lib/resources/webhook_source_resource";
import { WebhookSourcesViewResource } from "@app/lib/resources/webhook_sources_view_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { checkWebhookRequestForRateLimit } from "@app/lib/triggers/webhook";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { verifySignature } from "@app/lib/webhookSource";
import logger from "@app/logger/logger";
import type { NextApiRequestWithContext } from "@app/logger/withlogging";
import { apiError, withLogging } from "@app/logger/withlogging";
import { launchAgentTriggerWorkflow } from "@app/temporal/agent_schedule/client";
import type {
  ContentFragmentInputWithFileIdType,
  WithAPIErrorResponse,
} from "@app/types";
import { Err, normalizeError } from "@app/types";
import { WEBHOOK_SOURCE_KIND_TO_PRESETS_MAP } from "@app/types/triggers/webhooks";

/**
 * @swagger
 * /api/v1/w/{wId}/triggers/hooks/{webhookSourceId}:
 *   post:
 *     summary: Receive external webhook to trigger flows
 *     description: Skeleton endpoint that verifies workspace and webhook source and logs receipt.
 *     tags:
 *       - Triggers
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: wId
 *         required: true
 *         description: Workspace ID
 *         schema:
 *           type: string
 *       - in: path
 *         name: webhookSourceId
 *         required: true
 *         description: Webhook source ID
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Webhook received
 *       400:
 *         description: Invalid request
 *       404:
 *         description: Workspace or webhook source not found
 *       405:
 *         description: Method not allowed
 */

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "2mb",
    },
  },
};

async function handler(
  req: NextApiRequestWithContext,
  res: NextApiResponse<WithAPIErrorResponse<PostWebhookTriggerResponseType>>
): Promise<void> {
  const { method, body } = req;

  if (method !== "POST") {
    return apiError(req, res, {
      status_code: 405,
      api_error: {
        type: "method_not_supported_error",
        message: "The method passed is not supported, POST is expected.",
      },
    });
  }

  const contentType = req.headers["content-type"];
  if (!contentType || !contentType.includes("application/json")) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Content-Type must be application/json.",
      },
    });
  }

  const { wId, webhookSourceId, webhookSourceUrlSecret } = req.query;

  if (
    typeof wId !== "string" ||
    typeof webhookSourceId !== "string" ||
    typeof webhookSourceUrlSecret !== "string"
  ) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message:
          "Invalid route parameters: expected string wId, webhookSourceId and webhookSourceUrlSecret.",
      },
    });
  }

  const workspace = await WorkspaceResource.fetchById(wId);
  if (!workspace) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "workspace_not_found",
        message: `Workspace ${wId} not found.`,
      },
    });
  }

  const auth = await Authenticator.internalBuilderForWorkspace(wId);

  const webhookSource = await WebhookSourceResource.fetchById(
    auth,
    webhookSourceId
  );

  if (!webhookSource) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "webhook_source_not_found",
        message: `Webhook source ${webhookSourceId} not found in workspace ${wId}.`,
      },
    });
  }

  // Validate webhook url secret
  if (webhookSourceUrlSecret !== webhookSource.urlSecret) {
    return apiError(req, res, {
      status_code: 401,
      api_error: {
        type: "webhook_source_auth_error",
        message: "Invalid webhook path.",
      },
    });
  }

  // Validate webhook signature if secret is configured
  if (webhookSource.secret) {
    const signatureHeader = webhookSource.signatureHeader;
    const algorithm = webhookSource.signatureAlgorithm;

    if (!signatureHeader || !algorithm) {
      return apiError(req, res, {
        status_code: 400,
        api_error: {
          type: "webhook_source_misconfiguration",
          message: `Webhook source ${webhookSourceId} is missing header or algorithm configuration.`,
        },
      });
    }
    const signature = req.headers[signatureHeader.toLowerCase()] as string;

    if (!signature) {
      return apiError(req, res, {
        status_code: 401,
        api_error: {
          type: "not_authenticated",
          message: `Missing signature header: ${signatureHeader}`,
        },
      });
    }

    const stringifiedBody = JSON.stringify(body);

    const isValid = verifySignature({
      signedContent: stringifiedBody,
      secret: webhookSource.secret,
      signature,
      algorithm,
    });

    if (!isValid) {
      logger.warn(
        {
          webhookSourceId: webhookSource.id,
          workspaceId: workspace.id,
        },
        "Invalid webhook signature"
      );
      return apiError(req, res, {
        status_code: 401,
        api_error: {
          type: "not_authenticated",
          message: "Invalid webhook signature.",
        },
      });
    }
  }

  const rateLimiterRes = await checkWebhookRequestForRateLimit(auth);
  if (rateLimiterRes.isErr()) {
    return apiError(req, res, {
      status_code: 429,
      api_error: {
        type: "rate_limit_error",
        message: rateLimiterRes.error.message,
      },
    });
  }

  // Filter out non-subscribed events
  if (webhookSource.kind !== "custom") {
    const { type, field } =
      WEBHOOK_SOURCE_KIND_TO_PRESETS_MAP[webhookSource.kind].eventCheck;

    // Node http module behavior is to lowercase all headers keys
    const receivedEventName = req[type][field.toLowerCase()];

    if (
      receivedEventName === undefined ||
      // Event not in preset
      !WEBHOOK_SOURCE_KIND_TO_PRESETS_MAP[webhookSource.kind].events
        .map((event) => event.name)
        .includes(receivedEventName) ||
      // Event not subscribed
      !webhookSource.subscribedEvents.includes(receivedEventName)
    ) {
      return res.status(200).json({ success: true });
    }
  }

  // Fetch all triggers based on the webhook source id
  const views = await WebhookSourcesViewResource.listByWebhookSource(
    auth,
    webhookSource.id
  );

  // Fetch all triggers based on the webhook source id
  // flatten the triggers
  const triggers = (
    await concurrentExecutor(
      views,
      async (view) => {
        const triggers = await TriggerResource.listByWebhookSourceViewId(
          auth,
          view.id
        );
        return triggers;
      },
      { concurrency: 10 }
    )
  ).flat();

  // Filter triggers by payload matching (non-custom webhooks only). Custom webhooks don't have known
  // schemas, so we can't validate filters against them.
  const filteredTriggers = triggers.filter((trigger) => {
    const t = trigger.toJSON();

    // Only filter non-custom webhooks.
    if (webhookSource.kind === "custom") {
      return true;
    }

    // If no filter configured, include trigger.
    if (t.kind !== "webhook" || !t.configuration.filter) {
      return true;
    }

    try {
      const parsedFilter = parseMatcherExpression(t.configuration.filter);
      const r = matchPayload(req.body, parsedFilter);
      if (!r) {
        logger.info(
          {
            triggerId: t.id,
            triggerName: t.name,
            filter: t.configuration.filter,
          },
          "Webhook trigger filter did not match payload"
        );
      }
      return r;
    } catch (err) {
      // FAIL CLOSED: Invalid filters block the trigger from executing.
      logger.error(
        {
          triggerId: t.id,
          triggerName: t.name,
          filter: t.configuration.filter,
          err: normalizeError(err),
        },
        "Invalid filter expression in webhook trigger"
      );
      return false;
    }
  });

  // If no triggers match after filtering, return success without launching workflows.
  if (filteredTriggers.length === 0) {
    return res.status(200).json({ success: true });
  }

  // Check if any of the triggers requires the payload.
  const triggersWithMetadata = filteredTriggers.map((t) => {
    const trigger = t.toJSON();
    const includePayload =
      trigger.kind === "webhook" && trigger.configuration.includePayload;
    return { t, includePayload };
  });

  const requiresPayload = triggersWithMetadata.some(
    (metadata) => metadata.includePayload
  );

  // If we need the payload, create a content fragment for it.
  let contentFragment: ContentFragmentInputWithFileIdType | undefined;
  if (requiresPayload) {
    const contentFragmentRes = await toFileContentFragment(auth, {
      contentFragment: {
        contentType: "application/json",
        content: JSON.stringify(req.body),
        title: `Webhook body (source id: ${webhookSource.id}, date: ${new Date().toISOString()})`,
      },
      fileName: `webhook_body_${webhookSource.id}_${Date.now()}.json`,
    });

    if (contentFragmentRes.isErr()) {
      logger.error(
        { contentFragment: contentFragmentRes },
        "Error creating file content fragment."
      );
      return apiError(req, res, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: "Error creating file content fragment.",
        },
      });
    }

    contentFragment = contentFragmentRes.value;
  }

  // Launch all the workflows concurrently.
  const results = await concurrentExecutor(
    triggersWithMetadata,
    async ({ t, includePayload }) => {
      // Get the trigger's user and create a new authenticator
      const user = await UserResource.fetchByModelId(t.editor);

      if (!user) {
        logger.error({ triggerId: t.id }, "Trigger editor not found.");
        return new Err(new Error("Trigger editor not found."));
      }

      const auth = await Authenticator.fromUserIdAndWorkspaceId(user.sId, wId);
      if (includePayload && !contentFragment) {
        logger.error({ triggerId: t.id }, "Webhook payload fragment missing.");
        return new Err(new Error("Webhook payload fragment missing"));
      }
      return launchAgentTriggerWorkflow({
        auth,
        trigger: t,
        contentFragment: includePayload ? contentFragment : undefined,
      });
    },
    { concurrency: 10 }
  );

  const errors = results.filter((result) => result.isErr());

  if (errors.length > 0) {
    logger.error({ errors }, "Error launching agent trigger workflows.");
    return apiError(
      req,
      res,
      // Safe casts below on errors, thanks to the .filter above.
      {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: `Error launching agent trigger workflows: ${errors.map((e) => (e as Err<Error>).error.message).join(", ")}`,
        },
      },
      (errors[0] as Err<Error>).error
    );
  }
  return res.status(200).json({ success: true });
}

export default withLogging(handler);
