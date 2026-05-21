import { Hono } from "hono";

import validateAction from "./validate-action";
import webhook from "./webhook";

// Mounted at /api/email.
const app = new Hono();

app.route("/validate-action", validateAction);
app.route("/webhook", webhook);

export default app;
