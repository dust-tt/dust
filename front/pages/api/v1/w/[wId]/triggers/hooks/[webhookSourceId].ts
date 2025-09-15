import type { NextApiResponse } from "next";

import type { NextApiRequestWithContext } from "@app/logger/withlogging";
import { apiError, withLogging } from "@app/logger/withlogging";
import logger from "@app/logger/logger";
import { Authenticator } from "@app/lib/auth";
import { WebhookSourceResource } from "@app/lib/resources/webhook_source_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import type { WithAPIErrorResponse } from "@app/types";

type PostResponseBody = {
  success: true;
};

// Limit payload size as per design doc (2MB).
export const config = {
  api: {
    bodyParser: {
      sizeLimit: "2mb",
    },
  },
};

async function handler(
  req: NextApiRequestWithContext,
  res: NextApiResponse<WithAPIErrorResponse<PostResponseBody>>
): Promise<void> {
  const { method } = req;

  if (method !== "POST") {
    return apiError(req, res, {
      status_code: 405,
      api_error: {
        type: "method_not_supported_error",
        message: "The method passed is not supported, POST is expected.",
      },
    });
  }

  const { wId, webhookSourceId } = req.query;

  if (typeof wId !== "string" || typeof webhookSourceId !== "string") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid route parameters: expected string wId and webhookSourceId.",
      },
    });
  }

  // Fetch workspace by ID from route.
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
  req.addResourceToLog?.(workspace);

  // Create an internal authenticator for the workspace to fetch resources.
  const auth = await Authenticator.internalBuilderForWorkspace(wId);

  // Fetch webhook source by ID from route.
  const webhookSource = await WebhookSourceResource.fetchById(
    auth,
    webhookSourceId
  );
  if (!webhookSource) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "resource_not_found",
        message: `Webhook source ${webhookSourceId} not found in workspace ${wId}.`,
      },
    });
  }
  req.addResourceToLog?.(webhookSource);

  // Skeleton: only log receipt with minimal context, do not process payload.
  logger.info(
    {
      workspaceId: wId,
      webhookSourceId,
    },
    "[Webhook Trigger] Received webhook (skeleton handler)."
  );

  return res.status(200).json({ success: true });
}

export default withLogging(handler);
