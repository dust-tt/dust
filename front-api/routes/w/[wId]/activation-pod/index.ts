import type { GetActivationPodResponseBody } from "@app/lib/api/activation/recommendations";
import { getActivationPodInfo } from "@app/lib/api/activation/recommendations";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";

// Mounted at /api/w/:wId/activation-pod.
const app = workspaceApp();

/** @ignoreswagger */
app.get("/", async (ctx): HandlerResult<GetActivationPodResponseBody> => {
  const auth = ctx.get("auth");
  const podId = ctx.req.query("podId");

  const podInfo = await getActivationPodInfo(auth, { podId });

  return ctx.json(podInfo);
});

export default app;
