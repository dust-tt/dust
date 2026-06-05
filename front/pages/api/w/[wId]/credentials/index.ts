/** @ignoreswagger */
// @migration-status: MIGRATED_TO_HONO
import {
  buildAuditLogTarget,
  emitAuditLogEvent,
  getAuditLogContext,
} from "@app/lib/api/audit/workos_audit";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import apiConfig from "@app/lib/api/config";
import type { PostCredentialsResponseBody } from "@app/lib/api/oauth";
import { PostCredentialsBodySchema } from "@app/lib/api/oauth";

export type { PostCredentialsBody } from "@app/lib/api/oauth";

import type { Authenticator } from "@app/lib/auth";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import { OAuthAPI } from "@app/types/oauth/oauth_api";
import type { NextApiRequest, NextApiResponse } from "next";
import { fromError } from "zod-validation-error";

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<PostCredentialsResponseBody>>,
  auth: Authenticator
): Promise<void> {
  const user = auth.getNonNullableUser();
  const owner = auth.getNonNullableWorkspace();

  if (!auth.isAdmin()) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "app_auth_error",
        message:
          "Only the users that are `admins` for the current workspace can interact with credentials.",
      },
    });
  }

  switch (req.method) {
    case "POST":
      const bodyValidation = PostCredentialsBodySchema.safeParse(req.body);
      if (!bodyValidation.success) {
        const pathError = fromError(bodyValidation.error).toString();
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `The request body is invalid: ${pathError}.`,
          },
        });
      }

      const response = await new OAuthAPI(
        apiConfig.getOAuthAPIConfig(),
        logger
      ).postCredentials({
        provider: bodyValidation.data.provider,
        workspaceId: owner.sId,
        userId: user.sId,
        credentials: bodyValidation.data.credentials,
      });

      if (response.isErr()) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "connector_credentials_error",
            message: `Failed to create credentials: ${response.error.message}.`,
          },
        });
      }

      void emitAuditLogEvent({
        auth,
        action: "credentials.created",
        targets: [
          buildAuditLogTarget("workspace", owner),
          buildAuditLogTarget("credential", {
            sId: response.value.credential.credential_id,
            name: String(bodyValidation.data.provider),
          }),
        ],
        context: getAuditLogContext(auth, req),
        metadata: {
          provider: String(bodyValidation.data.provider),
          credential_type: "oauth",
          credential_id: response.value.credential.credential_id,
        },
      });

      return res.status(201).json({
        credentials: {
          id: response.value.credential.credential_id,
        },
      });

    default:
      res.status(405).end();
      return;
  }
}

export default withSessionAuthenticationForWorkspace(handler);
