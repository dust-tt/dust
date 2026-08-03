import {
  buildAuditLogTarget,
  emitAuditLogEvent,
  getAuditLogContext,
} from "@app/lib/api/audit/workos_audit";
import apiConfig from "@app/lib/api/config";
import logger from "@app/logger/logger";
import type { PostCredentialsResponseBody } from "@app/types/api/oauth";
import { PostCredentialsBodySchema } from "@app/types/api/oauth";
import { OAuthAPI } from "@app/types/oauth/oauth_api";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsAdmin } from "@front-api/middlewares/ensure_role";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";

import checkBigQueryLocations from "./check_bigquery_locations";
import slackIsLegacy from "./slack_is_legacy";

const app = workspaceApp();

app.use("*", ensureIsAdmin());

/** @ignoreswagger */
app.post(
  "/",
  validate("json", PostCredentialsBodySchema),
  async (ctx): HandlerResult<PostCredentialsResponseBody> => {
    const auth = ctx.get("auth");
    const user = auth.getNonNullableUser();
    const owner = auth.getNonNullableWorkspace();

    const body = ctx.req.valid("json");

    const response = await new OAuthAPI(
      apiConfig.getOAuthAPIConfig(),
      logger
    ).postCredentials({
      provider: body.provider,
      workspaceId: owner.sId,
      userId: user.sId,
      credentials: body.credentials,
    });

    if (response.isErr()) {
      return apiError(ctx, {
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
          name: String(body.provider),
        }),
      ],
      context: getAuditLogContext(auth),
      metadata: {
        provider: String(body.provider),
        credential_type: "oauth",
        credential_id: response.value.credential.credential_id,
      },
    });

    return ctx.json(
      {
        credentials: {
          id: response.value.credential.credential_id,
        },
      },
      201
    );
  }
);

app.route("/check_bigquery_locations", checkBigQueryLocations);
app.route("/slack_is_legacy", slackIsLegacy);

export default app;
