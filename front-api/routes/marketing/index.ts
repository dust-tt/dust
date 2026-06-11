import { createHono } from "@front-api/lib/hono";

import academy from "./academy";
import integrations from "./integrations";

// Mounted under /api/marketing.
const app = createHono();

app.route("/academy", academy);
app.route("/integrations", integrations);

export default app;
