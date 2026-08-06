import { sandboxApp } from "@front-api/middlewares/ctx";
import { sandboxAuth } from "@front-api/middlewares/sandbox_auth";
import { streamingTag } from "@front-api/middlewares/streaming";

import work from "./work";

// Mounted at /api/sse/v1/w/:wId/sandbox/poller. Only the pod's poller principal reaches this: a
// workload's invocation token is a different token kind and is refused here.
const app = sandboxApp();

app.use("*", sandboxAuth({ allowedTokenKinds: ["poller"] }));
app.use("*", streamingTag);

app.route("/work", work);

export default app;
