import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import config from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";
import { OAuthAPI } from "@app/types/oauth/oauth_api";

const createWebhookSchema = z.object({
  connectionId: z.string().optional(),
  token: z.string().optional(),
  owner: z.string(),
  repo: z.string(),
  events: z.array(z.string()),
  webhookUrl: z.string().url(),
  secret: z.string().optional(),
}).refine((data) => data.connectionId || data.token, {
  message: "Either connectionId or token must be provided",
});

export type CreateGithubWebhookResponseBody = {
  success: true;
  webhookId: number;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<CreateGithubWebhookResponseBody>>,
  auth: Authenticator
): Promise<void> {
  if (req.method !== "POST") {
    return apiError(req, res, {
      status_code: 405,
      api_error: {
        type: "method_not_supported_error",
        message: "Only POST is supported.",
      },
    });
  }

  const bodyValidation = createWebhookSchema.safeParse(req.body);

  if (!bodyValidation.success) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: `Invalid request body: ${bodyValidation.error.message}`,
      },
    });
  }

  const { connectionId, token, owner, repo, events, webhookUrl, secret } =
    bodyValidation.data;

  let accessToken: string;

  if (token) {
    // Direct token provided
    accessToken = token;
  } else if (connectionId) {
    // OAuth connection ID provided
    try {
      const oauthAPI = new OAuthAPI(config.getOAuthAPIConfig(), logger);
      const tokenRes = await oauthAPI.getAccessToken({ connectionId });

      if (tokenRes.isErr()) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "Failed to get access token for GitHub connection.",
          },
        });
      }

      accessToken = tokenRes.value.access_token;
    } catch (error) {
      return apiError(req, res, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "Failed to get access token for GitHub connection.",
        },
      });
    }
  } else {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Missing token or connectionId.",
      },
    });
  }

  try {

    // Create webhook on GitHub
    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/hooks`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/vnd.github.v3+json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "web",
          active: true,
          events,
          config: {
            url: webhookUrl,
            content_type: "json",
            ...(secret ? { secret } : {}),
          },
        }),
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      logger.error(
        {
          error: errorData,
          owner,
          repo,
          status: response.status,
        },
        "Failed to create webhook on GitHub"
      );

      return apiError(req, res, {
        status_code: response.status,
        api_error: {
          type: "external_api_error",
          message: `GitHub API error: ${errorData.message || response.statusText}`,
        },
      });
    }

    const data = await response.json();

    return res.status(201).json({
      success: true,
      webhookId: data.id,
    });
  } catch (error) {
    logger.error(
      {
        error,
        workspaceId: auth.getNonNullableWorkspace().sId,
        owner,
        repo,
      },
      "Failed to create GitHub webhook"
    );

    return apiError(req, res, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: "Failed to create webhook on GitHub.",
      },
    });
  }
}

export default withSessionAuthenticationForWorkspace(handler);
