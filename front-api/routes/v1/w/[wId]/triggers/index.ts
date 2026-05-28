import { createHono } from "@front-api/lib/hono";

import hooks from "./hooks";

// Mounted at /api/v1/w/:wId/triggers. This sub-tree is mounted before
// `publicWorkspaceApp` in `routes/v1/index.ts` so it does not inherit
// `publicApiAuth` — the webhook endpoint uses its own URL secret-based
// authentication.
const app = createHono();

app.route("/hooks", hooks);

export default app;
