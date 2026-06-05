import type { GetProviderCredentialsResponseBody } from "@app/lib/resources/provider_credential_resource";
import { ProviderCredentialResource } from "@app/lib/resources/provider_credential_resource";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsAdmin } from "@front-api/middlewares/ensure_role";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";

export type { GetProviderCredentialsResponseBody };

// Mounted at /api/w/:wId/provider_credentials.
const app = workspaceApp();

app.get(
  "/",
  ensureIsAdmin(),
  async (ctx): HandlerResult<GetProviderCredentialsResponseBody> => {
    const auth = ctx.get("auth");

    const plan = auth.getNonNullablePlan();
    if (!plan.isByok) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "app_auth_error",
          message: "BYOK is not enabled on this workspace's plan.",
        },
      });
    }

    const providerCredentials =
      await ProviderCredentialResource.listByWorkspace(auth);

    return ctx.json({
      providerCredentials: providerCredentials.map((c) => c.toJSON()),
    });
  }
);

export default app;
