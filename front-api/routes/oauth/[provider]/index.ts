import { createHono } from "@front-api/lib/hono";

import finalize from "./finalize";

const app = createHono();
app.route("/finalize", finalize);

export default app;
