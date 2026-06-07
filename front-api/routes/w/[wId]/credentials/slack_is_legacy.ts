import apiConfig from "@app/lib/api/config";
import type { GetSlackClientIdResponseBody } from "@app/lib/api/credentials";
import logger from "@app/logger/logger";
import { OAuthAPI } from "@app/types/oauth/oauth_api";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsAdmin } from "@front-api/middlewares/ensure_role";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const SlackCredentialContentSchema = z.object({
  client_id: z.string(),
});

const SlackIsLegacyQuerySchema = z.object({
  credentialId: z.string().min(1),
});

const app = workspaceApp();

app.use("*", ensureIsAdmin());

/** @ignoreswagger */
app.get(
  "/",
  validate("query", SlackIsLegacyQuerySchema),
  async (ctx): HandlerResult<GetSlackClientIdResponseBody> => {
    const auth = ctx.get("auth");
    const owner = auth.getNonNullableWorkspace();

    const { credentialId } = ctx.req.valid("query");

    const oauthApi = new OAuthAPI(apiConfig.getOAuthAPIConfig(), logger);
    const credentialRes = await oauthApi.getCredentials({
      credentialsId: credentialId,
    });

    if (credentialRes.isErr()) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "connector_credentials_not_found",
          message: "The credential you requested was not found.",
        },
      });
    }

    const { credential } = credentialRes.value;

    if (credential.metadata.workspace_id !== owner.sId) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message:
            "The credential you requested does not belong to your workspace.",
        },
      });
    }

    if (credential.provider !== "slack") {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "The credential provided is not a Slack credential.",
        },
      });
    }

    const clientId = getClientId(credential.content);
    const oauthClientId = apiConfig.getOAuthSlackClientId();

    return ctx.json({ isLegacySlackApp: clientId === oauthClientId });
  }
);

function getClientId(content: unknown): string | null {
  const result = SlackCredentialContentSchema.safeParse(content);
  return result.success ? result.data.client_id : null;
}

export default app;
