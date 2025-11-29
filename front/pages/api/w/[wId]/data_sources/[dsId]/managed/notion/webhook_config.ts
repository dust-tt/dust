import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import config from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";
import { ConnectorsAPI } from "@app/types";

export type GetNotionWebhookConfigResponseBody = {
  webhookUrl: string;
  verificationToken: string | null;
  message: string | null;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<GetNotionWebhookConfigResponseBody>
  >,
  auth: Authenticator
): Promise<void> {
  if (req.method !== "GET") {
    return apiError(req, res, {
      status_code: 405,
      api_error: {
        type: "method_not_supported_error",
        message: "The method passed is not supported, GET is expected.",
      },
    });
  }

  const { dsId } = req.query;
  if (typeof dsId !== "string") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid path parameters.",
      },
    });
  }

  const dataSource = await DataSourceResource.fetchById(auth, dsId);
  if (!dataSource) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "data_source_not_found",
        message: "The data source you requested was not found.",
      },
    });
  }

  if (!dataSource.connectorId || dataSource.connectorProvider !== "notion") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "data_source_error",
        message:
          "The data source you requested is not a managed Notion data source.",
      },
    });
  }

  const connectorsAPIConfig = config.getConnectorsAPIConfig();
  const connectorsAPI = new ConnectorsAPI(connectorsAPIConfig, logger);

  // Get the Notion workspace ID
  const workspaceIdRes = await connectorsAPI.getNotionWorkspaceId(
    dataSource.connectorId
  );

  if (workspaceIdRes.isErr()) {
    logger.error(
      {
        connectorId: dataSource.connectorId,
        error: workspaceIdRes.error,
      },
      "Failed to get Notion workspace ID"
    );
    return apiError(req, res, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: "Failed to get Notion workspace ID",
        connectors_error: workspaceIdRes.error,
      },
    });
  }

  const notionWorkspaceId = workspaceIdRes.value.notionWorkspaceId;
  const webhookUrl = `https://webhook-router.dust.tt/notion/${notionWorkspaceId}`;

  // Try to get the verification token from the webhooks router
  try {
    const webhookRouterRes = await fetch(
      `${connectorsAPIConfig.url}/webhooks_router_entries/${connectorsAPIConfig.webhookSecret}/notion/${notionWorkspaceId}`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${connectorsAPIConfig.secret}`,
        },
      }
    );

    if (webhookRouterRes.status === 404) {
      // Expected when the webhook hasn't been set up yet
      return res.status(200).json({
        webhookUrl,
        verificationToken: null,
        message:
          "Set the webhook URL in your Notion integration and come back here to get the token.",
      });
    }

    if (!webhookRouterRes.ok) {
      logger.error(
        {
          status: webhookRouterRes.status,
          statusText: webhookRouterRes.statusText,
          notionWorkspaceId,
        },
        "Failed to get webhook router entry"
      );
      return apiError(req, res, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: "Failed to get webhook router entry",
        },
      });
    }

    const webhookRouterData = await webhookRouterRes.json();

    return res.status(200).json({
      webhookUrl,
      verificationToken: webhookRouterData.signing_secret,
      message: null,
    });
  } catch (error) {
    logger.error(
      {
        error,
        notionWorkspaceId,
      },
      "Failed to fetch webhook router entry"
    );
    return apiError(req, res, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: "Failed to fetch webhook router entry",
      },
    });
  }
}

export default withSessionAuthenticationForWorkspace(handler);
