import { getDustAppSecret } from "@app/lib/api/dust_app_secrets";
import { isString } from "@app/types/shared/utils/general";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { apiError } from "@front-api/middlewares/utils";

// Mounted at /api/w/:wId/dust_app_secrets/:name/destroy.
const app = workspaceApp();

app.delete("/", async (ctx) => {
  const auth = ctx.get("auth");

  if (!auth.isBuilder()) {
    return apiError(ctx, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message:
          "Only users that are `builders` for the current workspace can manage secrets.",
      },
    });
  }

  const name = ctx.req.param("name");
  if (!isString(name)) {
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid path parameters.",
      },
    });
  }

  const secret = await getDustAppSecret(auth, name);

  if (secret == null) {
    return apiError(ctx, {
      status_code: 404,
      api_error: {
        type: "dust_app_secret_not_found",
        message: "Workspace not found.",
      },
    });
  }

  if (!auth.isAdmin()) {
    return apiError(ctx, {
      status_code: 403,
      api_error: {
        type: "app_auth_error",
        message: "You do not have the required permissions.",
      },
    });
  }

  await secret.destroy();
  return ctx.body(null, 204);
});

export default app;
