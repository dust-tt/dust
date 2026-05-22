import { ProviderCredentialResource } from "@app/lib/resources/provider_credential_resource";
import type { ProviderCredentialType } from "@app/types/provider_credential";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";

export type GetProviderCredentialsResponseBody = {
  providerCredentials: ProviderCredentialType[];
};

// Mounted at /api/w/:wId/provider_credentials.
const app = workspaceApp();

app.get(
  "/",
  async (ctx): HandlerResult<GetProviderCredentialsResponseBody> => {
    const auth = ctx.get("auth");

    if (!auth.isAdmin()) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "app_auth_error",
          message:
            "Only the users that are `admins` for the current workspace can manage provider credentials.",
        },
      });
    }

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
