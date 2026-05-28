import { createHono } from "@front-api/lib/hono";

import validateAction from "./validate-action";
import webhook from "./webhook";

// Mounted at /api/email.
const app = createHono();

app.route("/validate-action", validateAction);
app.route("/webhook", webhook);

export default app;
