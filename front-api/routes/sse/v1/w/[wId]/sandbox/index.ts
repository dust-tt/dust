import { sandboxApp } from "@front-api/middlewares/ctx";

import poller from "./poller";

// Mounted at /api/sse/v1/w/:wId/sandbox. Mirrors /api/v1/w/:wId/sandbox: mounted before the
// workspace SSE app so it does not inherit publicApiAuth, and left unauthenticated here so each
// child mounts `sandboxAuth` with the token kind it accepts.
const app = sandboxApp();

app.route("/poller", poller);

export default app;
