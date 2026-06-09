import { createHono } from "@front-api/lib/hono";

import provider from "./[provider]";

const app = createHono();
app.route("/:provider", provider);

export default app;
