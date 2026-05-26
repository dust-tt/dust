import { Hono } from "hono";

import hooks from "./hooks";

// Mounted at /api/v1/w/:wId/triggers. This sub-tree is mounted before
// `publicWorkspaceApp` in `app.ts` so it does not inherit `publicApiAuth` —
// the webhook endpoint uses its own URL secret-based authentication.
const app = new Hono();

app.route("/hooks", hooks);

export default app;
