import { createHono } from "@front-api/lib/hono";

import actionSecret from "./[actionSecret]";

const app = createHono();
app.route("/:actionSecret", actionSecret);

export default app;
