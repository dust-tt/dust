import { createHono } from "@front-api/lib/hono";

import frame from "./frame";

const app = createHono();
app.route("/frame", frame);

export default app;
