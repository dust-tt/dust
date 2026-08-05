import type { GetActivationPodResponseBody } from "@app/lib/api/activation/recommendations";
import { getActivationPodSId } from "@app/lib/api/activation/recommendations";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";

// Mounted at /api/w/:wId/activation-pod.
const app = workspaceApp();

/** @ignoreswagger */
app.get("/", async (ctx): HandlerResult<GetActivationPodResponseBody> => {
  const auth = ctx.get("auth");

  const podId = await getActivationPodSId(auth);

  return ctx.json({ podId });
});

export default app;
