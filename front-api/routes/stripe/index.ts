import { Hono } from "hono";

import portal from "./portal";
import webhook from "./webhook";

// Mounted at /api/stripe.
const app = new Hono();

app.route("/portal", portal);
app.route("/webhook", webhook);

export default app;
