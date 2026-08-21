import { listPodsWithEgressPolicy } from "@app/lib/api/sandbox/admin_pods";
import type { GetEgressPolicyPodsResponseBody } from "@app/types/api/sandbox/egress_policy";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { withFeatureFlag } from "@front-api/middlewares/with_feature_flag";

// Mounted at /api/w/:wId/sandbox/egress-policy/pods. Lists the Pods that have
// their own egress policy, for the central Computer admin scope selector — so
// the dropdown only offers Pods that have diverged from the workspace
// baseline. Same gates as the bulk read.
const app = workspaceApp();

app.use("*", withFeatureFlag("sandbox_functions"));

/** @ignoreswagger */
app.get("/", async (ctx): HandlerResult<GetEgressPolicyPodsResponseBody> => {
  const auth = ctx.get("auth");

  const pods = await listPodsWithEgressPolicy(auth);
  if (pods.isErr()) {
    return apiError(ctx, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: `Failed to list Pods with an egress policy: ${pods.error.message}`,
      },
    });
  }

  return ctx.json({
    pods: pods.value.map((pod) => ({ sId: pod.sId, name: pod.name })),
  });
});

export default app;
