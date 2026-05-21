import { Hono } from "hono";

import action from "./[action]";
import actions from "./actions";
import webhooks from "./webhooks";

const app = new Hono();
// Literal-prefixed routes must be registered before the catch-all `:action`
// param, since Hono matches in registration order.
app.route("/actions", actions);
app.route("/webhooks", webhooks);
app.route("/:action", action);

export default app;
