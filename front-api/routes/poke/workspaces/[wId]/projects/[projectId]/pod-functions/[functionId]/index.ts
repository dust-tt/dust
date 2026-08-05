import {
  getProjectPodFunctionDetails,
  getProjectPodFunctionSource,
} from "@app/lib/api/poke/pod_functions";
import type {
  PokeGetPodFunction,
  PokeGetPodFunctionSource,
} from "@app/lib/api/poke/projects";
import { pokePodFunctionApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { withPodFunction } from "@front-api/middlewares/with_projects";

import invocations from "./invocations";

// Mounted at /api/poke/workspaces/:wId/projects/:projectId/pod-functions/:functionId.
const app = pokePodFunctionApp();

app.use("*", withPodFunction());

/** @ignoreswagger */
app.get("/", async (ctx): HandlerResult<PokeGetPodFunction> => {
  const auth = ctx.get("auth");
  const podFunction = ctx.get("podFunction");

  const details = await getProjectPodFunctionDetails(auth, podFunction);

  return ctx.json({ podFunction: details });
});

/** @ignoreswagger */
app.get("/source", async (ctx): HandlerResult<PokeGetPodFunctionSource> => {
  const auth = ctx.get("auth");
  const podFunction = ctx.get("podFunction");

  const source = await getProjectPodFunctionSource(auth, podFunction);

  return ctx.json({ source });
});

app.route("/invocations", invocations);

export default app;
