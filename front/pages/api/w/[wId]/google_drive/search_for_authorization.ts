// @migration-status: MIGRATED_TO_HONO
/** @ignoreswagger */
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import config from "@app/lib/api/config";
import { checkConnectionOwnership } from "@app/lib/api/oauth";
import type { Authenticator } from "@app/lib/auth";
import type { GoogleDriveAuthorizationSearchFile } from "@app/lib/providers/google_drive/search";
import { searchDocumentsByName } from "@app/lib/providers/google_drive/search";
import { rateLimiter } from "@app/lib/utils/rate_limiter";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import { OAuthAPI } from "@app/types/oauth/oauth_api";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";

const RequestBodySchema = z.object({
  connectionId: z.string().min(1, "connectionId is required"),
  fileName: z.string().min(1, "fileName is required"),
});

export interface SearchForAuthorizationResponseType {
  files: GoogleDriveAuthorizationSearchFile[];
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<SearchForAuthorizationResponseType>
  >,
  auth: Authenticator
): Promise<void> {
  const owner = auth.getNonNullableWorkspace();

  switch (req.method) {
    case "POST": {
      const parseResult = RequestBodySchema.safeParse(req.body);
      if (!parseResult.success) {
        const firstError = parseResult.error.errors[0];
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: firstError?.message || "Invalid request body",
          },
        });
      }

      const { connectionId, fileName } = parseResult.data;

      const ownershipCheck = await checkConnectionOwnership(auth, connectionId);
      if (ownershipCheck.isErr()) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "workspace_auth_error",
            message: "Connection does not belong to this user/workspace",
          },
        });
      }

      const oauthAPI = new OAuthAPI(config.getOAuthAPIConfig(), logger);

      const metadataRes = await oauthAPI.getConnectionMetadata({
        connectionId,
      });

      if (metadataRes.isErr()) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "invalid_request_error",
            message: "Connection not found",
          },
        });
      }

      if (metadataRes.value.connection.provider !== "google_drive") {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "workspace_auth_error",
            message: "Connection is not a Google Drive connection",
          },
        });
      }

      const remaining = await rateLimiter({
        key: `workspace:${owner.id}:google_drive_search`,
        maxPerTimeframe: 60,
        timeframeSeconds: 60,
        logger,
      });
      if (remaining <= 0) {
        return apiError(req, res, {
          status_code: 429,
          api_error: {
            type: "rate_limit_error",
            message: "Rate limit exceeded. Please try again later.",
          },
        });
      }

      const tokenRes = await oauthAPI.getAccessToken({ connectionId });
      if (tokenRes.isErr()) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "Failed to get access token",
          },
        });
      }

      const accessToken = tokenRes.value.access_token;

      try {
        const files = await searchDocumentsByName({ accessToken, fileName });
        return res.status(200).json({ files });
      } catch (err) {
        const error = normalizeError(err);
        logger.error(
          { error, connectionId, fileName },
          "Failed to search Google Drive files"
        );
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "Failed to search Google Drive files",
          },
        });
      }
    }

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, POST is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(handler);
