import { createHono } from "@front-api/lib/hono";

import integrations from "./integrations";

// Mounted under /api/marketing.
const app = createHono();

app.route("/integrations", integrations);

export default app;
