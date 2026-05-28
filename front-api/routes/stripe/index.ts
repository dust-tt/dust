import { createHono } from "@front-api/lib/hono";

import portal from "./portal";
import webhook from "./webhook";

// Mounted at /api/stripe.
const app = createHono();

app.route("/portal", portal);
app.route("/webhook", webhook);

export default app;
