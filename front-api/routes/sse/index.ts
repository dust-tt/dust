import { unauthedApp } from "@front-api/middlewares/ctx";

import publicFrameInvocationEventsApp from "./v1/public/frames/[token]/invocations/[invocationId]/events";
import v1WorkspaceSseApp from "./v1/w/[wId]";
import workspaceSseApp from "./w/[wId]";

// Mounted at /api/sse. SSE routes mirror the non-SSE tree (`/api/w/:wId/...`
// and `/api/v1/w/:wId/...`) so the ingress can route SSE traffic via a simple
// `/api/sse/` prefix rule. This root only dispatches to the two workspace
// subtrees, which each apply their own auth (public API key vs. session), and
// to the public Frame invocation events, which authenticate through their
// result token, so it stays unauthed.
const app = unauthedApp();

app.route(
  "/v1/public/frames/:token/invocations/:invocationId/events",
  publicFrameInvocationEventsApp
);
app.route("/v1/w/:wId", v1WorkspaceSseApp);
app.route("/w/:wId", workspaceSseApp);

export default app;
