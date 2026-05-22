import {
  buildAuditLogTarget,
  emitAuditLogEvent,
  getAuditLogContext,
} from "@app/lib/api/audit/workos_audit";
import apiConfig from "@app/lib/api/config";
import logger from "@app/logger/logger";
import {
  BigQueryCredentialsWithLocationSchema,
  NotionCredentialsSchema,
  SalesforceCredentialsSchema,
  SnowflakeCredentialsSchema,
} from "@app/types/oauth/lib";
import { OAuthAPI } from "@app/types/oauth/oauth_api";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureRole } from "@front-api/middlewares/ensure_role";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

import checkBigQueryLocations from "./check_bigquery_locations";
import slackIsLegacy from "./slack_is_legacy";

const PostSnowflakeCredentialsBodySchema = z.object({
  provider: z.literal("snowflake"),
  credentials: SnowflakeCredentialsSchema,
});

const PostBigQueryCredentialsBodySchema = z.object({
  provider: z.literal("bigquery"),
  credentials: BigQueryCredentialsWithLocationSchema,
});

const PostSalesforceCredentialsBodySchema = z.object({
  provider: z.literal("salesforce"),
  credentials: SalesforceCredentialsSchema,
});

const PostNotionCredentialsBodySchema = z.object({
  provider: z.literal("notion"),
  credentials: NotionCredentialsSchema,
});

const PostCredentialsBodySchema = z.union([
  PostSnowflakeCredentialsBodySchema,
  PostBigQueryCredentialsBodySchema,
  PostSalesforceCredentialsBodySchema,
  PostNotionCredentialsBodySchema,
]);

export type PostCredentialsBody = z.infer<typeof PostCredentialsBodySchema>;
export type PostCredentialsResponseBody = {
  credentials: {
    id: string;
  };
};

const app = workspaceApp();

app.use("*", ensureRole({ admin: true }));

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
      targets: [buildAuditLogTarget("workspace", owner)],
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
