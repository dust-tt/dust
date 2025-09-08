import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { Authenticator } from "@app/lib/auth";
import { WebhookSourceResource } from "@app/lib/resources/webhook_source_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";
import { WebhookSourceType } from "@app/types/triggers/webhooks";
import { NextApiRequest, NextApiResponse } from "next";

export interface GetWebhookSourcesResponseBody {
  webhookSources: WebhookSourceType[];
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetWebhookSourcesResponseBody>>,
  auth: Authenticator
): Promise<void> {
  const { wId } = req.query;

  if (typeof wId !== "string") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid workspace ID.",
      },
    });
  }

  const workspace = await WorkspaceResource.fetchById(wId);

  if (!workspace) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "workspace_not_found",
        message: "The workspace was not found.",
      },
    });
  }

  const webhookSources = await WebhookSourceResource.listByWorkspace(auth);

  return res.status(200).json({
    webhookSources: webhookSources.map((webhookSource) =>
      webhookSource.toJSON()
    ),
  });
}

export default withSessionAuthenticationForWorkspace(handler);
