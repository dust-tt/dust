import { listHomepageUseCases } from "@app/lib/api/homepage_use_cases";
import type { GetHomepageUseCasesResponseBody } from "@app/types/api/homepage_use_cases";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";

const app = workspaceApp();

/** @ignoreswagger */
app.get("/", async (ctx): HandlerResult<GetHomepageUseCasesResponseBody> => {
  const auth = ctx.get("auth");

  if (!(await auth.hasFeatureFlag("discovery_homepage"))) {
    return apiError(ctx, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message: "The discovery_homepage feature is not enabled.",
      },
    });
  }

  const useCases = await listHomepageUseCases(auth);

  return ctx.json({ useCases });
});

export default app;
