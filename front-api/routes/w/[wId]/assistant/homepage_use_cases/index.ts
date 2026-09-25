import { listHomepageUseCases } from "@app/lib/api/homepage_use_cases";
import type { GetHomepageUseCasesResponseBody } from "@app/types/api/homepage_use_cases";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { withFeatureFlag } from "@front-api/middlewares/with_feature_flag";

import dismissals from "./dismissals";

const app = workspaceApp();

app.use("*", withFeatureFlag("discovery_homepage"));

app.route("/dismissals", dismissals);

/** @ignoreswagger */
app.get("/", async (ctx): HandlerResult<GetHomepageUseCasesResponseBody> => {
  const useCases = await listHomepageUseCases(ctx.get("auth"));

  return ctx.json({ useCases });
});

export default app;
